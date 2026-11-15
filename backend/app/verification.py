"""Email verification: a 6-digit code sent at registration (and on request), confirmed by the user.

Only an HMAC of the code is stored. A code lives CODE_TTL, a new one can be requested after
RESEND_COOLDOWN, and MAX_ATTEMPTS wrong tries burn the code (a new one has to be requested).
"""

import hashlib
import hmac
import math
import secrets
from datetime import datetime, timedelta

from fastapi import status

from app import mail
from app.config import Settings
from app.errors import ApiError
from app.models import User

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5


def _digest(settings: Settings, user: User, code: str) -> str:
    key = settings.jwt_secret.get_secret_value().encode()
    return hmac.new(key, f"{user.id}:{code}".encode(), hashlib.sha256).hexdigest()


def resend_wait(user: User, now: datetime) -> int:
    """Seconds until a new code may be sent (0 — now)."""
    if user.verify_code_sent_at is None:
        return 0
    return max(0, math.ceil((user.verify_code_sent_at + RESEND_COOLDOWN - now).total_seconds()))


async def issue_code(settings: Settings, user: User, now: datetime) -> None:
    """A new code replaces the previous one. The caller checks the cooldown and commits."""
    code = f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"
    user.verify_code_hash = _digest(settings, user, code)
    user.verify_code_expires_at = now + CODE_TTL
    user.verify_code_sent_at = now
    user.verify_attempts = 0
    await mail.send_verification_code(settings, user.email, code)


def _bad_request(code: str, message: str) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, code, message)


def confirm(settings: Settings, user: User, code: str, now: datetime) -> None:
    """Marks the email verified or raises; the caller commits either way (attempts are counted)."""
    if user.email_verified_at is not None:
        return
    if user.verify_code_hash is None or user.verify_code_expires_at is None:
        raise _bad_request("code_missing", "Запросите новый код")
    if user.verify_attempts >= MAX_ATTEMPTS:
        raise _bad_request("code_attempts", "Слишком много неверных попыток — запросите новый код")
    if user.verify_code_expires_at <= now:
        raise _bad_request("code_expired", "Срок действия кода истёк — запросите новый")
    if not hmac.compare_digest(user.verify_code_hash, _digest(settings, user, code)):
        user.verify_attempts += 1
        left = MAX_ATTEMPTS - user.verify_attempts
        if left == 0:
            raise _bad_request("code_attempts", "Слишком много неверных попыток — запросите новый код")
        raise _bad_request("code_invalid", f"Неверный код. Осталось попыток: {left}")
    user.email_verified_at = now
    user.verify_code_hash = None
    user.verify_code_expires_at = None
    user.verify_attempts = 0
