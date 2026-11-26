"""Who is on the site (app/presence.py) and the messages of the team to users (app/messages.py)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.auth import UserOut
from app.schemas.base import ApiModel

MessageKind = Literal["welcome", "gift", "feedback", "help", "custom"]
MessageOutcome = Literal["accepted", "dismissed"]
MessageAction = Literal["example"]
TabId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9-]{8,40}$")]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class PresenceDetail(ApiModel):
    """What is open in the editor or the demo."""

    plan: Annotated[str, StringConstraints(max_length=120)] | None = None
    vehicles: Annotated[int, Field(ge=0, le=1000)] | None = None
    items: Annotated[int, Field(ge=0, le=100_000)] | None = None
    demo: bool = False


class PresenceIn(ApiModel):
    tab: TabId
    # The visit of the statistics (src/lib/analytics.ts) this page load belongs to.
    visit_id: uuid.UUID | None = None
    path: Short = "/"
    section: Annotated[str, StringConstraints(max_length=40)] | None = None
    detail: PresenceDetail | None = None
    visible: bool = True
    idle_seconds: Annotated[int, Field(ge=0, le=86_400)] = 0
    # The tab is closing (sent with navigator.sendBeacon).
    leaving: bool = False


class UserMessageOut(ApiModel):
    """A message as the user sees it."""

    id: uuid.UUID
    kind: MessageKind
    title: str
    body: str
    button: str
    gift_days: int | None
    ask_reply: bool
    action: MessageAction | None
    created_at: datetime


class PresenceOut(ApiModel):
    # Messages of the team waiting to be shown (signed-in users only), oldest first.
    messages: list[UserMessageOut] = Field(default_factory=list)


class MessageAnswerIn(ApiModel):
    outcome: MessageOutcome
    reply: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class MessageAnswerOut(ApiModel):
    # The account after the answer: a gift changes its subscription.
    user: UserOut
    gift_until: datetime | None


class AdminMessageIn(ApiModel):
    kind: MessageKind = "custom"
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    button: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    gift_days: Annotated[int, Field(ge=1, le=365)] | None = None
    ask_reply: bool = False
    action: MessageAction | None = None


class AdminMessageOut(UserMessageOut):
    user_id: uuid.UUID
    user_email: str
    user_name: str
    author_name: str | None
    shown_at: datetime | None
    answered_at: datetime | None
    outcome: MessageOutcome | None
    reply: str | None
    gift_until: datetime | None


class LivePlace(ApiModel):
    city: str | None
    region: str | None
    country: str | None
    org: str | None


class LiveSource(ApiModel):
    """Where a guest's visit came from (the visit of the statistics); for a user — the letter they came by."""

    channel: str | None = None
    search_engine: str | None = None
    referrer_host: str | None = None
    utm_source: str | None = None
    utm_term: str | None = None
    # The company of the letter (outreach) whose link was followed.
    company: str | None = None


class LiveUser(ApiModel):
    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime
    plan_count: int
    tier: str | None
    trial: bool
    # The newest message of the team and what became of it.
    last_message: AdminMessageOut | None


class LiveTab(ApiModel):
    id: str
    # "guest", "user", "admin" (an administrator, or a guest from an administrator's address), "bot".
    kind: Literal["guest", "user", "admin", "bot"]
    online: bool
    first_seen: datetime
    last_seen: datetime
    path: str
    section: str | None
    detail: PresenceDetail | None
    visible: bool
    idle_seconds: int
    trail: list[str]
    ip: str
    place: LivePlace | None
    device: str
    browser: str
    os: str
    user: LiveUser | None
    source: LiveSource | None
    signed_up: bool


class LiveCounts(ApiModel):
    guests: int
    users: int
    # Signed-in users with a plan open in the editor.
    editing: int
    demo: int
    bots: int
    admins: int


class LiveOut(ApiModel):
    counts: LiveCounts
    tabs: list[LiveTab]
    # The place of an address is known (the DB-IP files are there).
    geo: bool
