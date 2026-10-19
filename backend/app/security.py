"""Password hashing (Argon2id) and JWT encoding. No database access here."""

import asyncio
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import Settings
from app.models import utcnow

TokenType = Literal["access", "refresh"]

ALGORITHM = "HS256"
ISSUER = "loader3d"
LEEWAY = timedelta(seconds=10)

_hasher = PasswordHasher()
# Verified against when the e-mail is unknown, so login takes the same time either way.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


async def hash_password(password: str) -> str:
    # Argon2 is deliberately slow and releases the GIL: keep it off the event loop.
    return await asyncio.to_thread(_hasher.hash, password)


async def verify_password(password_hash: str | None, password: str) -> bool:
    def verify() -> bool:
        try:
            return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
        except VerificationError, InvalidHashError:
            return False

    return await asyncio.to_thread(verify)


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_jti() -> str:
    return secrets.token_urlsafe(32)


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID
    jti: str
    expires_at: datetime


class InvalidTokenError(Exception):
    def __init__(self, reason: str, *, expired: bool = False) -> None:
        super().__init__(reason)
        self.expired = expired


def encode_token(
    settings: Settings,
    token_type: TokenType,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    jti: str,
    expires_at: datetime,
) -> str:
    payload = {
        "iss": ISSUER,
        "typ": token_type,
        "sub": str(user_id),
        "sid": str(session_id),
        "jti": jti,
        "iat": utcnow(),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_token(settings: Settings, token: str, token_type: TokenType) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            leeway=LEEWAY,
            options={"require": ["iss", "typ", "sub", "sid", "jti", "iat", "exp"]},
        )
        # An access token must never be accepted as a refresh token and vice versa.
        if payload["typ"] != token_type:
            raise InvalidTokenError("wrong token type")
        return TokenClaims(
            user_id=uuid.UUID(payload["sub"]),
            session_id=uuid.UUID(payload["sid"]),
            jti=str(payload["jti"]),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError(str(exc), expired=True) from exc
    except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
        raise InvalidTokenError(str(exc)) from exc
