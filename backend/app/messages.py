"""Messages of the team to a user (UserMessage): written in the admin panel from presets
(src/pages/AdminMessages.tsx), delivered with the answer to the tab's presence report (routers/presence.py)
and shown as a dialog (src/components/MessageDialog.tsx). The admin sees what became of each: shown, the
button pressed or closed, the reply. A gift of «Pro» days (tiers on) is granted when the button is pressed
(tiers.gift_pro)."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserMessage
from app.schemas.presence import AdminMessageOut

# At most this many waiting messages go to the app at once; the rest follow as these are answered.
PENDING_LIMIT = 5


async def pending(db: AsyncSession, user_id: uuid.UUID) -> list[UserMessage]:
    return list(
        await db.scalars(
            select(UserMessage)
            .where(UserMessage.user_id == user_id, UserMessage.outcome.is_(None))
            .order_by(UserMessage.created_at)
            .limit(PENDING_LIMIT)
        )
    )


def admin_out(message: UserMessage, user: User, author_name: str | None) -> AdminMessageOut:
    return AdminMessageOut(
        id=message.id,
        kind=message.kind,  # type: ignore[arg-type]
        title=message.title,
        body=message.body,
        button=message.button,
        gift_days=message.gift_days,
        ask_reply=message.ask_reply,
        action=message.action,  # type: ignore[arg-type]
        created_at=message.created_at,
        user_id=user.id,
        user_email=user.email,
        user_name=user.display_name,
        author_name=author_name,
        shown_at=message.shown_at,
        answered_at=message.answered_at,
        outcome=message.outcome,  # type: ignore[arg-type]
        reply=message.reply,
        gift_until=message.gift_until,
    )


async def with_people(db: AsyncSession, messages: list[UserMessage]) -> list[AdminMessageOut]:
    """The messages with their recipients and authors, for the admin panel."""
    ids = {m.user_id for m in messages} | {m.author_id for m in messages if m.author_id}
    people = {u.id: u for u in await db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    out = []
    for m in messages:
        user = people.get(m.user_id)
        if user is None:
            continue
        author = people.get(m.author_id) if m.author_id else None
        out.append(admin_out(m, user, author.display_name if author else None))
    return out


def mark_shown(message: UserMessage, now: datetime) -> None:
    if message.shown_at is None:
        message.shown_at = now
