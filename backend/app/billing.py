"""Online payment of tiers (routers/billing.py), on with TIERS_ENABLED and a PAYMENT_PROVIDER.

The flow: POST /api/billing/checkout makes a `Payment` ("pending") with the price from PRICES and asks the
provider for a page where the customer pays. The customer comes back to /billing?payment=<id>, which
polls the payment. The provider reports the result (a webhook; the test provider — its own page), and
`apply_payment` marks the payment paid and extends «Pro»: from the end of the current period of «Pro»
(the trial too) or from now, by calendar months. Applying the same payment again changes nothing.

PRICES are what is charged; src/lib/tiers.ts shows the same numbers (price.monthly, price.yearly × 12):
change both. There are no automatic renewals: `send_tier_reminders` writes a few days before the end.

Providers: "test" is a page of the API that pays or cancels at a click (development; production refuses
it). A real one (cisPay, SBP) is another `PaymentProvider` with create() and a webhook route that checks
the provider's signature and then calls `apply_payment` / `cancel_payment`.
"""

import calendar
import logging
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, Protocol

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import mail
from app.config import Settings
from app.models import Payment, User
from app.tiers import TIER_NAMES, effective_tier

logger = logging.getLogger("app.billing")

Period = Literal["month", "year"]
PERIOD_MONTHS: dict[str, int] = {"month": 1, "year": 12}
PERIOD_NAMES: dict[str, str] = {"month": "на месяц", "year": "на год"}
# Roubles for one period of the tier.
PRICES: dict[tuple[str, str], int] = {("pro", "month"): 1990, ("pro", "year"): 19080}

# How long before the end of «Pro» the reminder goes out (app/jobs.py looks for such accounts every hour).
REMINDER_BEFORE = timedelta(days=3)


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


class TestProvider:
    """Development: GET /api/billing/test/<id> is the «payment page» with «Оплатить» and «Отменить»."""

    name = "test"

    async def create(self, payment: Payment, settings: Settings) -> PaymentPage:
        return PaymentPage(provider_payment_id=None, url=f"/api/billing/test/{payment.id}")


def get_provider(settings: Settings) -> PaymentProvider | None:
    """None: no online payment (PAYMENT_PROVIDER=none or TIERS_ENABLED=false)."""
    if not settings.tiers_enabled:
        return None
    if settings.payment_provider == "test":
        return TestProvider()
    return None


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
