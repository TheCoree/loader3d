"""Email verification by a 6-digit code (app/verification.py)."""

from datetime import timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from app import mail, verification
from app.config import Settings
from app.models import User
from tests.conftest import ClientFactory, error_code, make_settings, register


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, email_verification=True)


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    async def capture(settings: Settings, email: str, code: str) -> None:
        sent.append((email, code))

    monkeypatch.setattr(mail, "send_verification_code", capture)
    return sent


async def _move_sent_at_back(app: FastAPI, email: str, by: timedelta) -> None:
    async with app.state.sessionmaker() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None and user.verify_code_sent_at is not None
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                verify_code_sent_at=user.verify_code_sent_at - by,
                verify_code_expires_at=(user.verify_code_expires_at or user.verify_code_sent_at) - by,
            )
        )
        await db.commit()


async def test_registration_sends_a_code_and_closes_plans(client: httpx.AsyncClient, outbox: list) -> None:
    body = {"email": "anna@example.com", "password": "correct horse"}
    response = await client.post("/api/auth/register", json=body)
    assert response.status_code == 201
    assert response.json()["user"]["emailVerified"] is False
    assert [email for email, _ in outbox] == ["anna@example.com"]
    client.headers["authorization"] = f"Bearer {response.json()['accessToken']}"

    blocked = await client.get("/api/plans")
    assert blocked.status_code == 403
    assert error_code(blocked) == "email_not_verified"
    # The account itself still works: the app shows the code screen with the user's email.
    assert (await client.get("/api/users/me")).status_code == 200


async def test_the_right_code_opens_plans(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    code = outbox[-1][1]
    response = await client.post("/api/auth/verify-email", json={"code": code})
    assert response.status_code == 200, response.text
    assert response.json()["emailVerified"] is True
    assert (await client.get("/api/plans")).status_code == 200
    # Confirming again is harmless.
    assert (await client.post("/api/auth/verify-email", json={"code": code})).status_code == 200


async def test_wrong_codes_are_counted_and_burn_the_code(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    code = outbox[-1][1]
    wrong = "000000" if code != "000000" else "111111"
    for left in range(verification.MAX_ATTEMPTS - 1, 0, -1):
        response = await client.post("/api/auth/verify-email", json={"code": wrong})
        assert error_code(response) == "code_invalid"
        assert str(left) in response.json()["detail"]["message"]
    assert error_code(await client.post("/api/auth/verify-email", json={"code": wrong})) == "code_attempts"
    # Even the right code does not work any more: a new one is needed.
    assert error_code(await client.post("/api/auth/verify-email", json={"code": code})) == "code_attempts"


async def test_malformed_code_is_rejected(client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    assert (await client.post("/api/auth/verify-email", json={"code": "12ab"})).status_code == 422


async def test_expired_code(app: FastAPI, client: httpx.AsyncClient, outbox: list) -> None:
    await register(client)
    code = outbox[-1][1]
    await _move_sent_at_back(app, "anna@example.com", verification.CODE_TTL + timedelta(seconds=1))
    assert error_code(await client.post("/api/auth/verify-email", json={"code": code})) == "code_expired"


async def test_resend_has_a_cooldown_and_replaces_the_code(
    app: FastAPI, client: httpx.AsyncClient, outbox: list
) -> None:
    await register(client)
    first = outbox[-1][1]
    too_soon = await client.post("/api/auth/verify-email/resend")
    assert too_soon.status_code == 429
    assert error_code(too_soon) == "resend_too_soon"
    assert int(too_soon.headers["retry-after"]) > 0

    await _move_sent_at_back(app, "anna@example.com", verification.RESEND_COOLDOWN)
    response = await client.post("/api/auth/verify-email/resend")
    assert response.status_code == 200, response.text
    assert response.json()["retryAfter"] == verification.RESEND_COOLDOWN.seconds
    second = outbox[-1][1]
    assert len(outbox) == 2
    if second != first:
        assert error_code(await client.post("/api/auth/verify-email", json={"code": first})) == "code_invalid"
    assert (await client.post("/api/auth/verify-email", json={"code": second})).status_code == 200
    assert error_code(await client.post("/api/auth/verify-email/resend")) == "already_verified"


async def test_codes_are_per_account(make_client: ClientFactory, outbox: list) -> None:
    anna, boris = await make_client(), await make_client()
    await register(anna, "anna@example.com")
    await register(boris, "boris@example.com")
    boris_code = outbox[-1][1]
    anna_code = outbox[-2][1]
    if anna_code != boris_code:
        wrong = await anna.post("/api/auth/verify-email", json={"code": boris_code})
        assert error_code(wrong) == "code_invalid"
    assert (await boris.post("/api/auth/verify-email", json={"code": boris_code})).status_code == 200
