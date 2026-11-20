"""Visit statistics of the public pages (routers/analytics.py collects, the admin panel reads the report).

The browser (src/lib/analytics.ts) reports, for one page load of a visitor who is not signed in: the
pages it opened, the time spent in the sections of the landing page, clicks on marked buttons and a
registration. Nothing identifies the person: no cookies, no local storage; the server keeps a daily
salted hash of the IP and the user agent (unique visitors per day), the referrer's host only, and the
browser, system and device by name.

Search engines do not pass the search query any more: the report shows the engine; queries are in
Яндекс.Вебмастер and Google Search Console, the keywords of ads — in utm_term.
"""

import hashlib
import re
import uuid
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Visit, VisitEvent

MOSCOW = timezone(timedelta(hours=3), "MSK")
# A visit shorter than this with one page and no click is a bounce.
BOUNCE_MS = 10_000
# Time in a section counts as «seen» from this much.
SECTION_SEEN_MS = 1_000
# Longer engagement in one visit is an open tab, not reading.
MAX_ENGAGED_MS = 2 * 60 * 60 * 1000

CHANNEL_NAMES: dict[str, str] = {
    "search": "Поиск",
    "ads": "Реклама",
    "social": "Соцсети и мессенджеры",
    "email": "Почта",
    "campaign": "Кампании (utm)",
    "referral": "Другие сайты",
    "direct": "Прямые заходы",
}

# Reports come from a script on the page, so link previews do not send them; this drops headless browsers
# and checkers. In-app browsers of Telegram, WhatsApp and VK are people and are kept.
_BOT = re.compile(
    r"bot\b|bot/|crawl|spider|slurp|headless|lighthouse|pagespeed|python|curl|wget|httpx|okhttp|"
    r"go-http|java/|phantomjs|selenium|puppeteer|playwright|mediapartners|uptime|monitoring",
    re.IGNORECASE,
)
_SEARCH: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|\.)(yandex\.[a-z.]+|ya\.ru)$"), "Яндекс"),
    (re.compile(r"(^|\.)google\.[a-z.]+$"), "Google"),
    (re.compile(r"(^|\.)bing\.com$"), "Bing"),
    (re.compile(r"(^|\.)duckduckgo\.com$"), "DuckDuckGo"),
    (re.compile(r"^go\.mail\.ru$|(^|\.)search\.mail\.ru$"), "Mail.ru"),
    (re.compile(r"(^|\.)search\.yahoo\.com$"), "Yahoo"),
    (re.compile(r"(^|\.)rambler\.ru$"), "Rambler"),
]
_MAIL_HOSTS = re.compile(
    r"^(mail\.yandex\.[a-z.]+|e\.mail\.ru|mail\.google\.com|outlook\.(live|office)\.com)$"
)
_SOCIAL = re.compile(
    r"(^|\.)(t\.me|telegram\.(org|me)|vk\.(com|ru)|ok\.ru|youtube\.com|youtu\.be|dzen\.ru|instagram\.com|"
    r"facebook\.com|fb\.com|x\.com|twitter\.com|t\.co|linkedin\.com|whatsapp\.com|wa\.me|pinterest\.[a-z]+|"
    r"reddit\.com|habr\.com|vc\.ru|pikabu\.ru)$"
)
_PAID_MEDIUMS = {"cpc", "ppc", "paid", "cpm", "cpa", "cpv", "display", "ads", "banner", "paid_social"}
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)


def is_bot(user_agent: str) -> bool:
    return not user_agent or bool(_BOT.search(user_agent))


def device_of(ua: str) -> str:
    if re.search(r"iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))", ua):
        return "tablet"
    if re.search(r"Mobi|iPhone|iPod|Android|Windows Phone", ua):
        return "mobile"
    return "desktop"


def browser_of(ua: str) -> str:
    for pattern, name in (
        (r"YaBrowser|YaSearchBrowser", "Яндекс Браузер"),
        (r"Edg(e|A|iOS)?/", "Edge"),
        (r"OPR/|Opera", "Opera"),
        (r"SamsungBrowser", "Samsung Internet"),
        (r"Firefox|FxiOS", "Firefox"),
        (r"Chrome|CriOS", "Chrome"),
        (r"Safari", "Safari"),
    ):
        if re.search(pattern, ua):
            return name
    return "Другой"


def os_of(ua: str) -> str:
    for pattern, name in (
        (r"Windows", "Windows"),
        (r"iPhone|iPad|iPod", "iOS"),
        (r"Android", "Android"),
        (r"Mac OS X|Macintosh", "macOS"),
        (r"CrOS", "ChromeOS"),
        (r"Linux", "Linux"),
    ):
        if re.search(pattern, ua):
            return name
    return "Другая"


def visitor_hash(settings: Settings, ip: str, user_agent: str, day: date) -> str:
    """Unique per visitor and day; the salt (the day and JWT_SECRET) makes it useless to reverse."""
    salt = f"{day.isoformat()}:{settings.jwt_secret.get_secret_value()}"
    return hashlib.sha256(f"{salt}|{ip}|{user_agent}".encode()).hexdigest()[:32]


def _host(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return None
    return host.removeprefix("www.") or None


@dataclass(frozen=True, slots=True)
class Source:
    channel: str
    referrer_host: str | None
    search_engine: str | None
    utm: dict[str, str | None]


def classify(referrer: str | None, landing: str, own_host: str | None) -> Source:
    """Where a visit came from: the referrer (another site's) and the utm/click ids of the first page."""
    query = parse_qs(urlsplit(landing).query)

    def param(name: str) -> str | None:
        values = query.get(name)
        return values[0][:200].strip() or None if values else None

    utm = {key: param(f"utm_{key}") for key in ("source", "medium", "campaign", "term", "content")}
    host = _host(referrer)
    if host and own_host and (host == own_host or host.endswith(f".{own_host}")):
        host = None
    engine = next((name for pattern, name in _SEARCH if host and pattern.search(host)), None)
    medium = (utm["medium"] or "").lower()
    if medium in _PAID_MEDIUMS or param("yclid") or param("gclid"):
        channel = "ads"
        engine = engine or ("Яндекс" if param("yclid") else "Google" if param("gclid") else None)
    elif medium == "email" or (host and _MAIL_HOSTS.search(host)):
        channel = "email"
    elif engine:
        channel = "search"
    elif host and _SOCIAL.search(host):
        channel = "social"
    elif utm["source"]:
        channel = "campaign"
    elif host:
        channel = "referral"
    else:
        channel = "direct"
    if channel not in ("search", "ads"):
        engine = None
    return Source(channel=channel, referrer_host=host, search_engine=engine, utm=utm)


def clean_path(path: str) -> str:
    """The path of a page without the query and with ids replaced, for counting pages together."""
    path = urlsplit(path).path or "/"
    return _UUID.sub(":id", path)[:200]


async def record(
    db: AsyncSession,
    settings: Settings,
    *,
    visit_id: uuid.UUID,
    ip: str,
    user_agent: str,
    own_host: str | None,
    context: dict[str, Any],
    engaged_ms: int,
    events: Iterable[dict[str, Any]],
    now: datetime,
) -> bool:
    """Saves a report of the browser; False if it is a bot's. The caller commits."""
    if is_bot(user_agent):
        return False
    visit = await db.get(Visit, visit_id)
    if visit is None:
        landing = str(context.get("landing") or "/")
        source = classify(context.get("referrer"), landing, own_host)
        visit = Visit(
            id=visit_id,
            visitor=visitor_hash(settings, ip, user_agent, now.astimezone(MOSCOW).date()),
            started_at=now,
            last_seen_at=now,
            landing_path=clean_path(landing),
            referrer_host=source.referrer_host,
            channel=source.channel,
            search_engine=source.search_engine,
            utm_source=source.utm["source"],
            utm_medium=source.utm["medium"],
            utm_campaign=source.utm["campaign"],
            utm_term=source.utm["term"],
            utm_content=source.utm["content"],
            device=device_of(user_agent),
            browser=browser_of(user_agent),
            os=os_of(user_agent),
            screen_width=context.get("screen"),
            language=(context.get("lang") or None),
            pageviews=0,
            engaged_ms=0,
        )
        db.add(visit)
    visit.last_seen_at = now
    visit.engaged_ms = min(max(visit.engaged_ms, engaged_ms), MAX_ENGAGED_MS)
    for event in events:
        kind, name = event["kind"], str(event["name"])[:200]
        if kind == "page":
            visit.pageviews += 1
            name = clean_path(name)
        elif kind == "signup":
            visit.signed_up = True
        db.add(VisitEvent(visit_id=visit_id, at=now, kind=kind, name=name, value=event.get("ms")))
    return True


async def prune(db: AsyncSession, settings: Settings, now: datetime) -> int:
    """Deletes visits older than ANALYTICS_RETENTION_DAYS (their events go with them)."""
    cutoff = now - timedelta(days=settings.analytics_retention_days)
    old = select(Visit.id).where(Visit.started_at < cutoff)
    await db.execute(delete(VisitEvent).where(VisitEvent.visit_id.in_(old)))
    result = await db.execute(delete(Visit).where(Visit.started_at < cutoff))
    await db.commit()
    return result.rowcount or 0  # type: ignore[attr-defined]


# --- The report ------------------------------------------------------------------------------------


@dataclass(slots=True)
class _Row:
    id: uuid.UUID
    visitor: str
    started_at: datetime
    landing_path: str
    referrer_host: str | None
    channel: str
    search_engine: str | None
    utm_source: str | None
    utm_campaign: str | None
    utm_term: str | None
    device: str
    browser: str
    os: str
    pageviews: int
    engaged_ms: int
    signed_up: bool


def _summary(rows: list[_Row], clicked: set[uuid.UUID]) -> dict[str, Any]:
    visits = len(rows)
    durations = sorted(r.engaged_ms for r in rows)
    bounces = sum(1 for r in rows if r.pageviews <= 1 and r.engaged_ms < BOUNCE_MS and r.id not in clicked)
    signups = sum(1 for r in rows if r.signed_up)
    return {
        "visits": visits,
        "visitors": len({(r.visitor, r.started_at.astimezone(MOSCOW).date()) for r in rows}),
        "pageviews": sum(r.pageviews for r in rows),
        "avg_engaged_ms": round(sum(durations) / visits) if visits else 0,
        "median_engaged_ms": durations[visits // 2] if visits else 0,
        "bounce_rate": bounces / visits if visits else 0,
        "signups": signups,
        "conversion": signups / visits if visits else 0,
    }


def _breakdown(rows: list[_Row], key: Any, limit: int = 20) -> list[dict[str, Any]]:
    """Visits, registrations and the average time by `key(row)` (None — not counted), largest first."""
    visits: Counter[str] = Counter()
    signups: Counter[str] = Counter()
    engaged: Counter[str] = Counter()
    for r in rows:
        value = key(r)
        if value is None:
            continue
        visits[value] += 1
        signups[value] += r.signed_up
        engaged[value] += r.engaged_ms
    return [
        {"key": k, "visits": n, "signups": signups[k], "avg_engaged_ms": round(engaged[k] / n)}
        for k, n in visits.most_common(limit)
    ]


DURATION_BUCKETS: list[tuple[str, int]] = [
    ("до 10 с", 10_000),
    ("10–30 с", 30_000),
    ("30 с – 1 мин", 60_000),
    ("1–3 мин", 180_000),
    ("3–10 мин", 600_000),
    ("больше 10 мин", MAX_ENGAGED_MS + 1),
]


async def _rows(db: AsyncSession, since: datetime, until: datetime) -> list[_Row]:
    result = await db.execute(
        select(
            Visit.id,
            Visit.visitor,
            Visit.started_at,
            Visit.landing_path,
            Visit.referrer_host,
            Visit.channel,
            Visit.search_engine,
            Visit.utm_source,
            Visit.utm_campaign,
            Visit.utm_term,
            Visit.device,
            Visit.browser,
            Visit.os,
            Visit.pageviews,
            Visit.engaged_ms,
            Visit.signed_up,
        ).where(Visit.started_at >= since, Visit.started_at < until)
    )
    return [_Row(*row) for row in result.all()]


async def report(db: AsyncSession, days: int, now: datetime) -> dict[str, Any]:
    """Everything the «Посещаемость» tab shows for the last `days` days (Moscow dates), with the same
    figures of the period before for comparison."""
    today = now.astimezone(MOSCOW).date()
    start_day = today - timedelta(days=days - 1)
    since = datetime.combine(start_day, datetime.min.time(), MOSCOW)
    previous_since = since - timedelta(days=days)
    rows = await _rows(db, since, now + timedelta(seconds=1))
    previous = await _rows(db, previous_since, since)

    # Events of the period, summed per visit.
    events = await db.execute(
        select(
            VisitEvent.kind, VisitEvent.name, VisitEvent.visit_id, func.count(), func.sum(VisitEvent.value)
        )
        .join(Visit, Visit.id == VisitEvent.visit_id)
        .where(Visit.started_at >= previous_since)
        .group_by(VisitEvent.kind, VisitEvent.name, VisitEvent.visit_id)
    )
    current_ids = {r.id for r in rows}
    page_views: Counter[str] = Counter()
    page_visits: Counter[str] = Counter()
    section_time: dict[str, list[int]] = defaultdict(list)
    click_count: Counter[str] = Counter()
    click_visits: Counter[str] = Counter()
    clicked: set[uuid.UUID] = set()
    landing_visits: set[uuid.UUID] = set()
    for kind, name, visit_id, count, total in events.all():
        if kind == "click":
            clicked.add(visit_id)
        if visit_id not in current_ids:
            continue
        if kind == "page":
            page_views[name] += count
            page_visits[name] += 1
            if name == "/" or name == "/pricing":
                landing_visits.add(visit_id)
        elif kind == "section" and (total or 0) >= SECTION_SEEN_MS:
            section_time[name].append(min(int(total), MAX_ENGAGED_MS))
        elif kind == "click":
            click_count[name] += count
            click_visits[name] += 1

    daily: dict[date, dict[str, Any]] = {
        start_day + timedelta(days=i): {"visits": 0, "visitors": set(), "signups": 0} for i in range(days)
    }
    for r in rows:
        day = daily.get(r.started_at.astimezone(MOSCOW).date())
        if day is not None:
            day["visits"] += 1
            day["visitors"].add(r.visitor)
            day["signups"] += r.signed_up

    durations: Counter[str] = Counter()
    for r in rows:
        durations[next(label for label, limit in DURATION_BUCKETS if r.engaged_ms < limit)] += 1

    landing_total = len(landing_visits)
    return {
        "days": days,
        "since": since,
        "summary": _summary(rows, clicked),
        "previous": _summary(previous, clicked),
        "daily": [
            {"date": d, "visits": v["visits"], "visitors": len(v["visitors"]), "signups": v["signups"]}
            for d, v in daily.items()
        ],
        "channels": _breakdown(rows, lambda r: r.channel),
        "sources": _breakdown(rows, lambda r: r.utm_source or r.referrer_host),
        "search_engines": _breakdown(rows, lambda r: r.search_engine),
        "campaigns": _breakdown(
            rows, lambda r: f"{r.utm_source or '—'} / {r.utm_campaign}" if r.utm_campaign else None
        ),
        "keywords": _breakdown(rows, lambda r: r.utm_term),
        "entry_pages": _breakdown(rows, lambda r: r.landing_path),
        "devices": _breakdown(rows, lambda r: r.device),
        "browsers": _breakdown(rows, lambda r: r.browser),
        "systems": _breakdown(rows, lambda r: r.os),
        "durations": [{"label": label, "visits": durations[label]} for label, _ in DURATION_BUCKETS],
        "pages": [
            {"path": path, "views": views, "visits": page_visits[path]}
            for path, views in page_views.most_common(20)
        ],
        "landing_visits": landing_total,
        "sections": [
            {
                "section": section,
                "visits": len(times),
                "reach": len(times) / landing_total if landing_total else 0,
                "avg_ms": round(sum(times) / len(times)),
            }
            for section, times in section_time.items()
        ],
        "clicks": [
            {"name": name, "clicks": count, "visits": click_visits[name]}
            for name, count in click_count.most_common(20)
        ],
    }
