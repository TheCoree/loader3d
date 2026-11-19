import uuid
from datetime import datetime
from typing import Literal

from app.schemas.base import ApiModel

BillingPeriod = Literal["month", "year"]
PaymentStatus = Literal["pending", "paid", "canceled"]


class PriceOut(ApiModel):
    tier: Literal["pro"]
    period: BillingPeriod
    # Roubles for the whole period.
    amount: int
    months: int


class BillingOut(ApiModel):
    # Tiers can be paid online here (TIERS_ENABLED and a PAYMENT_PROVIDER); otherwise — by a request.
    enabled: bool
    prices: list[PriceOut]


class CheckoutIn(ApiModel):
    tier: Literal["pro"] = "pro"
    period: BillingPeriod


class PaymentOut(ApiModel):
    id: uuid.UUID
    tier: str
    period: BillingPeriod
    amount: int
    status: PaymentStatus
    created_at: datetime
    paid_at: datetime | None
    # The end of the paid period this payment gave.
    paid_until: datetime | None


class CheckoutOut(ApiModel):
    payment: PaymentOut
    # Open it: the provider's page where the customer pays.
    payment_url: str


class AdminPaymentOut(PaymentOut):
    email: str
    user_id: uuid.UUID | None
    provider: str


class AdminPaymentPage(ApiModel):
    items: list[AdminPaymentOut]
    total: int
    limit: int
    offset: int
    # Roubles received in total (all paid payments, whatever the filter).
    paid_sum: int
