"""Resetting a forgotten password with a code from email (/auth/password/forgot, /auth/password/reset)."""

from datetime import timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from app import mail, verification
from app.config import Settings
from app.models import User
from tests.conftest import PASSWORD, ClientFactory, error_code, login, make_settings, register

NEW_PASSWORD = "a brand new password"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, email_verification=True)


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """Password reset codes only; verification codes are dropped."""
    sent: list[tuple[str, str]] = []

    async def capture(settings: Settings, email: str, code: str) -> None:
        sent.append((email, code))

    async def ignore(settings: Settings, email: str, code: str) -> None:
        pass

    monkeypatch.setattr(mail, "send_password_reset_code", capture)
    monkeypatch.setattr(mail, "send_verification_code", ignore)
    return sent


async def _forgot(client: httpx.AsyncClient, email: str = "anna@example.com") -> httpx.Response:
    return await client.post("/api/auth/password/forgot", json={"email": email})


async def _reset(
    client: httpx.AsyncClient, code: str, password: str = NEW_PASSWORD, email: str = "anna@example.com"
) -> httpx.Response:
    return await client.post(
        "/api/auth/password/reset", json={"email": email, "code": code, "password": password}
    )


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def test_reset_sets_the_password_ends_sessions_and_logs_in(
    make_client: ClientFactory, outbox: list
) -> None:
    laptop, phone = await make_client(), await make_client()
    await register(laptop)
    stolen = laptop.headers["authorization"]

    response = await _forgot(phone, "ANNA@example.com ")
    assert response.status_code == 200, response.text
    assert response.json()["retryAfter"] == verification.RESEND_COOLDOWN.seconds
    assert [email for email, _ in outbox] == ["anna@example.com"]

    response = await _reset(phone, outbox[-1][1])
    assert response.status_code == 200, response.text
    body = response.json()
    # The code proved the mailbox, so the email is confirmed as well.
    assert body["user"]["emailVerified"] is True
    phone.headers["authorization"] = f"Bearer {body['accessToken']}"
    assert (await phone.get("/api/plans")).status_code == 200

    # Every earlier session is over.
    assert (await laptop.get("/api/users/me", headers={"authorization": stolen})).status_code == 401
    assert (await laptop.post("/api/auth/refresh")).status_code == 401
    old = await laptop.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert error_code(old) == "invalid_credentials"
    await login(laptop, password=NEW_PASSWORD)

    # The code is used up.
    assert error_code(await _reset(phone, outbox[-1][1], "yet another password")) == "code_missing"


async def test_unknown_email_gets_the_same_answer(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    known = await _forgot(client)
    unknown = await _forgot(client, "nobody@example.com")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(outbox) == 1
    assert error_code(await _reset(client, "123456", email="nobody@example.com")) == "code_missing"


async def test_blocked_account_gets_no_code(app: FastAPI, client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    async with app.state.sessionmaker() as db:
        await db.execute(update(User).values(is_active=False))
        await db.commit()
    assert (await _forgot(client)).status_code == 200
    assert outbox == []


async def test_wrong_codes_burn_the_code(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    await _forgot(client)
    code = outbox[-1][1]
    for left in range(verification.MAX_ATTEMPTS - 1, 0, -1):
        response = await _reset(client, _wrong(code))
        assert error_code(response) == "code_invalid"
        assert str(left) in response.json()["detail"]["message"]
    assert error_code(await _reset(client, _wrong(code))) == "code_attempts"
    assert error_code(await _reset(client, code)) == "code_attempts"
    await login(client)  # the password did not change


async def test_repeated_request_keeps_the_code_until_the_cooldown(
    app: FastAPI, client: httpx.AsyncClient, outbox: list
) -> None:
    await register(client)
    await _forgot(client)
    again = await _forgot(client)
    assert again.status_code == 200
    assert 0 < again.json()["retryAfter"] <= verification.RESEND_COOLDOWN.seconds
    assert len(outbox) == 1

    async with app.state.sessionmaker() as db:
        user = await db.scalar(select(User))
        assert user is not None and user.reset_code_sent_at is not None
        user.reset_code_sent_at -= verification.RESEND_COOLDOWN
        await db.commit()
    await _forgot(client)
    assert len(outbox) == 2


async def test_expired_code(app: FastAPI, client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    await _forgot(client)
    async with app.state.sessionmaker() as db:
        user = await db.scalar(select(User))
        assert user is not None and user.reset_code_expires_at is not None
        user.reset_code_expires_at -= verification.CODE_TTL + timedelta(seconds=1)
        await db.commit()
    assert error_code(await _reset(client, outbox[-1][1])) == "code_expired"


async def test_verification_code_does_not_reset_the_password(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch, outbox: list
) -> None:
    verify_codes: list[str] = []

    async def capture(settings: Settings, email: str, code: str) -> None:
        verify_codes.append(code)

    monkeypatch.setattr(mail, "send_verification_code", capture)
    await register(client)
    await _forgot(client)
    if verify_codes[-1] != outbox[-1][1]:
        assert error_code(await _reset(client, verify_codes[-1])) == "code_invalid"


async def test_new_password_must_be_long_enough(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    await _forgot(client)
    assert (await _reset(client, outbox[-1][1], "short")).status_code == 422
