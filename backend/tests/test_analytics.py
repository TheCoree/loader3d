"""Visit statistics of the public pages (app/analytics.py, routers/analytics.py, GET /api/admin/analytics)."""

import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select, update

from app import analytics
from app.models import Visit, VisitEvent, utcnow
from tests.conftest import ClientFactory, make_admin, register

CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0 Safari/537.36"
)
IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/18.0 Mobile/15E148 Safari/604.1"
)
YANDEX_BROWSER = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 "
    "YaBrowser/25.8.0.0 Safari/537.36"
)


async def _send(
    client: httpx.AsyncClient,
    visit_id: uuid.UUID,
    events: list[dict[str, Any]],
    *,
    ua: str = CHROME,
    referrer: str | None = None,
    landing: str = "/",
    engaged_ms: int = 0,
) -> None:
    response = await client.post(
        "/api/analytics/collect",
        json={
            "visitId": str(visit_id),
            "engagedMs": engaged_ms,
            "context": {"referrer": referrer, "landing": landing, "screen": 1440, "lang": "ru-RU"},
            "events": events,
        },
        headers={"user-agent": ua},
    )
    assert response.status_code == 204, response.text


@pytest.mark.parametrize(
    ("referrer", "landing", "channel", "engine"),
    [
        ("https://yandex.ru/", "/", "search", "Яндекс"),
        ("https://www.google.com/", "/", "search", "Google"),
        ("https://yandex.ru/", "/?utm_source=yandex&utm_medium=cpc&utm_term=загрузка+фуры", "ads", "Яндекс"),
        (None, "/?yclid=123", "ads", "Яндекс"),
        ("https://t.me/", "/", "social", None),
        ("https://mail.yandex.ru/", "/", "email", None),
        (None, "/?utm_source=partner&utm_campaign=launch", "campaign", None),
        ("https://logist-forum.ru/thread/1", "/", "referral", None),
        (None, "/", "direct", None),
        ("https://loader3d.test/terms", "/", "direct", None),
    ],
)
def test_where_a_visit_came_from(
    referrer: str | None, landing: str, channel: str, engine: str | None
) -> None:
    source = analytics.classify(referrer, landing, "loader3d.test")
    assert (source.channel, source.search_engine) == (channel, engine)


def test_browsers_devices_and_bots() -> None:
    assert (analytics.device_of(IPHONE), analytics.browser_of(IPHONE), analytics.os_of(IPHONE)) == (
        "mobile",
        "Safari",
        "iOS",
    )
    assert analytics.browser_of(YANDEX_BROWSER) == "Яндекс Браузер"
    assert analytics.device_of(CHROME) == "desktop"
    assert analytics.is_bot("Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)")
    assert analytics.is_bot("Mozilla/5.0 ... HeadlessChrome/140.0")
    assert analytics.is_bot("")
    assert not analytics.is_bot(YANDEX_BROWSER)
    assert analytics.clean_path(f"/plans/{uuid.uuid4()}?x=1") == "/plans/:id"


async def test_a_visit_is_recorded_without_personal_data(app: FastAPI, client: httpx.AsyncClient) -> None:
    visit_id = uuid.uuid4()
    await _send(
        client,
        visit_id,
        [{"kind": "page", "name": "/?utm_source=yandex"}, {"kind": "section", "name": "hero", "ms": 4000}],
        referrer="https://yandex.ru/",
        landing="/?utm_source=yandex&utm_medium=cpc&utm_term=план загрузки",
        engaged_ms=4000,
    )
    # The page is hidden: the last report adds time and a click.
    await _send(
        client,
        visit_id,
        [{"kind": "section", "name": "hero", "ms": 2000}, {"kind": "click", "name": "hero_register"}],
        engaged_ms=6500,
    )
    async with app.state.sessionmaker() as db:
        visit = await db.get(Visit, visit_id)
        assert visit is not None
        assert (visit.channel, visit.search_engine, visit.utm_term) == ("ads", "Яндекс", "план загрузки")
        assert (visit.landing_path, visit.pageviews, visit.engaged_ms) == ("/", 1, 6500)
        assert (visit.device, visit.browser, visit.os) == ("desktop", "Chrome", "Windows")
        assert len(visit.visitor) == 32 and "127.0.0.1" not in visit.visitor
        assert await db.scalar(select(func.count()).select_from(VisitEvent)) == 4


async def test_bots_and_disabled_statistics_are_not_recorded(app: FastAPI, client: httpx.AsyncClient) -> None:
    await _send(client, uuid.uuid4(), [{"kind": "page", "name": "/"}], ua="curl/8.0")
    app.state.settings.analytics_enabled = False
    try:
        await _send(client, uuid.uuid4(), [{"kind": "page", "name": "/"}])
    finally:
        app.state.settings.analytics_enabled = True
    async with app.state.sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(Visit)) == 0


async def test_the_report(app: FastAPI, make_client: ClientFactory) -> None:
    public = await make_client()
    # Three visits: from Yandex with a registration, from Telegram on a phone, a bounce.
    yandex, telegram, bounce = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await _send(
        public,
        yandex,
        [
            {"kind": "page", "name": "/"},
            {"kind": "section", "name": "hero", "ms": 5000},
            {"kind": "section", "name": "pricing", "ms": 20000},
            {"kind": "click", "name": "pricing_pro"},
            {"kind": "page", "name": "/register"},
            {"kind": "signup", "name": "free"},
        ],
        referrer="https://yandex.ru/",
        engaged_ms=90_000,
    )
    await _send(
        public,
        telegram,
        [{"kind": "page", "name": "/"}, {"kind": "section", "name": "hero", "ms": 8000}],
        ua=IPHONE,
        referrer="https://t.me/",
        engaged_ms=40_000,
    )
    await _send(
        public, bounce, [{"kind": "page", "name": "/"}, {"kind": "section", "name": "hero", "ms": 500}]
    )
    # A visit of the period before (8 days ago) only counts in `previous`.
    old = uuid.uuid4()
    await _send(public, old, [{"kind": "page", "name": "/"}])
    async with app.state.sessionmaker() as db:
        await db.execute(update(Visit).where(Visit.id == old).values(started_at=utcnow() - timedelta(days=8)))
        await db.commit()

    admin = await make_client()
    await register(admin, "admin@example.com")
    await make_admin(app, "admin@example.com")
    assert (await public.get("/api/admin/analytics")).status_code == 401
    response = await admin.get("/api/admin/analytics", params={"days": 7})
    assert response.status_code == 200, response.text
    report = response.json()

    summary = report["summary"]
    assert (summary["visits"], summary["pageviews"], summary["signups"]) == (3, 4, 1)
    assert summary["bounceRate"] == pytest.approx(1 / 3)
    assert summary["conversion"] == pytest.approx(1 / 3)
    assert summary["avgEngagedMs"] == round((90_000 + 40_000) / 3)
    assert report["previous"]["visits"] == 1
    assert len(report["daily"]) == 7 and sum(d["visits"] for d in report["daily"]) == 3

    channels = {c["key"]: c for c in report["channels"]}
    assert channels["search"]["visits"] == 1 and channels["search"]["signups"] == 1
    assert channels["social"]["visits"] == 1 and channels["direct"]["visits"] == 1
    assert [e["key"] for e in report["searchEngines"]] == ["Яндекс"]
    assert {d["key"] for d in report["devices"]} == {"desktop", "mobile"}
    assert {p["path"]: p["views"] for p in report["pages"]} == {"/": 3, "/register": 1}

    sections = {s["section"]: s for s in report["sections"]}
    assert report["landingVisits"] == 3
    assert sections["hero"]["visits"] == 2  # the bounce saw it for half a second: not counted
    assert sections["hero"]["avgMs"] == 6500
    assert sections["pricing"]["reach"] == pytest.approx(1 / 3)
    assert report["clicks"] == [{"name": "pricing_pro", "clicks": 1, "visits": 1}]
    assert sum(d["visits"] for d in report["durations"]) == 3


async def test_old_visits_are_pruned(app: FastAPI, client: httpx.AsyncClient) -> None:
    old, fresh = uuid.uuid4(), uuid.uuid4()
    for visit_id in (old, fresh):
        await _send(client, visit_id, [{"kind": "page", "name": "/"}])
    async with app.state.sessionmaker() as db:
        await db.execute(
            update(Visit).where(Visit.id == old).values(started_at=utcnow() - timedelta(days=500))
        )
        await db.commit()
        assert await analytics.prune(db, app.state.settings, utcnow()) == 1
        assert await db.scalar(select(func.count()).select_from(Visit)) == 1
        assert await db.scalar(select(func.count()).select_from(VisitEvent)) == 1


async def test_one_address_cannot_flood_the_statistics(
    app: FastAPI, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import analytics as collect_router

    # Events of one visit stop at the cap.
    monkeypatch.setattr(collect_router, "MAX_EVENTS_PER_VISIT", 5)
    visit_id = uuid.uuid4()
    await _send(client, visit_id, [{"kind": "click", "name": f"b{i}"} for i in range(4)])
    await _send(client, visit_id, [{"kind": "click", "name": f"c{i}"} for i in range(4)])
    async with app.state.sessionmaker() as db:
        events = await db.scalar(
            select(func.count()).select_from(VisitEvent).where(VisitEvent.visit_id == visit_id)
        )
    assert events == 4

    # New visits from one address stop at the hourly limit.
    monkeypatch.setattr(
        collect_router, "NEW_VISITS_PER_IP", collect_router.RateLimiter(3, timedelta(hours=1))
    )
    for _ in range(5):
        await _send(client, uuid.uuid4(), [{"kind": "page", "name": "/"}])
    async with app.state.sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(Visit)) == 1 + 3


async def test_api_docs_only_in_development(tmp_path: Path) -> None:
    from app.main import create_app
    from tests.conftest import TEST_JWT_SECRET, make_settings

    for environment, expected in (("development", 200), ("production", 404)):
        settings = make_settings(tmp_path, environment=environment, jwt_secret=TEST_JWT_SECRET)
        app = create_app(settings)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            assert (await c.get("/api/openapi.json")).status_code == expected
            assert (await c.get("/api/docs")).status_code == expected
