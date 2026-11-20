import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, LargeBinary, MetaData, String, Uuid, false
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetimes on every backend (SQLite stores them without an offset)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime; use app.models.utcnow()")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    type_annotation_map = {
        datetime: UTCDateTime(),
        uuid.UUID: Uuid(),
        dict[str, Any]: JSON().with_variant(JSONB(), "postgresql"),
    }


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    # Stored lower-cased: uniqueness and login are case-insensitive.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(default=True)
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Display settings of the editor (src/store/useStore.ts `Settings`), camelCase; null — defaults.
    settings: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    # Email confirmed with a code (app/verification.py); null — not yet, plans are closed until then.
    email_verified_at: Mapped[datetime | None]
    # The pending code: its HMAC, expiry, when it was sent (resend cooldown) and wrong attempts so far.
    verify_code_hash: Mapped[str | None] = mapped_column(String(64))
    verify_code_expires_at: Mapped[datetime | None]
    verify_code_sent_at: Mapped[datetime | None]
    verify_attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    # A pending code for resetting a forgotten password, the same way (app/verification.py).
    reset_code_hash: Mapped[str | None] = mapped_column(String(64))
    reset_code_expires_at: Mapped[datetime | None]
    reset_code_sent_at: Mapped[datetime | None]
    reset_attempts: Mapped[int] = mapped_column(default=0, server_default="0")

    # Subscription (app/tiers.py): "free", "pro" or "custom" (by contract, set by an admin).
    # A paid tier past `tier_expires_at` works as "free" until it is renewed; null — no end date.
    tier: Mapped[str] = mapped_column(String(20), default="free", server_default="free")
    tier_expires_at: Mapped[datetime | None]
    # The current period is the free trial of "pro".
    tier_trial: Mapped[bool] = mapped_column(default=False, server_default=false())
    trial_used_at: Mapped[datetime | None]
    # "custom" only: {"plans", "vehicles", "items"} overriding the tier's limits (null — no limit).
    tier_limits: Mapped[dict[str, Any] | None]
    # Admin's note: contract, invoice, contact person.
    tier_note: Mapped[str | None] = mapped_column(String(500))
    # The `tier_expires_at` the last «тариф заканчивается» letter was about (app/billing.py): one per period.
    tier_reminder_for: Mapped[datetime | None]

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    plans: Mapped[list[Plan]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )


class Lead(Base):
    """A request from the landing page or the account page: the "custom" tier, help with a plan."""

    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    company: Mapped[str | None] = mapped_column(String(200))
    message: Mapped[str | None] = mapped_column(String(2000))
    # The tier the request is about, if any.
    tier: Mapped[str | None] = mapped_column(String(20))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    # "new" until an admin handles it, then "done".
    status: Mapped[str] = mapped_column(String(20), default="new", server_default="new")
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)


class Payment(Base):
    """An online payment of a tier (app/billing.py): created at checkout, then paid or canceled through the
    payment provider. Kept when the account is deleted (`email` stays) — it is an accounting record."""

    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    email: Mapped[str] = mapped_column(String(320))
    tier: Mapped[str] = mapped_column(String(20))
    # "month" or "year" (app/billing.py PERIOD_MONTHS).
    period: Mapped[str] = mapped_column(String(10))
    # Roubles, from app/billing.py PRICES at checkout.
    amount: Mapped[int]
    # "pending" until the provider reports "paid" or "canceled".
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    provider: Mapped[str] = mapped_column(String(20))
    # The provider's id of the payment and its page where the customer pays.
    provider_payment_id: Mapped[str | None] = mapped_column(String(100), index=True)
    payment_url: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    paid_at: Mapped[datetime | None]
    # The end of the paid period this payment gave (null until paid, or if it did not change the tier).
    paid_until: Mapped[datetime | None]


class Visit(Base):
    """A visit to the public pages (app/analytics.py): one page load of a visitor who is not signed in.

    Nothing identifies the person: `visitor` is a hash of the IP and the browser with a salt that changes
    every day (unique visitors per day); the IP and the user agent themselves are not stored."""

    __tablename__ = "analytics_visits"

    # Made by the browser for the page load (src/lib/analytics.ts).
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    visitor: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow)
    # The first page (path only) and where the visitor came from.
    landing_path: Mapped[str] = mapped_column(String(200))
    referrer_host: Mapped[str | None] = mapped_column(String(200))
    # app/analytics.py CHANNELS: "search", "ads", "social", "email", "campaign", "referral", "direct".
    channel: Mapped[str] = mapped_column(String(20))
    # The search engine for "search" (and "ads" from a search engine): "Яндекс", "Google"…
    search_engine: Mapped[str | None] = mapped_column(String(40))
    utm_source: Mapped[str | None] = mapped_column(String(200))
    utm_medium: Mapped[str | None] = mapped_column(String(200))
    utm_campaign: Mapped[str | None] = mapped_column(String(200))
    utm_term: Mapped[str | None] = mapped_column(String(200))
    utm_content: Mapped[str | None] = mapped_column(String(200))
    # "desktop", "mobile", "tablet"; the browser and the system by name.
    device: Mapped[str] = mapped_column(String(20))
    browser: Mapped[str] = mapped_column(String(40))
    os: Mapped[str] = mapped_column(String(40))
    screen_width: Mapped[int | None]
    language: Mapped[str | None] = mapped_column(String(35))
    pageviews: Mapped[int] = mapped_column(default=0, server_default="0")
    # Time the page was in front of the visitor and they were active (not just an open background tab).
    engaged_ms: Mapped[int] = mapped_column(default=0, server_default="0")
    # An account was registered during the visit.
    signed_up: Mapped[bool] = mapped_column(default=False, server_default=false())

    events: Mapped[list[VisitEvent]] = relationship(
        back_populates="visit", cascade="all, delete-orphan", passive_deletes=True
    )


class VisitEvent(Base):
    """What happened in a visit: a page ("page", the path), time in a section of the landing page
    ("section", its id; `value` — milliseconds since the last report), a click on a marked button
    ("click", its name) or a registration ("signup")."""

    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    visit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analytics_visits.id", ondelete="CASCADE"), index=True
    )
    at: Mapped[datetime] = mapped_column(default=utcnow)
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    value: Mapped[int | None]

    visit: Mapped[Visit] = relationship(back_populates="events")


class AuthSession(Base):
    """A login on one device. The refresh token carries its id (`sid`) and the current `refresh_jti`.

    A refresh rotates the jti (at most once per grace period). Presenting an older jti means the token
    was copied, so the session is revoked, except for `previous_jti` within that grace period (parallel tabs).
    """

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_jti: Mapped[str] = mapped_column(String(64))
    previous_jti: Mapped[str | None] = mapped_column(String(64))
    rotated_at: Mapped[datetime | None]
    user_agent: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]

    user: Mapped[User] = relationship(back_populates="sessions")


class Plan(Base):
    """A saved loading scheme. `data` is the frontend's `Plan` JSON (src/core/types.ts) as is."""

    __tablename__ = "plans"
    __table_args__ = (Index("ix_plans_owner_id_updated_at", "owner_id", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    # casefold()-ed name: case-insensitive search and sort that behave the same on SQLite and Postgres.
    name_key: Mapped[str] = mapped_column(String(200))
    data: Mapped[dict[str, Any]]
    # Denormalized from `data` so the list does not load every plan body.
    vehicle_count: Mapped[int] = mapped_column(server_default="1")
    body_count: Mapped[int]
    item_count: Mapped[int]
    # Optimistic locking: bumped by SQLAlchemy on every UPDATE, clients send the version they edited.
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    # When the preview picture (PlanThumbnail) was last replaced; null — none yet. Set with a Core UPDATE
    # that keeps `version` and `updated_at`: a new picture is not an edit of the plan.
    thumbnail_at: Mapped[datetime | None]

    owner: Mapped[User] = relationship(back_populates="plans")

    __mapper_args__ = {"version_id_col": version}


class PlanThumbnail(Base):
    """The preview picture of a plan for its card on the home page, rendered by the editor."""

    __tablename__ = "plan_thumbnails"

    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(20))
    image: Mapped[bytes] = mapped_column(LargeBinary)
