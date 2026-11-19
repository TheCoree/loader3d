"""Online payment of tiers (app/billing.py, routers/billing.py) with the test provider."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from app import billing, mail
from app.config import Settings
from app.main import create_app
from app.models import Base, User, utcnow
from tests.conftest import ClientFactory, error_code, make_admin, make_settings, register


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, tiers_enabled=True, payment_provider="test")


@pytest.fixture
def letters(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, tuple[Any, ...]]]:
    sent: list[tuple[str, tuple[Any, ...]]] = []

    async def paid(settings: Settings, *args: Any) -> None:
        sent.append(("paid", args))

    async def ending(settings: Settings, *args: Any) -> None:
        sent.append(("ending", args))

    monkeypatch.setattr(mail, "send_payment_received", paid)
    monkeypatch.setattr(mail, "send_tier_ending", ending)
    return sent


async def _checkout(client: httpx.AsyncClient, period: str = "month") -> dict[str, Any]:
    response = await client.post("/api/billing/checkout", json={"period": period})
    assert response.status_code == 201, response.text
    return response.json()


async def _pay(client: httpx.AsyncClient, checkout: dict[str, Any]) -> httpx.Response:
    return await client.post(f"{checkout['paymentUrl']}/pay", follow_redirects=False)


async def _me(client: httpx.AsyncClient) -> dict[str, Any]:
    return (await client.get("/api/users/me")).json()["subscription"]


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_months_are_calendar_months() -> None:
    assert billing.add_months(datetime(2027, 1, 31, 10, tzinfo=UTC), 1) == datetime(
        2027, 2, 28, 10, tzinfo=UTC
    )
    assert billing.add_months(datetime(2028, 1, 31, tzinfo=UTC), 1) == datetime(2028, 2, 29, tzinfo=UTC)
    assert billing.add_months(datetime(2026, 11, 19, tzinfo=UTC), 12) == datetime(2027, 11, 19, tzinfo=UTC)
    assert billing.add_months(datetime(2026, 12, 5, tzinfo=UTC), 1) == datetime(2027, 1, 5, tzinfo=UTC)


async def test_prices_come_from_the_api(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/billing")).json()
    assert body["enabled"] is True
    assert {(p["period"], p["amount"], p["months"]) for p in body["prices"]} == {
        ("month", 1990, 1),
        ("year", 19080, 12),
    }


async def test_paying_a_month_of_pro(client: httpx.AsyncClient, letters: list) -> None:
    await register(client)
    checkout = await _checkout(client)
    payment = checkout["payment"]
    assert (payment["status"], payment["amount"], payment["period"]) == ("pending", 1990, "month")
    assert checkout["paymentUrl"] == f"/api/billing/test/{payment['id']}"

    page = await client.get(checkout["paymentUrl"])
    assert page.status_code == 200
    assert "1 990" in page.text and "anna@example.com" in page.text

    before = utcnow()
    paid = await _pay(client, checkout)
    assert paid.status_code == 303
    assert paid.headers["location"] == f"/account?payment={payment['id']}#subscription"

    payment = (await client.get(f"/api/billing/payments/{payment['id']}")).json()
    assert payment["status"] == "paid"
    expected = billing.add_months(before, 1)
    assert abs(_at(payment["paidUntil"]) - expected) < timedelta(minutes=1)
    sub = await _me(client)
    assert (sub["tier"], sub["trial"]) == ("pro", False)
    assert sub["expiresAt"] == payment["paidUntil"]
    assert [kind for kind, _ in letters] == ["paid"]

    # Providers repeat their notifications: nothing changes the second time.
    again = await _pay(client, checkout)
    assert again.status_code == 303
    assert (await _me(client))["expiresAt"] == payment["paidUntil"]
    assert len(letters) == 1
    assert [p["status"] for p in (await client.get("/api/billing/payments")).json()] == ["paid"]


async def test_a_year_continues_the_trial(client: httpx.AsyncClient, letters: list) -> None:
    await register(client, tier="pro")
    trial_end = _at((await _me(client))["expiresAt"])
    await _pay(client, await _checkout(client, "year"))
    sub = await _me(client)
    assert (sub["tier"], sub["trial"]) == ("pro", False)
    assert _at(sub["expiresAt"]) == billing.add_months(trial_end, 12)


async def test_renewal_adds_to_the_paid_period(client: httpx.AsyncClient, letters: list) -> None:
    await register(client)
    await _pay(client, await _checkout(client))
    first_end = _at((await _me(client))["expiresAt"])
    await _pay(client, await _checkout(client))
    assert _at((await _me(client))["expiresAt"]) == billing.add_months(first_end, 1)


async def test_an_expired_pro_starts_a_new_period_now(
    app: FastAPI, client: httpx.AsyncClient, letters: list
) -> None:
    await register(client)
    async with app.state.sessionmaker() as db:
        await db.execute(
            update(User).values(tier="pro", tier_expires_at=utcnow() - timedelta(days=10), tier_trial=False)
        )
        await db.commit()
    before = utcnow()
    await _pay(client, await _checkout(client))
    assert abs(_at((await _me(client))["expiresAt"]) - billing.add_months(before, 1)) < timedelta(minutes=1)


async def test_canceling_leaves_the_tier(client: httpx.AsyncClient, letters: list) -> None:
    await register(client)
    checkout = await _checkout(client)
    canceled = await client.post(f"{checkout['paymentUrl']}/cancel", follow_redirects=False)
    assert canceled.status_code == 303
    payment = (await client.get(f"/api/billing/payments/{checkout['payment']['id']}")).json()
    assert (payment["status"], payment["paidUntil"]) == ("canceled", None)
    assert (await _me(client))["tier"] == "free"
    assert letters == []


async def test_payments_are_private(make_client: ClientFactory, letters: list) -> None:
    anna, bob = await make_client(), await make_client()
    await register(anna)
    await register(bob, "bob@example.com")
    checkout = await _checkout(anna)
    response = await bob.get(f"/api/billing/payments/{checkout['payment']['id']}")
    assert response.status_code == 404
    assert (await bob.get("/api/billing/payments")).json() == []


async def test_custom_tier_is_renewed_by_contract(app: FastAPI, client: httpx.AsyncClient) -> None:
    await register(client)
    async with app.state.sessionmaker() as db:
        await db.execute(update(User).values(tier="custom", tier_expires_at=None))
        await db.commit()
    response = await client.post("/api/billing/checkout", json={"period": "month"})
    assert response.status_code == 409
    assert error_code(response) == "custom_tier"


@asynccontextmanager
async def _client_of(tmp_path: Path, **overrides: Any) -> AsyncIterator[httpx.AsyncClient]:
    """A client of an app with other settings than this module's fixture."""
    app = create_app(
        make_settings(tmp_path, **({"tiers_enabled": True, "payment_provider": "test"} | overrides))
    )
    async with app.router.lifespan_context(app):
        async with app.state.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as c:
            yield c


async def test_checkout_needs_a_confirmed_email(tmp_path: Path) -> None:
    async with _client_of(tmp_path, email_verification=True) as client:
        await register(client)
        response = await client.post("/api/billing/checkout", json={"period": "month"})
        assert response.status_code == 403
        assert error_code(response) == "email_not_verified"


@pytest.mark.parametrize(
    ("override", "code"),
    [({"payment_provider": "none"}, "payments_disabled"), ({"tiers_enabled": False}, "tiers_disabled")],
)
async def test_without_a_provider_tiers_are_paid_by_request(
    tmp_path: Path, override: dict[str, Any], code: str
) -> None:
    async with _client_of(tmp_path, **override) as client:
        assert (await client.get("/api/billing")).json()["enabled"] is False
        await register(client)
        response = await client.post("/api/billing/checkout", json={"period": "month"})
        assert error_code(response) == code
        page = await client.get(f"/api/billing/test/{uuid.uuid7()}")
        assert page.status_code == 404


def test_production_refuses_the_test_provider(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="PAYMENT_PROVIDER=test"):
        make_settings(tmp_path, environment="production", payment_provider="test")


async def test_reminders_before_the_end_of_pro(
    app: FastAPI, settings: Settings, make_client: ClientFactory, letters: list
) -> None:
    for email in ("soon@example.com", "later@example.com"):
        await register(await make_client(), email)
    now = utcnow()
    async with app.state.sessionmaker() as db:
        await db.execute(
            update(User)
            .where(User.email == "soon@example.com")
            .values(tier="pro", tier_trial=True, tier_expires_at=now + timedelta(days=2))
        )
        await db.execute(
            update(User)
            .where(User.email == "later@example.com")
            .values(tier="pro", tier_expires_at=now + timedelta(days=10))
        )
        await db.commit()

        assert await billing.send_tier_reminders(db, settings, now) == 1
        assert letters[-1][0] == "ending" and letters[-1][1][0] == "soon@example.com"
        assert letters[-1][1][3] is True  # the trial
        # One letter per period.
        assert await billing.send_tier_reminders(db, settings, now + timedelta(hours=1)) == 0
        # A week later the other account's «Pro» ends soon too.
        assert await billing.send_tier_reminders(db, settings, now + timedelta(days=8)) == 1
        assert letters[-1][1][0] == "later@example.com"

        # A renewal is a new period: it gets its own reminder.
        user = await db.scalar(select(User).where(User.email == "soon@example.com"))
        assert user is not None
        renewed = billing.add_months(now + timedelta(days=2), 1)
        await db.execute(update(User).where(User.id == user.id).values(tier_expires_at=renewed))
        await db.commit()
        assert await billing.send_tier_reminders(db, settings, renewed - timedelta(days=1)) == 1


async def test_admin_sees_the_payments(app: FastAPI, make_client: ClientFactory, letters: list) -> None:
    admin, anna = await make_client(), await make_client()
    await register(admin, "admin@example.com")
    await make_admin(app, "admin@example.com")
    await register(anna)
    await _pay(anna, await _checkout(anna, "year"))
    await _checkout(anna)

    page = (await admin.get("/api/admin/payments")).json()
    assert page["total"] == 2
    assert page["paidSum"] == 19080
    assert [(p["status"], p["email"], p["provider"]) for p in page["items"]] == [
        ("pending", "anna@example.com", "test"),
        ("paid", "anna@example.com", "test"),
    ]
    paid = (await admin.get("/api/admin/payments", params={"status": "paid"})).json()
    assert [p["amount"] for p in paid["items"]] == [19080]
    assert (await anna.get("/api/admin/payments")).status_code == 403
