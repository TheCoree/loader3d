import uuid
from contextlib import suppress
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth import (
    REFRESH_COOKIE,
    CurrentAuth,
    IssuedTokens,
    clear_refresh_cookie,
    clear_refresh_cookie_headers,
    end_session_by_refresh_token,
    refresh_session,
    revoke_sessions,
    set_refresh_cookie,
    start_session,
)
from app.config import Settings
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found, unauthorized
from app.mail import MailError
from app.models import AuthSession, User, utcnow
from app.ratelimit import RateLimiter, client_ip, too_many
from app.schemas.auth import (
    AuthOut,
    ForgotPasswordIn,
    ForgotPasswordOut,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    SessionOut,
    UserOut,
    VerifyEmailIn,
    VerifyResendOut,
)
from app.security import hash_password, password_needs_rehash, verify_password
from app.tiers import start_trial
from app.verification import RESEND_COOLDOWN, check_code, confirm, issue_code, mail_failed, resend_wait

router = APIRouter(prefix="/auth", tags=["auth"])

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE, include_in_schema=False)]

# Against password guessing: wrong passwords per account and per address (an office behind one NAT
# still fits); a right password clears the account's counter. Checked before the password itself.
LOGIN_FAILURES_PER_EMAIL = RateLimiter(10, timedelta(minutes=15))
LOGIN_FAILURES_PER_IP = RateLimiter(50, timedelta(minutes=15))
# Against mass sign-ups and probing which emails have accounts.
REGISTRATIONS_PER_IP = RateLimiter(10, timedelta(hours=1))
# Password reset: code requests (each account also has RESEND_COOLDOWN) and wrong codes per address.
RESET_REQUESTS_PER_IP = RateLimiter(10, timedelta(hours=1))
RESET_FAILURES_PER_IP = RateLimiter(20, timedelta(minutes=15))


def _auth_response(
    response: Response, request: Request, settings: Settings, user: User, tokens: IssuedTokens
) -> AuthOut:
    set_refresh_cookie(response, request, tokens)
    return AuthOut(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        user=UserOut.of(user, settings.tiers_enabled),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterIn, request: Request, response: Response, db: Db, settings: SettingsDep
) -> AuthOut:
    """Creates an account and logs in (sets the refresh cookie)."""
    if not settings.registration_open:
        raise ApiError(status.HTTP_403_FORBIDDEN, "registration_closed", "Регистрация закрыта")
    if wait := REGISTRATIONS_PER_IP.allow(client_ip(request)):
        raise too_many(wait, "Слишком много регистраций с этого адреса")
    email_taken = ApiError(status.HTTP_409_CONFLICT, "email_taken", "Этот email уже зарегистрирован")
    if await db.scalar(select(User.id).where(User.email == body.email)):
        raise email_taken

    user = User(
        email=body.email,
        password_hash=await hash_password(body.password),
        display_name=body.display_name or body.email.split("@", 1)[0][:100],
    )
    now = utcnow()
    if body.tier == "pro" and settings.tiers_enabled:
        start_trial(user, now)
    if not settings.email_verification:
        user.email_verified_at = now
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        raise email_taken from None
    if settings.email_verification:
        # Not sent: the account is created anyway, and the confirmation page offers a new code right away.
        with suppress(MailError):
            await issue_code(settings, user, now)
    tokens = await start_session(db, settings, user, request)
    await db.commit()
    return _auth_response(response, request, settings, user, tokens)


@router.post("/verify-email")
async def verify_email(body: VerifyEmailIn, auth: CurrentAuth, db: Db, settings: SettingsDep) -> UserOut:
    """Confirms the email with the code sent at registration (or by /verify-email/resend)."""
    try:
        confirm(settings, auth.user, body.code, utcnow())
    finally:
        # Wrong attempts are counted too.
        await db.commit()
    return UserOut.of(auth.user, settings.tiers_enabled)


@router.post("/verify-email/resend")
async def resend_verification(auth: CurrentAuth, db: Db, settings: SettingsDep) -> VerifyResendOut:
    """Sends a new code (the previous one stops working); at most once per cooldown."""
    user = auth.user
    if user.email_verified_at is not None:
        raise ApiError(status.HTTP_409_CONFLICT, "already_verified", "Email уже подтверждён")
    now = utcnow()
    wait = resend_wait(user, now)
    if wait > 0:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "resend_too_soon",
            f"Новый код можно запросить через {wait} с",
            headers={"Retry-After": str(wait)},
            retryAfter=wait,
        )
    try:
        await issue_code(settings, user, now)
    except MailError:
        raise mail_failed() from None
    await db.commit()
    return VerifyResendOut(retry_after=resend_wait(user, now))


@router.post("/login")
async def login(
    body: LoginIn, request: Request, response: Response, db: Db, settings: SettingsDep
) -> AuthOut:
    ip = client_ip(request)
    if wait := max(LOGIN_FAILURES_PER_EMAIL.retry_after(body.email), LOGIN_FAILURES_PER_IP.retry_after(ip)):
        raise too_many(wait, "Слишком много неудачных попыток входа", "too_many_attempts")
    user = await db.scalar(select(User).where(User.email == body.email))
    if not await verify_password(user.password_hash if user else None, body.password) or not user:
        LOGIN_FAILURES_PER_EMAIL.hit(body.email)
        LOGIN_FAILURES_PER_IP.hit(ip)
        raise unauthorized("invalid_credentials", "Неверный email или пароль")
    LOGIN_FAILURES_PER_EMAIL.reset(body.email)
    if not user.is_active:
        # Told only after the right password, so it does not reveal accounts to someone guessing.
        raise ApiError(status.HTTP_403_FORBIDDEN, "account_disabled", "Аккаунт заблокирован администратором")
    if password_needs_rehash(user.password_hash):
        user.password_hash = await hash_password(body.password)
    tokens = await start_session(db, settings, user, request)
    await db.commit()
    return _auth_response(response, request, settings, user, tokens)


@router.post("/password/forgot")
async def forgot_password(
    body: ForgotPasswordIn, request: Request, db: Db, settings: SettingsDep
) -> ForgotPasswordOut:
    """Emails a code for /password/reset. Answers the same whether or not the account exists."""
    if wait := RESET_REQUESTS_PER_IP.allow(client_ip(request)):
        raise too_many(wait, "Слишком много запросов на сброс пароля")
    now = utcnow()
    user = await db.scalar(select(User).where(User.email == body.email))
    if user is None or not user.is_active:
        return ForgotPasswordOut(retry_after=int(RESEND_COOLDOWN.total_seconds()))
    if wait := resend_wait(user, now, "reset"):
        # The code sent a moment ago still works; the page shows the same countdown.
        return ForgotPasswordOut(retry_after=wait)
    try:
        await issue_code(settings, user, now, "reset")
    except MailError:
        raise mail_failed() from None
    await db.commit()
    return ForgotPasswordOut(retry_after=resend_wait(user, now, "reset"))


@router.post("/password/reset")
async def reset_password(
    body: ResetPasswordIn, request: Request, response: Response, db: Db, settings: SettingsDep
) -> AuthOut:
    """Sets a new password with the emailed code, ends every session of the account and logs in here."""
    ip = client_ip(request)
    if wait := RESET_FAILURES_PER_IP.retry_after(ip):
        raise too_many(wait, "Слишком много неверных кодов", "too_many_attempts")
    user = await db.scalar(select(User).where(User.email == body.email))
    now = utcnow()
    try:
        if user is None or not user.is_active:
            raise ApiError(status.HTTP_400_BAD_REQUEST, "code_missing", "Запросите новый код")
        check_code(settings, user, body.code, now, "reset")
    except ApiError:
        RESET_FAILURES_PER_IP.hit(ip)
        await db.commit()  # wrong attempts are counted
        raise
    user.password_hash = await hash_password(body.password)
    # The code came to this mailbox, so the address is confirmed too.
    if user.email_verified_at is None:
        user.email_verified_at = now
    await revoke_sessions(db, user.id)
    LOGIN_FAILURES_PER_EMAIL.reset(user.email)
    tokens = await start_session(db, settings, user, request)
    await db.commit()
    return _auth_response(response, request, settings, user, tokens)


@router.post("/refresh")
async def refresh(
    request: Request, response: Response, db: Db, settings: SettingsDep, refresh_token: RefreshCookie = None
) -> AuthOut:
    """New access token (and rotated refresh cookie). Call on app start and on `token_expired`."""
    try:
        user, tokens = await refresh_session(db, settings, refresh_token, request)
    except ApiError as exc:
        exc.headers = {**(exc.headers or {}), **clear_refresh_cookie_headers(request)}
        raise
    return _auth_response(response, request, settings, user, tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request, response: Response, db: Db, settings: SettingsDep, refresh_token: RefreshCookie = None
) -> None:
    """Ends the current session. Works with an expired access token: only the cookie is needed."""
    await end_session_by_refresh_token(db, settings, refresh_token)
    clear_refresh_cookie(response, request)


@router.get("/sessions")
async def list_sessions(auth: CurrentAuth, db: Db) -> list[SessionOut]:
    """Active sessions (devices) of the current user, most recently used first."""
    sessions = await db.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == auth.user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utcnow(),
        )
        .order_by(AuthSession.last_used_at.desc(), AuthSession.id.desc())
    )
    return [
        SessionOut(
            id=s.id,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            expires_at=s.expires_at,
            user_agent=s.user_agent,
            ip_address=s.ip_address,
            current=s.id == auth.session.id,
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID, auth: CurrentAuth, request: Request, response: Response, db: Db
) -> None:
    if not await revoke_sessions(db, auth.user.id, only=session_id):
        raise not_found("session_not_found", "Сессия не найдена")
    await db.commit()
    if session_id == auth.session.id:
        clear_refresh_cookie(response, request)


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_other_sessions(auth: CurrentAuth, db: Db) -> None:
    """Log out on all other devices."""
    await revoke_sessions(db, auth.user.id, keep=auth.session.id)
    await db.commit()
