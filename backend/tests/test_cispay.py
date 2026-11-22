"""Online payment through cisPay (app/cispay.py): the invoice, the signed webhook, the status asked while the
customer's return page waits. The cisPay API is replaced by FakeCisPay (cispay._open)."""

import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import update

from app import billing, cispay, jobs, mail
from app.config import Settings
from app.models import Payment, utcnow
from app.routers import billing as billing_router
from tests.conftest import error_code, make_settings, register

SHOP = "0197a0b2-1c3d-7e4f-8a5b-6c7d8e9f0a1b"
KEY = "cis_sec_0123456789abcdef"
CISPAY = {"payment_provider": "cispay", "cispay_shop_id": SHOP, "cispay_api_key": KEY}


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, tiers_enabled=True, site_url="https://loader3d.test", **CISPAY)


class FakeCisPay:
    """POST /payments and GET /payments/status of the cisPay API."""

    def __init__(self) -> None:
        self.requests: list[urllib.request.Request] = []
        self.timeouts: list[float] = []
        self.invoices: dict[str, dict[str, Any]] = {}  # transaction id → the invoice asked for
        self.status: dict[str, str] = {}  # transaction id → what GET /payments/status says
        self.down = False

    def open(self, request: urllib.request.Request, timeout: float) -> bytes:
        self.requests.append(request)
        self.timeouts.append(timeout)
        if self.down:
            raise urllib.error.URLError("connection refused")
        url = urllib.parse.urlsplit(request.full_url)
        if request.get_method() == "POST" and url.path == "/payments":
            assert isinstance(request.data, bytes)
            body = json.loads(request.data)
            tx = str(uuid.uuid7())
            self.invoices[tx], self.status[tx] = body, "PENDING"
            answer = {
                "id": tx,
                "order_id": body["order_id"],
                "status": "PENDING",
                "amount": body["amount"],
                "charged_amount": body["amount"],
                "payment_url": f"https://pay.cispay.test/{tx}",
                "created_at": "2026-11-21T10:00:00+00:00",
            }
            return json.dumps(answer).encode()
        if request.get_method() == "GET" and url.path == "/payments/status":
            [tx] = urllib.parse.parse_qs(url.query)["id"]
            return json.dumps(self.notice(tx)).encode()
        raise AssertionError(f"unexpected request {request.get_method()} {request.full_url}")

    @property
    def tx(self) -> str:
        """The last invoice."""
        return list(self.invoices)[-1]

    def status_checks(self) -> int:
        return sum(r.get_method() == "GET" for r in self.requests)

    def asked_about(self) -> list[str]:
        """Transactions asked about with GET /payments/status, in order."""
        return [
            urllib.parse.parse_qs(urllib.parse.urlsplit(r.full_url).query)["id"][0]
            for r in self.requests
            if r.get_method() == "GET"
        ]

    def notice(self, tx: str, status: str | None = None, **changes: Any) -> dict[str, Any]:
        """A webhook body (GET /payments/status answers with the same fields)."""
        invoice = self.invoices[tx]
        return {
            "id": tx,
            "store_id": SHOP,
            "order_id": invoice["order_id"],
            "payment_method": "SBP",
            "status": status or self.status[tx],
            "amount": invoice["amount"],
            "currency": "RUB",
            "charged_amount": invoice["amount"],
            "merchant_revenue": invoice["amount"] * 965 // 1000,
            "is_sandbox": False,
            "description": invoice["description"],
            "subscription_id": None,
            "paid_at": "2026-11-21T10:05:00+00:00" if status == "PAID" else None,
            "timestamp": "2026-11-21T10:05:01+00:00",
        } | changes


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> FakeCisPay:
    fake = FakeCisPay()
    monkeypatch.setattr(cispay, "_open", fake.open)
    return fake


@pytest.fixture
def letters(monkeypatch: pytest.MonkeyPatch) -> list[tuple[Any, ...]]:
    sent: list[tuple[Any, ...]] = []

    async def paid(settings: Settings, *args: Any) -> None:
        sent.append(args)

    monkeypatch.setattr(mail, "send_payment_received", paid)
    return sent


async def _checkout(client: httpx.AsyncClient, period: str = "month") -> dict[str, Any]:
    response = await client.post("/api/billing/checkout", json={"period": period})
    assert response.status_code == 201, response.text
    return response.json()


async def _notify(client: httpx.AsyncClient, body: dict[str, Any], key: str = KEY) -> httpx.Response:
    raw = json.dumps(body, separators=(",", ":")).encode()
    signature = hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()
    return await client.post(
        "/api/billing/cispay/webhook",
        content=raw,
        headers={"content-type": "application/json", "x-signature": signature},
    )


async def _statuses(client: httpx.AsyncClient) -> list[str]:
    """The account's payments as stored (the list does not ask cisPay)."""
    return [p["status"] for p in (await client.get("/api/billing/payments")).json()]


async def _sub(client: httpx.AsyncClient) -> dict[str, Any]:
    return (await client.get("/api/users/me")).json()["subscription"]


async def test_checkout_makes_an_invoice(client: httpx.AsyncClient, api: FakeCisPay) -> None:
    await register(client)
    checkout = await _checkout(client, "year")
    payment_id = checkout["payment"]["id"]

    [request] = api.requests
    assert (request.get_method(), request.full_url) == ("POST", "https://api.cispay.app/payments")
    assert (request.get_header("X-shop-id"), request.get_header("X-api-key")) == (SHOP, KEY)
    back = f"https://loader3d.test/billing?payment={payment_id}"
    assert api.invoices[api.tx] == {
        "amount": 19080_00,
        "currency": "RUB",
        "order_id": payment_id,
        "customer_id": (await client.get("/api/users/me")).json()["id"],
        "description": "Loader3D: тариф «Pro» на год",
        "redirect_success_url": back,
        "redirect_fail_url": back,
    }
    assert checkout["paymentUrl"] == f"https://pay.cispay.test/{api.tx}"
    assert (await client.get("/api/billing")).json()["enabled"] is True


async def test_the_webhook_pays_once(client: httpx.AsyncClient, api: FakeCisPay, letters: list) -> None:
    await register(client)
    checkout = await _checkout(client)
    paid = api.notice(api.tx, "PAID")

    assert (await _notify(client, paid)).status_code == 200
    payment = (await client.get(f"/api/billing/payments/{checkout['payment']['id']}")).json()
    assert payment["status"] == "paid"
    sub = await _sub(client)
    assert (sub["tier"], sub["trial"], sub["expiresAt"]) == ("pro", False, payment["paidUntil"])
    assert len(letters) == 1

    # cisPay repeats notifications: the same one changes nothing.
    assert (await _notify(client, paid)).status_code == 200
    assert (await _sub(client))["expiresAt"] == payment["paidUntil"]
    assert len(letters) == 1
    assert api.status_checks() == 0


async def test_a_notification_without_the_signature_is_refused(
    client: httpx.AsyncClient, api: FakeCisPay
) -> None:
    await register(client)
    await _checkout(client)
    forged = await _notify(client, api.notice(api.tx, "PAID"), key="cis_sec_somebody_else")
    assert forged.status_code == 401
    assert error_code(forged) == "bad_signature"
    unsigned = await client.post("/api/billing/cispay/webhook", json=api.notice(api.tx, "PAID"))
    assert unsigned.status_code == 401
    assert await _statuses(client) == ["pending"]
    assert (await _sub(client))["tier"] == "free"


async def test_declined_then_paid_on_a_second_try(
    client: httpx.AsyncClient, api: FakeCisPay, letters: list
) -> None:
    await register(client)
    await _checkout(client)
    await _notify(client, api.notice(api.tx, "FAILED"))
    assert await _statuses(client) == ["canceled"]
    await _notify(client, api.notice(api.tx, "EXPIRED"))
    assert await _statuses(client) == ["canceled"]
    # The customer tried again on the cisPay page.
    await _notify(client, api.notice(api.tx, "PAID"))
    assert await _statuses(client) == ["paid"]
    assert (await _sub(client))["tier"] == "pro"
    assert len(letters) == 1


async def test_notifications_that_do_not_fit_change_nothing(
    client: httpx.AsyncClient, api: FakeCisPay, letters: list
) -> None:
    await register(client)
    await _checkout(client)
    tx = api.tx
    for notice in (
        api.notice(tx, "PAID", is_sandbox=True),
        api.notice(tx, "PAID", store_id=str(uuid.uuid7())),
        api.notice(tx, "PAID", amount=100),
        api.notice(tx, "PAID", id=str(uuid.uuid7())),
        api.notice(tx, "PAID", order_id=str(uuid.uuid7())),
        api.notice(tx, "PAID", order_id="order-1"),
        api.notice(tx, "REFUNDED"),
        api.notice(tx, "SOMETHING"),
        {"event": "subscription.cancelled", "object": "subscription", "id": str(uuid.uuid7())},
    ):
        response = await _notify(client, notice)
        assert response.status_code == 200, notice
    assert await _statuses(client) == ["pending"]
    assert (await _sub(client))["tier"] == "free"
    assert letters == []

    broken = await client.post(
        "/api/billing/cispay/webhook",
        content=b"[1, 2",
        headers={"x-signature": hmac.new(KEY.encode(), b"[1, 2", hashlib.sha256).hexdigest()},
    )
    assert broken.status_code == 400


async def test_the_return_page_asks_cispay(client: httpx.AsyncClient, api: FakeCisPay, letters: list) -> None:
    await register(client)
    checkout = await _checkout(client)
    url = f"/api/billing/payments/{checkout['payment']['id']}"

    assert (await client.get(url)).json()["status"] == "pending"
    assert api.status_checks() == 1
    [check] = [r for r in api.requests if r.get_method() == "GET"]
    assert check.full_url == f"https://api.cispay.app/payments/status?id={api.tx}"
    # The page polls every 2 s; cisPay is asked at most once in 5 s.
    api.status[api.tx] = "PAID"
    assert (await client.get(url)).json()["status"] == "pending"
    assert api.status_checks() == 1

    billing_router.STATUS_CHECKS.clear()
    payment = (await client.get(url)).json()
    assert payment["status"] == "paid"
    assert (await _sub(client))["expiresAt"] == payment["paidUntil"]
    assert len(letters) == 1
    # A payment that is not pending is not asked about; a late webhook changes nothing.
    billing_router.STATUS_CHECKS.clear()
    await client.get(url)
    await _notify(client, api.notice(api.tx, "PAID"))
    assert api.status_checks() == 2
    assert len(letters) == 1


async def test_cispay_out_of_reach(client: httpx.AsyncClient, api: FakeCisPay) -> None:
    await register(client)
    checkout = await _checkout(client)
    api.down = True
    # The return page keeps waiting.
    payment = await client.get(f"/api/billing/payments/{checkout['payment']['id']}")
    assert payment.json()["status"] == "pending"
    # No invoice — no payment.
    response = await client.post("/api/billing/checkout", json={"period": "month"})
    assert response.status_code == 502
    assert error_code(response) == "payment_provider_failed"
    assert await _statuses(client) == ["pending"]


def test_status_of_a_payment(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, **CISPAY)
    payment = Payment(id=uuid.uuid7(), amount=1990, provider="cispay", provider_payment_id="tx-1")
    notice = {"id": "tx-1", "order_id": str(payment.id), "status": "PAID", "amount": 1990_00}
    assert cispay.state_of(settings, payment, notice) == "paid"
    assert cispay.state_of(settings, payment, notice | {"status": "PENDING"}) == "pending"
    # A crypto payment is reported in USD cents.
    assert cispay.state_of(settings, payment, notice | {"currency": "USD", "amount": 2215}) == "paid"
    # Sandbox payments count only where allowed (development).
    sandbox = notice | {"is_sandbox": True}
    assert cispay.state_of(settings, payment, sandbox) is None
    allowed = make_settings(tmp_path, **CISPAY, cispay_sandbox=True)
    assert cispay.state_of(allowed, payment, sandbox) == "paid"


def test_cispay_settings(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="CISPAY_SHOP_ID"):
        make_settings(tmp_path, payment_provider="cispay")
    production = {"environment": "production"} | CISPAY
    with pytest.raises(ValueError, match="SITE_URL"):
        make_settings(tmp_path, **production)
    with pytest.raises(ValueError, match="CISPAY_SANDBOX"):
        make_settings(tmp_path, **production, site_url="https://loader3d.pro", cispay_sandbox=True)
    assert make_settings(tmp_path, **production, site_url="https://loader3d.pro").payment_provider == "cispay"


async def test_requests_have_time_limits(client: httpx.AsyncClient, api: FakeCisPay) -> None:
    await register(client)
    checkout = await _checkout(client)
    await client.get(f"/api/billing/payments/{checkout['payment']['id']}")
    assert api.timeouts == [cispay.CREATE_TIMEOUT, cispay.STATUS_TIMEOUT]


async def test_a_sandbox_payment_that_ends_closes_ours(client: httpx.AsyncClient, api: FakeCisPay) -> None:
    """Sandbox transactions are also payments of a customer cisPay has blocked: never paid, but they end."""
    await register(client)
    await _checkout(client)
    await _notify(client, api.notice(api.tx, "PAID", is_sandbox=True))
    assert await _statuses(client) == ["pending"]
    await _notify(client, api.notice(api.tx, "EXPIRED", is_sandbox=True))
    assert await _statuses(client) == ["canceled"]


async def test_pending_payments_are_asked_about_in_the_background(
    app: FastAPI, settings: Settings, client: httpx.AsyncClient, api: FakeCisPay, letters: list
) -> None:
    """The customer paid and closed the page, and the webhook was lost: the job settles it anyway."""
    await register(client)
    ids = {name: (await _checkout(client))["payment"]["id"] for name in ("paid", "expired", "fresh", "old")}
    tx = dict(zip(ids, api.invoices, strict=True))
    api.status[tx["paid"]] = "PAID"
    api.status[tx["expired"]] = "EXPIRED"
    api.status[tx["old"]] = "PAID"
    now = utcnow()
    ages = {"paid": timedelta(minutes=10), "expired": timedelta(minutes=40), "old": timedelta(days=3)}
    async with app.state.sessionmaker() as db:
        for name, age in ages.items():
            await db.execute(
                update(Payment).where(Payment.id == uuid.UUID(ids[name])).values(created_at=now - age)
            )
        await db.commit()

    await jobs.check_payments_once(app.state.sessionmaker, settings)
    # The newest first; a payment younger than RECONCILE_AFTER and one older than RECONCILE_WITHIN are left.
    assert api.asked_about() == [tx["paid"], tx["expired"]]
    statuses = {p["id"]: p["status"] for p in (await client.get("/api/billing/payments")).json()}
    assert [statuses[ids[name]] for name in ("paid", "expired", "fresh", "old")] == [
        "paid",
        "canceled",
        "pending",
        "pending",
    ]
    assert (await _sub(client))["tier"] == "pro"
    assert len(letters) == 1

    # Nothing pending in the window any more: the next run asks nobody.
    await jobs.check_payments_once(app.state.sessionmaker, settings)
    assert api.status_checks() == 2


async def test_the_background_check_waits_out_cispay_failures(
    app: FastAPI, settings: Settings, client: httpx.AsyncClient, api: FakeCisPay
) -> None:
    await register(client)
    checkout = await _checkout(client)
    async with app.state.sessionmaker() as db:
        await db.execute(update(Payment).values(created_at=utcnow() - timedelta(minutes=10)))
        await db.commit()
        api.down = True
        assert await billing.reconcile(db, settings, utcnow()) == 0
    assert await _statuses(client) == ["pending"]
    api.down = False
    api.status[api.tx] = "PAID"
    async with app.state.sessionmaker() as db:
        assert await billing.reconcile(db, settings, utcnow()) == 1
    payment = (await client.get(f"/api/billing/payments/{checkout['payment']['id']}")).json()
    assert payment["status"] == "paid"
