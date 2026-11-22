"""The owner's phone widget: GET /api/widget/stats (app/widget.py, routers/widget.py, app/metrics.py)."""

import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import update

from app import metrics, widget
from app.analytics import MOSCOW
from app.config import Settings
from app.db import create_engine, create_sessionmaker
from app.metrics import Activity, RequestStats
from app.models import AuthSession, Lead, Payment, Visit, utcnow
from tests.conftest import ClientFactory, error_code, make_settings, register

KEY = widget.new_key()
OTHER_KEY = widget.new_key()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, widget_key_sha256=f"{widget.key_hash(OTHER_KEY)},{widget.key_hash(KEY)}")


def _auth(key: str = KEY) -> dict[str, str]:
    return {"authorization": f"Bearer {key}"}


async def _stats(client: httpx.AsyncClient, key: str = KEY) -> dict[str, Any]:
    response = await client.get("/api/widget/stats", headers=_auth(key))
    assert response.status_code == 200, response.text
    return response.json()


async def _add(app: FastAPI, *rows: object) -> None:
    async with app.state.sessionmaker() as db:
        db.add_all(rows)
        await db.commit()


def _payment(amount: int, status: str = "paid", days_ago: int = 0) -> Payment:
    at = utcnow() - timedelta(days=days_ago)
    return Payment(
        email="payer@example.com",
        tier="pro",
        period="month",
        amount=amount,
        status=status,
        provider="test",
        created_at=at,
        paid_at=at if status == "paid" else None,
    )


def _visit(visitor: str, minutes_ago: int = 0) -> Visit:
    at = utcnow() - timedelta(minutes=minutes_ago)
    return Visit(
        id=uuid.uuid4(),
        visitor=visitor,
        started_at=at,
        last_seen_at=at,
        landing_path="/",
        channel="direct",
        device="mobile",
        browser="Safari",
        os="iOS",
    )


# --- the key -------------------------------------------------------------------------------------


def test_keys() -> None:
    assert KEY.startswith("l3dw_") and len(KEY) >= 40
    assert widget.new_key() != KEY
    hashes = [widget.key_hash(KEY)]
    assert widget.key_matches(hashes, KEY)
    assert not widget.key_matches(hashes, OTHER_KEY)
    assert not widget.key_matches(hashes, "")
    assert not widget.key_matches(hashes, KEY + "x" * 300)


def test_settings_take_hashes_only(tmp_path: Path) -> None:
    digest = widget.key_hash(KEY)
    assert make_settings(tmp_path, widget_key_sha256=f" {digest.upper()} , ").widget_key_sha256 == [digest]
    assert make_settings(tmp_path).widget_key_sha256 == []
    with pytest.raises(ValidationError, match="not the key itself"):
        make_settings(tmp_path, widget_key_sha256=KEY)


async def test_off_without_a_key(tmp_path: Path) -> None:
    from app.main import create_app

    app = create_app(make_settings(tmp_path))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/widget/stats", headers=_auth())
    # Exactly what an unknown path answers.
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


async def test_needs_the_key_in_the_header(client: httpx.AsyncClient) -> None:
    for headers in ({}, {"authorization": "Basic " + KEY}, _auth("l3dw_" + "a" * 43), {"x-widget-key": KEY}):
        response = await client.get("/api/widget/stats", headers=headers)
        assert response.status_code == 401
        assert error_code(response) == "invalid_widget_key"
    # Not in the URL: it would stay in logs.
    response = await client.get("/api/widget/stats", params={"key": KEY})
    assert response.status_code == 401
    # Either of the configured keys works.
    assert (await client.get("/api/widget/stats", headers=_auth(OTHER_KEY))).status_code == 200


async def test_wrong_keys_are_limited(client: httpx.AsyncClient) -> None:
    for _ in range(10):
        assert (await client.get("/api/widget/stats", headers=_auth(OTHER_KEY[::-1]))).status_code == 401
    response = await client.get("/api/widget/stats", headers=_auth())
    # Even the right key waits: guessing from this address stops for a while.
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


async def test_calls_are_limited(client: httpx.AsyncClient) -> None:
    for _ in range(30):
        await _stats(client)
    assert (await client.get("/api/widget/stats", headers=_auth())).status_code == 429


# --- what it tells ---------------------------------------------------------------------------------


async def test_stats(app: FastAPI, make_client: ClientFactory) -> None:
    anna, boris = await make_client(), await make_client()
    await register(anna, "anna@example.com", displayName="Анна Секретова")
    await register(boris, "boris@example.com")
    await _add(
        app,
        _payment(990),
        _payment(1990, days_ago=8),
        _payment(490, status="pending"),
        _payment(9900, status="canceled"),
        _payment(5000, days_ago=20),
        Lead(name="Лид", email="lead@example.com"),
        _visit("v1"),
        _visit("v1"),
        _visit("v2", minutes_ago=30),
    )
    response = await anna.get("/api/widget/stats", headers=_auth())
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()

    # Aggregates only: no address, name or id of anybody.
    for secret in ("@example.com", "Анна", "Секретова", "Лид", "payer"):
        assert secret not in response.text
    assert body["status"] in ("ok", "degraded")
    assert body["dbOk"] is True
    assert body["paymentsEnabled"] is False

    data = body["data"]
    assert data["online"] == {"users": 2, "guests": 2}
    assert data["week"] == {"signups": 2, "revenue": 990, "payments": 1, "visitors": 2}
    assert data["previousWeek"] == {"signups": 0, "revenue": 1990, "payments": 1, "visitors": 0}
    assert data["totals"] == {"users": 2, "newLeads": 1, "pendingPayments": 1}
    days = data["days"]
    assert len(days) == widget.DAYS
    assert days[-1]["date"] == utcnow().astimezone(MOSCOW).date().isoformat()
    assert days[-1]["revenue"] == 990 and days[-1]["signups"] == 2

    load = body["load"]
    assert load["dbMs"] is not None and load["dbMs"] >= 0
    assert len(load["requestsSeries"]) == 30
    assert load["uptimeSeconds"] >= 0
    for share in ("cpu", "memory", "disk"):
        assert load[share] is None or load[share] >= 0


async def test_online_is_who_made_a_request_lately(app: FastAPI, make_client: ClientFactory) -> None:
    anna, boris = await make_client(), await make_client()
    await register(anna, "anna@example.com")
    await register(boris, "boris@example.com")
    async with app.state.sessionmaker() as db:
        await db.execute(update(AuthSession).values(last_used_at=utcnow() - timedelta(hours=1)))
        await db.commit()
    # Anna is working; Boris logged in an hour ago and has been quiet since.
    assert (await anna.get("/api/users/me")).status_code == 200
    assert (await _stats(anna))["data"]["online"]["users"] == 1


async def test_without_visit_statistics(app: FastAPI, client: httpx.AsyncClient) -> None:
    app.state.settings = app.state.settings.model_copy(update={"analytics_enabled": False})
    data = (await _stats(client))["data"]
    assert data["online"]["guests"] is None
    assert data["week"]["visitors"] is None
    assert data["days"][0]["visitors"] is None


async def test_payments_enabled(app: FastAPI, client: httpx.AsyncClient) -> None:
    app.state.settings = app.state.settings.model_copy(
        update={"tiers_enabled": True, "payment_provider": "test"}
    )
    assert (await _stats(client))["paymentsEnabled"] is True


async def test_database_down(app: FastAPI, client: httpx.AsyncClient, tmp_path: Path) -> None:
    before = await _stats(client)
    assert before["dbOk"] is True
    broken = create_engine(f"sqlite+aiosqlite:///{(tmp_path / 'missing' / 'db.sqlite').as_posix()}")
    app.state.sessionmaker = create_sessionmaker(broken)
    try:
        after = await _stats(client)
    finally:
        await broken.dispose()
    # The key does not need the database: the widget learns that it is down, with the last numbers.
    assert after["status"] == "down"
    assert after["dbOk"] is False
    assert "db_down" in after["issues"]
    assert after["load"]["dbMs"] is None
    assert after["data"] == before["data"]


async def test_requests_are_counted(client: httpx.AsyncClient) -> None:
    for _ in range(3):
        assert (await client.get("/api/health")).status_code == 200
    await client.get("/api/billing")
    await client.get("/api/users/me")  # 401 is a request too
    body = await _stats(client)
    # Neither the healthcheck nor the widget itself.
    assert body["load"]["requestsPerMinute"] == 2
    assert body["load"]["requestsSeries"][-1] == 2
    assert body["load"]["errorsLastHour"] == 0


# --- app/metrics.py --------------------------------------------------------------------------------


def test_request_stats() -> None:
    stats = RequestStats()
    start = 10_000.0
    for second in range(0, 120, 2):  # a request every 2 s for two minutes
        stats.record(0.01 * (second % 10 + 1), 500 if second == 100 else 200, now=start + second)
    now = start + 120
    assert stats.requests(60, now=now) == 30
    assert stats.errors(60, now=now) == 1
    assert stats.errors(3600, now=now + 1000) == 1
    assert stats.per_minute(3, now=now) == [0, 30, 30]
    assert stats.p95_ms(now=now) == 90
    assert stats.p95_ms(now=now + 3600) is None
    # An hour later the old buckets are gone.
    stats.record(0.01, 200, now=now + 3700)
    assert stats.requests(3600, now=now + 3700) == 1


def test_activity() -> None:
    activity = Activity(window=300)
    anna, boris = uuid.uuid4(), uuid.uuid4()
    activity.seen(anna, now=1000)
    activity.seen(boris, now=1200)
    assert activity.recent(now=1250) == {anna, boris}
    assert activity.recent(now=1400) == {boris}
    activity.seen(boris, now=1700)  # sweeps Anna out
    assert activity.recent(now=1700) == {boris}
    assert len(activity._seen) == 1


def test_system_load_never_fails() -> None:
    load = metrics.system_load()
    for share in (load.cpu, load.memory, load.disk):
        assert share is None or share >= 0
