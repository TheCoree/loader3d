"""One-time 6-digit codes sent by email: confirming the address (at registration and on request) and
resetting a forgotten password (or changing it from the account page without the current one). Each kind
has its own columns on `User` (`verify_*`, `reset_*`).

Only an HMAC of the code is stored (keyed by the kind, so a code of one kind is useless for the other).
A code lives CODE_TTL, a new one can be requested after RESEND_COOLDOWN, and MAX_ATTEMPTS wrong tries
burn the code (a new one has to be requested).
"""

import hashlib
import hmac
import math
import secrets
from datetime import datetime, timedelta
from typing import Literal

from fastapi import status

from app import mail
from app.config import Settings
from app.errors import ApiError
from app.models import User

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5

CodeKind = Literal["verify", "reset"]


def _digest(settings: Settings, user: User, kind: CodeKind, code: str) -> str:
    key = settings.jwt_secret.get_secret_value().encode()
    return hmac.new(key, f"{kind}:{user.id}:{code}".encode(), hashlib.sha256).hexdigest()


def _clear(user: User, kind: CodeKind) -> None:
    setattr(user, f"{kind}_code_hash", None)
    setattr(user, f"{kind}_code_expires_at", None)
    setattr(user, f"{kind}_attempts", 0)


def resend_wait(user: User, now: datetime, kind: CodeKind = "verify") -> int:
    """Seconds until a new code may be sent (0 — now)."""
    sent_at: datetime | None = getattr(user, f"{kind}_code_sent_at")
    if sent_at is None:
        return 0
    return max(0, math.ceil((sent_at + RESEND_COOLDOWN - now).total_seconds()))


def mail_failed() -> ApiError:
    return ApiError(
        status.HTTP_503_SERVICE_UNAVAILABLE, "mail_failed", "Не удалось отправить письмо — попробуйте позже"
    )


async def issue_code(
    settings: Settings, user: User, now: datetime, kind: CodeKind = "verify", *, change: bool = False
) -> None:
    """A new code replaces the previous one. The caller checks the cooldown and commits. `change`: a
    "reset" code asked for from the account page (the letter speaks of changing the password).

    Raises mail.MailError if the letter was not sent; the user is not changed then (the previous code
    keeps working and no cooldown starts)."""
    code = f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"
    if kind == "verify":
        await mail.send_verification_code(settings, user.email, code)
    elif change:
        await mail.send_password_change_code(settings, user.email, code)
    else:
        await mail.send_password_reset_code(settings, user.email, code)
    setattr(user, f"{kind}_code_hash", _digest(settings, user, kind, code))
    setattr(user, f"{kind}_code_expires_at", now + CODE_TTL)
    setattr(user, f"{kind}_code_sent_at", now)
    setattr(user, f"{kind}_attempts", 0)


def _bad_request(code: str, message: str) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, code, message)


def check_code(settings: Settings, user: User, code: str, now: datetime, kind: CodeKind) -> None:
    """Uses up the code or raises; the caller commits either way (wrong attempts are counted)."""
    code_hash: str | None = getattr(user, f"{kind}_code_hash")
    expires_at: datetime | None = getattr(user, f"{kind}_code_expires_at")
    attempts: int = getattr(user, f"{kind}_attempts")
    if code_hash is None or expires_at is None:
        raise _bad_request("code_missing", "Запросите новый код")
    if attempts >= MAX_ATTEMPTS:
        raise _bad_request("code_attempts", "Слишком много неверных попыток — запросите новый код")
    if expires_at <= now:
        raise _bad_request("code_expired", "Срок действия кода истёк — запросите новый")
    if not hmac.compare_digest(code_hash, _digest(settings, user, kind, code)):
        attempts += 1
        setattr(user, f"{kind}_attempts", attempts)
        left = MAX_ATTEMPTS - attempts
        if left == 0:
            raise _bad_request("code_attempts", "Слишком много неверных попыток — запросите новый код")
        raise _bad_request("code_invalid", f"Неверный код. Осталось попыток: {left}")
    _clear(user, kind)


def confirm(settings: Settings, user: User, code: str, now: datetime) -> None:
    """Marks the email verified or raises; the caller commits either way (attempts are counted)."""
    if user.email_verified_at is not None:
        return
    check_code(settings, user, code, now, "verify")
    user.email_verified_at = now
