import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, EmailStr, StringConstraints

from app.schemas.base import ApiModel

# email-validator already caps the length at 254 characters.
Email = Annotated[EmailStr, AfterValidator(str.lower)]
# Login accepts anything e-mail-like: a malformed address simply does not match an account.
LoginEmail = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=320)
]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class RegisterIn(ApiModel):
    email: Email
    password: NewPassword
    display_name: DisplayName | None = None


class LoginIn(ApiModel):
    email: LoginEmail
    password: Password


class UserOut(ApiModel):
    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime


class AuthOut(ApiModel):
    """Access token for the `Authorization: Bearer` header; the refresh token is an httpOnly cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class SessionOut(ApiModel):
    id: uuid.UUID
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip_address: str | None
    current: bool


class UserUpdateIn(ApiModel):
    display_name: DisplayName | None = None


class PasswordChangeIn(ApiModel):
    current_password: Password
    new_password: NewPassword


class AccountDeleteIn(ApiModel):
    password: Password
