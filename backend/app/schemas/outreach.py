"""Admin panel «Почта»: letters to companies (app/outreach.py) and the mailbox they are answered in
(app/inbox.py)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints

from app.schemas.auth import Email
from app.schemas.base import ApiModel

OutreachStatus = Literal["new", "queued", "sent", "failed"]
MailKind = Literal["reply", "bounce", "auto", "letter"]


class OutreachSignup(ApiModel):
    email: str
    created_at: datetime


class OutreachContactOut(ApiModel):
    id: uuid.UUID
    company: str
    email: str
    city: str | None
    note: str | None
    ref: str
    link: str
    status: OutreachStatus
    queued_at: datetime | None
    sent_at: datetime | None
    error: str | None
    created_at: datetime
    # Visits of the public pages that came by the link (the visit statistics, utm_term = ref).
    visits: int
    # Accounts registered with this code.
    signups: list[OutreachSignup]


class OutreachList(ApiModel):
    items: list[OutreachContactOut]
    # Who the letters are from (OUTREACH_FROM or MAIL_FROM) and whether they really leave (MAIL_BACKEND=smtp).
    sender: str
    sending: bool


class OutreachContactIn(ApiModel):
    company: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    email: Email
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    # «возите продукты по Крыму своим автопарком» — goes after «Видели, что вы …» in the letter.
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class OutreachLetterOut(ApiModel):
    sender: str
    to: str
    subject: str
    text: str


class OutreachQueued(ApiModel):
    queued: int


class MailMessageOut(ApiModel):
    uid: str
    received_at: datetime | None
    sender_name: str
    sender: str
    subject: str
    kind: MailKind
    # Bounces: the address the failed letter was for.
    about: str | None
    text: str
    # The company it is from (or, for a bounce, about).
    contact_id: uuid.UUID | None


class MailboxOut(ApiModel):
    messages: list[MailMessageOut]
    # Why the mailbox could not be read; null — read.
    error: str | None
