"""Messages of the team to users (app/messages.py): what the user does with them, and the admin's side."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app import messages, tiers
from app.auth import AdminAuth, CurrentAuth
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found
from app.models import User, UserMessage, utcnow
from app.schemas.auth import UserOut
from app.schemas.presence import (
    AdminMessageIn,
    AdminMessageOut,
    MessageAnswerIn,
    MessageAnswerOut,
    UserMessageOut,
)

router = APIRouter(tags=["messages"])


async def _own(db: Db, auth: CurrentAuth, message_id: uuid.UUID, lock: bool = False) -> UserMessage:
    query = select(UserMessage).where(UserMessage.id == message_id, UserMessage.user_id == auth.user.id)
    message = await db.scalar(query.with_for_update() if lock else query)
    if message is None:
        raise not_found("message_not_found", "Сообщение не найдено")
    return message


@router.get("/messages")
async def waiting(auth: CurrentAuth, db: Db) -> list[UserMessageOut]:
    """Messages not answered yet, oldest first (the app also gets them with its presence reports)."""
    return [UserMessageOut.model_validate(m) for m in await messages.pending(db, auth.user.id)]


@router.post("/messages/{message_id}/shown", status_code=status.HTTP_204_NO_CONTENT)
async def shown(message_id: uuid.UUID, auth: CurrentAuth, db: Db) -> None:
    messages.mark_shown(await _own(db, auth, message_id), utcnow())
    await db.commit()


@router.post("/messages/{message_id}/answer")
async def answer(
    message_id: uuid.UUID, body: MessageAnswerIn, auth: CurrentAuth, db: Db, settings: SettingsDep
) -> MessageAnswerOut:
    """The button (`accepted`, with the reply if asked; a gift is granted) or closed (`dismissed`)."""
    message = await _own(db, auth, message_id, lock=True)
    if message.outcome is not None:
        raise ApiError(status.HTTP_409_CONFLICT, "already_answered", "На это сообщение уже ответили")
    now = utcnow()
    messages.mark_shown(message, now)
    message.outcome = body.outcome
    message.answered_at = now
    if message.ask_reply and body.reply:
        message.reply = body.reply
    if body.outcome == "accepted" and message.gift_days and settings.tiers_enabled:
        message.gift_until = tiers.gift_pro(auth.user, message.gift_days, now)
    await db.commit()
    return MessageAnswerOut(user=UserOut.of(auth.user, settings.tiers_enabled), gift_until=message.gift_until)


@router.get("/admin/messages")
async def recent(
    auth: AdminAuth, db: Db, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[AdminMessageOut]:
    """The newest messages to everyone, with what became of them."""
    rows = list(await db.scalars(select(UserMessage).order_by(UserMessage.created_at.desc()).limit(limit)))
    return await messages.with_people(db, rows)


@router.get("/admin/users/{user_id}/messages")
async def of_user(user_id: uuid.UUID, auth: AdminAuth, db: Db) -> list[AdminMessageOut]:
    rows = list(
        await db.scalars(
            select(UserMessage).where(UserMessage.user_id == user_id).order_by(UserMessage.created_at.desc())
        )
    )
    return await messages.with_people(db, rows)


@router.post("/admin/users/{user_id}/messages", status_code=status.HTTP_201_CREATED)
async def send(
    user_id: uuid.UUID, body: AdminMessageIn, auth: AdminAuth, db: Db, settings: SettingsDep
) -> AdminMessageOut:
    user = await db.get(User, user_id)
    if user is None:
        raise not_found("user_not_found", "Пользователь не найден")
    if body.gift_days:
        if not settings.tiers_enabled:
            raise ApiError(
                status.HTTP_400_BAD_REQUEST, "gifts_disabled", "Подарки работают только с тарифами"
            )
        now = utcnow()
        tier = tiers.effective_tier(user, now)
        if tier == "custom" or (tier == "pro" and user.tier_expires_at is None):
            raise ApiError(
                status.HTTP_400_BAD_REQUEST,
                "gift_not_applicable",
                "У пользователя «Индивидуальный» или бессрочный Pro — дарить нечего",
            )
    message = UserMessage(user_id=user.id, author_id=auth.user.id, **body.model_dump(by_alias=False))
    db.add(message)
    await db.commit()
    return messages.admin_out(message, user, auth.user.display_name)


@router.delete("/admin/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw(message_id: uuid.UUID, auth: AdminAuth, db: Db) -> None:
    """Takes back a message nobody has answered yet."""
    message = await db.get(UserMessage, message_id)
    if message is None:
        raise not_found("message_not_found", "Сообщение не найдено")
    if message.outcome is not None:
        raise ApiError(status.HTTP_409_CONFLICT, "already_answered", "На это сообщение уже ответили")
    await db.delete(message)
    await db.commit()
