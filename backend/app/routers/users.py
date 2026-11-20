from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import case, func, or_, select

from app.auth import CurrentAuth, clear_refresh_cookie, revoke_sessions
from app.config import Settings
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found
from app.mail import MailError
from app.models import Plan, User, utcnow
from app.ratelimit import RateLimiter, too_many
from app.schemas.auth import (
    AccountDeleteIn,
    DisplaySettingsIn,
    ForgotPasswordOut,
    PasswordChangeIn,
    UsageOut,
    UserOut,
    UserUpdateIn,
)
from app.security import hash_password
from app.tiers import effective_tier, start_trial, tier_limits
from app.verification import CodeKind, check_code, issue_code, mail_failed, resend_wait

router = APIRouter(prefix="/users", tags=["users"])

# Letters with a code (password, deletion): a person needs one or two, a stolen session gets no more.
ACCOUNT_CODES_PER_USER = RateLimiter(5, timedelta(hours=1))


async def _send_code(user: User, db: Db, settings: Settings, kind: CodeKind) -> ForgotPasswordOut:
    """Emails the account a code of `kind` unless one was sent a moment ago (it still works then)."""
    now = utcnow()
    if wait := resend_wait(user, now, kind):
        return ForgotPasswordOut(retry_after=wait)
    if wait := ACCOUNT_CODES_PER_USER.allow(str(user.id)):
        raise too_many(wait, "Слишком много писем с кодом — попробуйте позже")
    try:
        await issue_code(settings, user, now, kind, change=kind == "reset")
    except MailError:
        raise mail_failed() from None
    await db.commit()
    return ForgotPasswordOut(retry_after=resend_wait(user, now, kind))


async def _use_code(user: User, db: Db, settings: Settings, code: str, kind: CodeKind) -> None:
    """Uses up the emailed code or raises (wrong attempts are counted)."""
    now = utcnow()
    try:
        check_code(settings, user, code, now, kind)
    except ApiError:
        await db.commit()
        raise
    # The code came to this mailbox, so the address is confirmed too.
    if user.email_verified_at is None:
        user.email_verified_at = now


@router.get("/me")
async def get_me(auth: CurrentAuth, settings: SettingsDep) -> UserOut:
    return UserOut.of(auth.user, settings.tiers_enabled)


@router.patch("/me")
async def update_me(body: UserUpdateIn, auth: CurrentAuth, db: Db, settings: SettingsDep) -> UserOut:
    if body.display_name is not None:
        auth.user.display_name = body.display_name
    await db.commit()
    return UserOut.of(auth.user, settings.tiers_enabled)


@router.patch("/me/settings")
async def update_settings(body: DisplaySettingsIn, auth: CurrentAuth, db: Db) -> dict[str, Any]:
    """Saves editor display settings for every device of the account; returns all saved settings."""
    changed = body.model_dump(by_alias=True, exclude_none=True)
    auth.user.settings = {**(auth.user.settings or {}), **changed}
    await db.commit()
    return auth.user.settings


@router.get("/me/usage")
async def get_usage(auth: CurrentAuth, db: Db, settings: SettingsDep) -> UsageOut:
    """How much of the tier's limits the account uses: plans, the largest plan, plans over the limits."""
    if not settings.tiers_enabled:
        raise not_found("tiers_disabled", "Тарифы отключены")
    limits = tier_limits(auth.user, utcnow())
    over = or_(Plan.vehicle_count > limits.vehicles, Plan.item_count > limits.items)
    plans, max_vehicles, max_items, over_limit = (
        await db.execute(
            select(
                func.count(),
                func.max(Plan.vehicle_count),
                func.max(Plan.item_count),
                func.sum(case((over, 1), else_=0)),
            ).where(Plan.owner_id == auth.user.id)
        )
    ).one()
    return UsageOut(
        plans=plans,
        max_vehicles=max_vehicles or 0,
        max_items=max_items or 0,
        over_limit=over_limit or 0,
    )


@router.post("/me/trial")
async def take_trial(auth: CurrentAuth, db: Db, settings: SettingsDep) -> UserOut:
    """Starts the free trial of «Pro» (once per account, from the «Старт» tier)."""
    if not settings.tiers_enabled:
        raise not_found("tiers_disabled", "Тарифы отключены")
    user = auth.user
    if user.trial_used_at is not None:
        raise ApiError(status.HTTP_409_CONFLICT, "trial_used", "Пробный период уже использован")
    if effective_tier(user, utcnow()) != "free":
        raise ApiError(status.HTTP_409_CONFLICT, "already_paid", "У вас уже подключён платный тариф")
    start_trial(user, utcnow())
    await db.commit()
    return UserOut.of(user, settings.tiers_enabled)


@router.post("/me/password/code")
async def send_password_code(auth: CurrentAuth, db: Db, settings: SettingsDep) -> ForgotPasswordOut:
    """Emails the account the code for POST /me/password. The same code as for a forgotten password: a
    new one replaces it."""
    return await _send_code(auth.user, db, settings, "reset")


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChangeIn, auth: CurrentAuth, db: Db, settings: SettingsDep) -> None:
    """Changes the password with the emailed code — the current password is not asked: if it leaked, it
    must not be enough to take the account — and ends every other session; this one stays logged in."""
    user = auth.user
    await _use_code(user, db, settings, body.code, "reset")
    user.password_hash = await hash_password(body.new_password)
    await revoke_sessions(db, auth.user.id, keep=auth.session.id)
    await db.commit()


@router.post("/me/delete/code")
async def send_delete_code(auth: CurrentAuth, db: Db, settings: SettingsDep) -> ForgotPasswordOut:
    """Emails the account the code for DELETE /me."""
    return await _send_code(auth.user, db, settings, "delete")


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: AccountDeleteIn,
    auth: CurrentAuth,
    request: Request,
    response: Response,
    db: Db,
    settings: SettingsDep,
) -> None:
    """Deletes the account with all its plans and sessions; confirmed with the code emailed by
    POST /me/delete/code."""
    await _use_code(auth.user, db, settings, body.code, "delete")
    await db.delete(auth.user)
    await db.commit()
    clear_refresh_cookie(response, request)
