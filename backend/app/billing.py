"""Online payment of tiers (routers/billing.py), on with TIERS_ENABLED and a PAYMENT_PROVIDER.

The flow: POST /api/billing/checkout makes a `Payment` ("pending") with the price from PRICES and asks the
provider for a page where the customer pays. The customer comes back to /billing?payment=<id>, which
polls the payment. The provider reports the result (a webhook; the test provider — its own page), and
`apply_payment` marks the payment paid and extends «Pro»: from the end of the current period of «Pro»
(the trial too) or from now, by calendar months. Applying the same payment again changes nothing.

PRICES are what is charged; src/lib/tiers.ts shows the same numbers (price.monthly, price.yearly × 12):
change both. There are no automatic renewals: `send_tier_reminders` writes a few days before the end.

Providers: "test" is a page of the API that pays or cancels at a click (development; production refuses
it); "cispay" is cisPay (app/cispay.py): its page, a signed webhook, and the status asked while the
customer's return page waits. A provider reports through `settle`, which applies the result once. Every few
minutes `reconcile` (app/jobs.py) asks about the payments still pending, so a payment never hangs unpaid
because a notification was lost and the customer closed the page.
"""

import calendar
import logging
import uuid
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, Protocol

from fastapi import BackgroundTasks, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import cispay, mail
from app.config import Settings
from app.errors import ApiError
from app.models import Payment, User, utcnow
from app.tiers import TIER_NAMES, effective_tier

logger = logging.getLogger("app.billing")

Period = Literal["month", "year"]
# How a payment stands at the provider.
ProviderState = Literal["pending", "paid", "canceled"]
PERIOD_MONTHS: dict[str, int] = {"month": 1, "year": 12}
PERIOD_NAMES: dict[str, str] = {"month": "на месяц", "year": "на год"}
# Roubles for one period of the tier.
PRICES: dict[tuple[str, str], int] = {("pro", "month"): 1990, ("pro", "year"): 19080}

# How long before the end of «Pro» the reminder goes out (app/jobs.py looks for such accounts every hour).
REMINDER_BEFORE = timedelta(days=3)
# `reconcile` asks about pending payments older than this (the return page and the webhook usually settle
# them sooner) and younger than that (an invoice expires within about an hour).
RECONCILE_AFTER = timedelta(minutes=2)
RECONCILE_WITHIN = timedelta(days=2)


def add_months(moment: datetime, months: int) -> datetime:
    """The same day and time `months` later; the 31st becomes the last day of a shorter month."""
    index = moment.month - 1 + months
    year, month = moment.year + index // 12, index % 12 + 1
    return moment.replace(year=year, month=month, day=min(moment.day, calendar.monthrange(year, month)[1]))


def period_start(user: User, now: datetime) -> datetime:
    """A payment continues the current period of «Pro» (the trial too); otherwise it starts now."""
    if user.tier == "pro" and user.tier_expires_at is not None and user.tier_expires_at > now:
        return user.tier_expires_at
    return now


def apply_payment(user: User | None, payment: Payment, now: datetime) -> bool:
    """Marks the payment paid and extends the tier; the caller commits. False if it was paid already
    (providers repeat their notifications). «Индивидуальный» is kept as it is: the payment is recorded
    for an admin to sort out, and so is one of a deleted account."""
    if payment.status == "paid":
        return False
    payment.status = "paid"
    payment.paid_at = now
    if user is None or effective_tier(user, now) == "custom":
        logger.warning(
            "payment %s is paid, but the tier was not changed: no account or a custom tier", payment.id
        )
        return True
    user.tier = payment.tier
    user.tier_trial = False
    user.tier_expires_at = add_months(period_start(user, now), PERIOD_MONTHS[payment.period])
    payment.paid_until = user.tier_expires_at
    return True


def cancel_payment(payment: Payment) -> bool:
    """The customer gave up or the provider declined; the caller commits. A paid payment stays paid."""
    if payment.status != "pending":
        return False
    payment.status = "canceled"
    return True


def return_path(payment: Payment) -> str:
    """Where the customer lands after the payment page: «Тариф и оплата» polls the payment from there."""
    return f"/billing?payment={payment.id}"


@dataclass(frozen=True, slots=True)
class PaymentPage:
    # The provider's id of the payment (None if it has none yet) and the page where the customer pays.
    provider_payment_id: str | None
    url: str


class PaymentProvider(Protocol):
    name: str

    async def create(self, payment: Payment, settings: Settings) -> PaymentPage: ...

    async def check(self, payment: Payment, settings: Settings) -> ProviderState | None:
        """Asks the provider how the payment stands; None: unknown (no answer, or nothing to ask)."""
        ...


def provider_failed() -> ApiError:
    return ApiError(
        status.HTTP_502_BAD_GATEWAY,
        "payment_provider_failed",
        "Платёжный сервис не ответил — попробуйте ещё раз через минуту",
    )


class TestProvider:
    """Development: GET /api/billing/test/<id> is the «payment page» with «Оплатить» and «Отменить»."""

    name = "test"

    async def create(self, payment: Payment, settings: Settings) -> PaymentPage:
        return PaymentPage(provider_payment_id=None, url=f"/api/billing/test/{payment.id}")

    async def check(self, payment: Payment, settings: Settings) -> ProviderState | None:
        return None  # its page reports at the click


class CisPayProvider:
    """cisPay (app/cispay.py): its page with a card or SBP; the result comes by the webhook."""

    name = "cispay"

    async def create(self, payment: Payment, settings: Settings) -> PaymentPage:
        what = f"Loader3D: тариф «{TIER_NAMES[payment.tier]}» {PERIOD_NAMES[payment.period]}"
        back = f"{settings.site_url.rstrip('/')}{return_path(payment)}" if settings.site_url else None
        try:
            provider_id, url = await cispay.create_invoice(settings, payment, what, back)
        except cispay.CisPayError as error:
            logger.error("cisPay made no invoice for payment %s: %s", payment.id, error)
            raise provider_failed() from error
        return PaymentPage(provider_payment_id=provider_id, url=url)

    async def check(self, payment: Payment, settings: Settings) -> ProviderState | None:
        try:
            return await cispay.fetch_state(settings, payment)
        except cispay.CisPayError as error:
            logger.warning("cisPay did not tell the status of payment %s: %s", payment.id, error)
            return None


def provider_named(name: str, settings: Settings) -> PaymentProvider | None:
    """The provider a payment was made with, if it is set up here (PAYMENT_PROVIDER may have changed)."""
    if name == "test" and settings.payment_provider == "test":
        return TestProvider()
    if name == "cispay" and cispay.configured(settings):
        return CisPayProvider()
    return None


def get_provider(settings: Settings) -> PaymentProvider | None:
    """None: no online payment (PAYMENT_PROVIDER=none or TIERS_ENABLED=false)."""
    if not settings.tiers_enabled:
        return None
    return provider_named(settings.payment_provider, settings)


async def settle(
    db: AsyncSession,
    settings: Settings,
    payment_id: uuid.UUID,
    state: ProviderState,
    now: datetime,
    *,
    later: BackgroundTasks | None = None,
) -> Payment | None:
    """Applies what the provider reported and commits; after a payment that changed something — the
    «оплата получена» letter (after the response with `later`, so a webhook is answered at once). The rows are
    read again under a lock (Postgres), so a webhook and the return page's check at the same moment extend
    the tier once. A payment canceled earlier may still be paid: the customer can try again on the
    provider's page."""
    payment = await db.scalar(
        select(Payment)
        .where(Payment.id == payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None:
        return None
    if state == "paid":
        user = None
        if payment.user_id is not None:
            user = await db.get(User, payment.user_id, populate_existing=True, with_for_update=True)
        applied = apply_payment(user, payment, now)
        await db.commit()
        if applied and later is not None:
            later.add_task(notify_paid, settings, payment)
        elif applied:
            await notify_paid(settings, payment)
    elif state == "canceled" and cancel_payment(payment):
        await db.commit()
    return payment


async def reconcile(db: AsyncSession, settings: Settings, now: datetime) -> int:
    """Asks the providers about the payments still pending (from RECONCILE_AFTER to RECONCILE_WITHIN old) and
    applies the answers; returns how many payments were paid or canceled. No transaction is held while a
    provider answers."""
    rows = (
        await db.execute(
            select(Payment.id, Payment.provider)
            .where(
                Payment.status == "pending",
                Payment.created_at <= now - RECONCILE_AFTER,
                Payment.created_at > now - RECONCILE_WITHIN,
            )
            .order_by(Payment.created_at.desc())
            .limit(100)
        )
    ).all()
    await db.commit()
    changed = 0
    for payment_id, name in rows:
        provider = provider_named(name, settings)
        payment = await db.get(Payment, payment_id) if provider is not None else None
        await db.commit()
        if provider is None or payment is None or payment.status != "pending":
            continue
        state = await provider.check(payment, settings)
        if state in ("paid", "canceled"):
            settled = await settle(db, settings, payment_id, state, utcnow())
            if settled is not None and settled.status == state:
                changed += 1
    return changed


async def notify_paid(settings: Settings, payment: Payment) -> None:
    """The «оплата получена» letter; a letter that is not sent does not undo the payment."""
    if payment.paid_until is None:
        return
    with suppress(mail.MailError):
        await mail.send_payment_received(
            settings,
            payment.email,
            TIER_NAMES[payment.tier],
            PERIOD_NAMES[payment.period],
            payment.amount,
            payment.paid_until,
        )


async def send_tier_reminders(db: AsyncSession, settings: Settings, now: datetime) -> int:
    """Writes to the accounts whose «Pro» (paid or trial) ends within REMINDER_BEFORE, once per period.
    Returns how many letters went out; one that was not sent is tried again next time."""
    rows = (
        await db.execute(
            select(User.id, User.email, User.tier_expires_at, User.tier_trial).where(
                User.tier == "pro",
                User.is_active,
                User.tier_expires_at > now,
                User.tier_expires_at <= now + REMINDER_BEFORE,
                or_(User.tier_reminder_for.is_(None), User.tier_reminder_for != User.tier_expires_at),
            )
        )
    ).all()
    sent = 0
    for user_id, email, ends_at, trial in rows:
        try:
            await mail.send_tier_ending(settings, email, TIER_NAMES["pro"], ends_at, trial)
        except mail.MailError:
            continue
        # One by one: a failure later in the list must not send these letters twice.
        await db.execute(update(User).where(User.id == user_id).values(tier_reminder_for=ends_at))
        await db.commit()
        sent += 1
    return sent
