from typing import Any

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import case, func, or_, select

from app.auth import CurrentAuth, clear_refresh_cookie, revoke_sessions
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found
from app.models import Plan, utcnow
from app.schemas.auth import (
    AccountDeleteIn,
    DisplaySettingsIn,
    PasswordChangeIn,
    UsageOut,
    UserOut,
    UserUpdateIn,
)
from app.security import hash_password, verify_password
from app.tiers import effective_tier, start_trial, tier_limits

router = APIRouter(prefix="/users", tags=["users"])


def _wrong_password() -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, "wrong_password", "Неверный пароль")


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


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChangeIn, auth: CurrentAuth, db: Db) -> None:
    """Changes the password and ends every other session; the current one stays logged in."""
    if not await verify_password(auth.user.password_hash, body.current_password):
        raise _wrong_password()
    auth.user.password_hash = await hash_password(body.new_password)
    await revoke_sessions(db, auth.user.id, keep=auth.session.id)
    await db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: AccountDeleteIn, auth: CurrentAuth, request: Request, response: Response, db: Db
) -> None:
    """Deletes the account with all its plans and sessions. Requires the password."""
    if not await verify_password(auth.user.password_hash, body.password):
        raise _wrong_password()
    await db.delete(auth.user)
    await db.commit()
    clear_refresh_cookie(response, request)
