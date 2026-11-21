"""Online payment of tiers (app/billing.py): prices, checkout, the customer's payments, the cisPay webhook,
the test provider."""

import json
import logging
import uuid
from datetime import timedelta
from html import escape

from fastapi import APIRouter, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

from app import billing, cispay
from app.auth import CurrentAuth, VerifiedAuth
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found
from app.models import Payment, utcnow
from app.ratelimit import RateLimiter, too_many
from app.schemas.billing import BillingOut, CheckoutIn, CheckoutOut, PaymentOut, PriceOut
from app.tiers import TIER_NAMES, effective_tier

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger("app.billing")

# Against a script opening payments in a loop; a person needs a handful.
CHECKOUTS_PER_USER = RateLimiter(20, timedelta(hours=1))
# The return page polls every 2 s; the provider is asked about a pending payment at most this often.
STATUS_CHECKS = RateLimiter(1, timedelta(seconds=5))


@router.get("")
async def billing_info(settings: SettingsDep) -> BillingOut:
    """Public: whether tiers can be paid online here, and the prices that are charged."""
    if not settings.tiers_enabled:
        return BillingOut(enabled=False, prices=[])
    return BillingOut(
        enabled=billing.get_provider(settings) is not None,
        prices=[
            PriceOut(tier=tier, period=period, amount=amount, months=billing.PERIOD_MONTHS[period])  # type: ignore[arg-type]
            for (tier, period), amount in billing.PRICES.items()
        ],
    )


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(body: CheckoutIn, auth: VerifiedAuth, db: Db, settings: SettingsDep) -> CheckoutOut:
    """A payment of «Pro» for a month or a year: open `paymentUrl`, the customer pays there."""
    if not settings.tiers_enabled:
        raise not_found("tiers_disabled", "Тарифы отключены")
    provider = billing.get_provider(settings)
    if provider is None:
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "payments_disabled",
            "Онлайн-оплата пока не подключена — оставьте заявку, и мы подключим тариф",
        )
    user = auth.user
    if effective_tier(user, utcnow()) == "custom":
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "custom_tier",
            "У вас индивидуальный тариф — он продлевается по договору",
        )
    if wait := CHECKOUTS_PER_USER.allow(str(user.id)):
        raise too_many(wait, "Слишком много попыток оплаты")
    payment = Payment(
        user_id=user.id,
        email=user.email,
        tier=body.tier,
        period=body.period,
        amount=billing.PRICES[(body.tier, body.period)],
        provider=provider.name,
    )
    db.add(payment)
    await db.flush()
    page = await provider.create(payment, settings)
    payment.provider_payment_id = page.provider_payment_id
    payment.payment_url = page.url
    await db.commit()
    return CheckoutOut(payment=PaymentOut.model_validate(payment), payment_url=page.url)


@router.get("/payments")
async def my_payments(auth: CurrentAuth, db: Db) -> list[PaymentOut]:
    """The account's payments, newest first (the last 50)."""
    payments = await db.scalars(
        select(Payment)
        .where(Payment.user_id == auth.user.id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .limit(50)
    )
    return [PaymentOut.model_validate(p) for p in payments]


@router.get("/payments/{payment_id}")
async def my_payment(payment_id: uuid.UUID, auth: CurrentAuth, db: Db, settings: SettingsDep) -> PaymentOut:
    """One payment of the account: the page the customer returns to polls it until it is not pending.
    A pending payment is checked with the provider too, in case its notification is late or lost."""
    payment = await db.get(Payment, payment_id)
    if payment is None or payment.user_id != auth.user.id:
        raise not_found("payment_not_found", "Платёж не найден")
    if payment.status == "pending" and STATUS_CHECKS.allow(str(payment.id)) == 0:
        provider = billing.provider_named(payment.provider, settings)
        state = await provider.check(payment, settings) if provider else None
        if state in ("paid", "canceled"):
            payment = await billing.settle(db, settings, payment.id, state, utcnow()) or payment
    return PaymentOut.model_validate(payment)


# --- cisPay (PAYMENT_PROVIDER=cispay, app/cispay.py) ------------------------------------------------


@router.post("/cispay/webhook", include_in_schema=False)
async def cispay_webhook(request: Request, db: Db, settings: SettingsDep) -> dict[str, bool]:
    """cisPay reports a new status of a payment. Any 2xx stops its retries, so a notification the API cannot
    use is logged and acknowledged; only one without a valid signature is refused."""
    raw = await request.body()
    if not cispay.configured(settings) or not cispay.signature_ok(
        settings, raw, request.headers.get("x-signature", "")
    ):
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "bad_signature", "Неверная подпись уведомления")
    try:
        data = json.loads(raw)
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise ApiError(status.HTTP_400_BAD_REQUEST, "bad_notification", "Неверное уведомление")
    if "event" in data:
        # Events of cisPay subscriptions: «Pro» is sold by periods, without subscriptions.
        return {"ok": True}
    try:
        payment_id = uuid.UUID(str(data.get("order_id")))
    except ValueError:
        payment_id = None
    payment = await db.get(Payment, payment_id) if payment_id else None
    if payment is None or payment.provider != "cispay":
        logger.warning("cisPay notification about an unknown order %r", data.get("order_id"))
        return {"ok": True}
    state = cispay.state_of(settings, payment, data)
    if state in ("paid", "canceled"):
        await billing.settle(db, settings, payment.id, state, utcnow())
    return {"ok": True}


# --- The test provider (PAYMENT_PROVIDER=test, development only) ------------------------------------


async def _test_payment(db: Db, settings: SettingsDep, payment_id: uuid.UUID) -> Payment:
    payment = await db.get(Payment, payment_id)
    if settings.payment_provider != "test" or payment is None or payment.provider != "test":
        raise not_found("payment_not_found", "Платёж не найден")
    return payment


def _test_page(payment: Payment) -> str:
    amount = f"{payment.amount:,}".replace(",", " ")
    what = f"«{TIER_NAMES.get(payment.tier, payment.tier)}» {billing.PERIOD_NAMES.get(payment.period, '')}"
    base = f"/api/billing/test/{payment.id}"
    if payment.status == "pending":
        actions = (
            f'<form method="post" action="{base}/pay"><button class="pay">Оплатить {amount} ₽</button></form>'
            f'<form method="post" action="{base}/cancel"><button>Отменить</button></form>'
        )
    else:
        state = "оплачен" if payment.status == "paid" else "отменён"
        actions = (
            f'<p>Платёж уже {state}.</p><p><a href="{escape(billing.return_path(payment))}">Вернуться</a></p>'
        )
    return f"""<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Тестовая оплата — Loader3D</title>
<style>
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5;
  font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #09090b; }}
main {{ width: min(420px, calc(100% - 32px)); background: #fff; border-radius: 14px; padding: 28px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }}
.tag {{ display: inline-block; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e;
  font-size: 12px; font-weight: 600; }}
h1 {{ margin: 12px 0 4px; font-size: 22px; }}
p {{ margin: 0 0 8px; color: #52525b; }}
form {{ margin: 0; }}
.actions {{ display: grid; gap: 8px; margin-top: 20px; }}
button {{ width: 100%; height: 42px; border-radius: 9px; border: 1px solid #e4e4e7; background: #fff;
  font: inherit; font-weight: 600; cursor: pointer; }}
button.pay {{ background: #09090b; border-color: #09090b; color: #fff; }}
</style></head>
<body><main>
<span class="tag">Тестовый платёж — деньги не списываются</span>
<h1>{escape(what)}</h1>
<p>{amount} ₽ · {escape(payment.email)}</p>
<p>Так выглядит шаг оплаты, пока не подключён платёжный сервис (PAYMENT_PROVIDER=test).</p>
<div class="actions">{actions}</div>
</main></body></html>
"""


@router.get("/test/{payment_id}", response_class=HTMLResponse, include_in_schema=False)
async def test_payment_page(payment_id: uuid.UUID, db: Db, settings: SettingsDep) -> HTMLResponse:
    return HTMLResponse(_test_page(await _test_payment(db, settings, payment_id)))


@router.post("/test/{payment_id}/pay", include_in_schema=False)
async def test_pay(payment_id: uuid.UUID, db: Db, settings: SettingsDep) -> RedirectResponse:
    payment = await _test_payment(db, settings, payment_id)
    await billing.settle(db, settings, payment.id, "paid", utcnow())
    return RedirectResponse(billing.return_path(payment), status_code=status.HTTP_303_SEE_OTHER)


@router.post("/test/{payment_id}/cancel", include_in_schema=False)
async def test_cancel(payment_id: uuid.UUID, db: Db, settings: SettingsDep) -> RedirectResponse:
    payment = await _test_payment(db, settings, payment_id)
    await billing.settle(db, settings, payment.id, "canceled", utcnow())
    return RedirectResponse(billing.return_path(payment), status_code=status.HTTP_303_SEE_OTHER)
