"""The owner's phone widget (tools/scriptable/loader3d-widget.js): whether the site works and how loaded it
is, who is online, signups and revenue by day. Aggregates only: no email, name, IP or id leaves here.

The key is a random `l3dw_…` from `python -m app widget-key`, sent as `Authorization: Bearer` (never in the
URL, which ends up in logs and histories). The server keeps only its SHA-256 (WIDGET_KEY_SHA256): with 256
random bits a fast hash is enough — there is nothing to guess, and a copy of .env does not open the widget.
The key does not touch the database, so the widget still learns that the database is down.
"""

import hashlib
import hmac
import logging
import math
import secrets
import time
import uuid
from asyncio import timeout
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics import LIVE_WINDOW, MOSCOW
from app.config import Settings
from app.metrics import LATENCY_SECONDS, Activity, RequestStats, system_load
from app.models import AuthSession, Lead, Payment, User, Visit, utcnow
from app.schemas.widget import (
    WidgetData,
    WidgetDay,
    WidgetIssue,
    WidgetLoad,
    WidgetOnline,
    WidgetPeriod,
    WidgetStatsOut,
    WidgetTotals,
)

logger = logging.getLogger(__name__)

KEY_PREFIX = "l3dw_"
# Keys shorter or longer than this are not even hashed.
KEY_LENGTH = range(32, 201)

DAYS = 14
WEEK = 7
# The numbers from the database are computed again at most this often (seconds); the widget asks every
# 15 minutes or so, the app on the phone when it is opened.
DATA_TTL = 30.0
# Longer than this, and the database counts as down.
DB_TIMEOUT = 5.0
SLOW_DB_MS = 500
SLOW_P95_MS = 2000
# The percentile of fewer requests says nothing.
P95_MIN_REQUESTS = 20
# A 5xx within this time keeps the status «degraded».
ERRORS_SECONDS = 15 * 60
# More runnable work than cores; memory and disk almost full.
HIGH_CPU = 1.0
HIGH_SHARE = 0.9


def new_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def key_matches(hashes: list[str], key: str) -> bool:
    """Constant time for any key of a valid length, whichever of the hashes it matches."""
    if len(key) not in KEY_LENGTH:
        return False
    digest = key_hash(key)
    matched = False
    for expected in hashes:
        matched |= hmac.compare_digest(digest, expected)
    return matched


@dataclass(slots=True)
class WidgetCache:
    """The last numbers from the database (one per app, `app.state.widget_cache`)."""

    data: WidgetData | None = None
    computed: float = -math.inf


def _period(days: list[WidgetDay], analytics: bool) -> WidgetPeriod:
    return WidgetPeriod(
        signups=sum(d.signups for d in days),
        revenue=sum(d.revenue for d in days),
        payments=sum(d.payments for d in days),
        visitors=sum(d.visitors or 0 for d in days) if analytics else None,
    )


async def _data(db: AsyncSession, settings: Settings, active: set[uuid.UUID], now: datetime) -> WidgetData:
    today = now.astimezone(MOSCOW).date()
    first = today - timedelta(days=DAYS - 1)
    since = datetime.combine(first, datetime.min.time(), MOSCOW)
    analytics = settings.analytics_enabled
    days: dict[Any, dict[str, int]] = {
        first + timedelta(days=i): {"signups": 0, "revenue": 0, "payments": 0, "visitors": 0}
        for i in range(DAYS)
    }

    def add(at: datetime, field: str, value: int = 1) -> None:
        day = days.get(at.astimezone(MOSCOW).date())
        if day is not None:
            day[field] += value

    for created_at in await db.scalars(select(User.created_at).where(User.created_at >= since)):
        add(created_at, "signups")
    paid = await db.execute(
        select(Payment.paid_at, Payment.amount).where(Payment.status == "paid", Payment.paid_at >= since)
    )
    for paid_at, amount in paid:
        add(paid_at, "revenue", amount)
        add(paid_at, "payments")
    guests = None
    if analytics:
        # The hash of a visitor changes every Moscow day (app/analytics.py visitor_hash): one row per
        # visitor and day.
        visitors = await db.execute(
            select(func.min(Visit.started_at)).where(Visit.started_at >= since).group_by(Visit.visitor)
        )
        for (started_at,) in visitors:
            add(started_at, "visitors")
        guests = await db.scalar(
            select(func.count()).select_from(Visit).where(Visit.last_seen_at >= now - LIVE_WINDOW)
        )

    # Requests seen by this process, and logins and token refreshes (also by another process, or before
    # a restart) — they move `last_used_at`.
    refreshed = await db.scalars(
        select(AuthSession.user_id)
        .where(AuthSession.last_used_at >= now - LIVE_WINDOW, AuthSession.revoked_at.is_(None))
        .distinct()
    )
    online = active | set(refreshed)

    series = [
        WidgetDay(date=day, **values | ({} if analytics else {"visitors": None}))
        for day, values in days.items()
    ]
    return WidgetData(
        computed_at=now,
        online=WidgetOnline(users=len(online), guests=guests),
        week=_period(series[-WEEK:], analytics),
        previous_week=_period(series[-2 * WEEK : -WEEK], analytics),
        days=series,
        totals=WidgetTotals(
            users=await db.scalar(select(func.count()).select_from(User)) or 0,
            new_leads=await db.scalar(select(func.count()).select_from(Lead).where(Lead.status == "new"))
            or 0,
            pending_payments=await db.scalar(
                select(func.count()).select_from(Payment).where(Payment.status == "pending")
            )
            or 0,
        ),
    )


def _issues(db_ms: float | None, requests: RequestStats, load: WidgetLoad) -> list[WidgetIssue]:
    issues: list[WidgetIssue] = []
    if db_ms is None:
        issues.append("db_down")
    elif db_ms > SLOW_DB_MS:
        issues.append("db_slow")
    if requests.errors(ERRORS_SECONDS):
        issues.append("server_errors")
    if (
        load.p95_ms is not None
        and load.p95_ms > SLOW_P95_MS
        and requests.requests(LATENCY_SECONDS) >= P95_MIN_REQUESTS
    ):
        issues.append("slow_responses")
    if load.cpu is not None and load.cpu > HIGH_CPU:
        issues.append("high_cpu")
    if load.memory is not None and load.memory > HIGH_SHARE:
        issues.append("high_memory")
    if load.disk is not None and load.disk > HIGH_SHARE:
        issues.append("low_disk")
    return issues


async def stats(state: Any, settings: Settings) -> WidgetStatsOut:
    """`state` — the app's state: sessionmaker, request_stats, activity, widget_cache."""
    cache: WidgetCache = state.widget_cache
    requests: RequestStats = state.request_stats
    activity: Activity = state.activity
    now = utcnow()
    db_ms = None
    try:
        async with timeout(DB_TIMEOUT), state.sessionmaker() as db:
            started = time.perf_counter()
            await db.execute(text("SELECT 1"))
            db_ms = round((time.perf_counter() - started) * 1000, 1)
            if time.monotonic() - cache.computed >= DATA_TTL:
                cache.data = await _data(db, settings, activity.recent(), now)
                cache.computed = time.monotonic()
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        logger.warning("widget: the database did not answer: %r", exc)
        db_ms = None

    system = system_load()
    load = WidgetLoad(
        requests_per_minute=requests.requests(60),
        requests_series=requests.per_minute(30),
        p95_ms=requests.p95_ms(),
        errors_last_hour=requests.errors(60 * 60),
        db_ms=db_ms,
        cpu=system.cpu,
        memory=system.memory,
        disk=system.disk,
        uptime_seconds=requests.uptime(),
    )
    issues = _issues(db_ms, requests, load)
    return WidgetStatsOut(
        status="down" if db_ms is None else "degraded" if issues else "ok",
        issues=issues,
        generated_at=now,
        db_ok=db_ms is not None,
        payments_enabled=settings.tiers_enabled and settings.payment_provider != "none",
        load=load,
        data=cache.data,
    )
