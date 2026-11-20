"""Changing the password and deleting the account from the account page: only with a code from email.

The current password is never enough: if it leaked, whoever signed in with it must not be able to lock the
owner out or delete the account; the mailbox proves the owner.
"""

from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import update

from app import mail, verification
from app.config import Settings
from app.models import User, utcnow
from tests.conftest import PASSWORD, ClientFactory, error_code, login, make_settings, register

NEW_PASSWORD = "a brand new password"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, email_verification=True)


@pytest.fixture
def letters(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[tuple[str, str]]]:
    """Codes by letter: "change" (password), "delete", "reset" (forgotten password)."""
    sent: dict[str, list[tuple[str, str]]] = {"change": [], "delete": [], "reset": []}

    def capture(kind: str):
        async def send(settings: Settings, email: str, code: str) -> None:
            sent[kind].append((email, code))

        return send

    async def ignore(settings: Settings, email: str, code: str) -> None:
        pass

    monkeypatch.setattr(mail, "send_password_change_code", capture("change"))
    monkeypatch.setattr(mail, "send_account_delete_code", capture("delete"))
    monkeypatch.setattr(mail, "send_password_reset_code", capture("reset"))
    monkeypatch.setattr(mail, "send_verification_code", ignore)
    return sent


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def _change(client: httpx.AsyncClient, **body: str) -> httpx.Response:
    return await client.post("/api/users/me/password", json={"newPassword": NEW_PASSWORD, **body})


async def test_password_changes_with_an_emailed_code(make_client: ClientFactory, letters: dict) -> None:
    laptop, phone = await make_client(), await make_client()
    await register(laptop)
    await login(phone)

    sent = await laptop.post("/api/users/me/password/code")
    assert sent.status_code == 200, sent.text
    assert sent.json()["retryAfter"] == verification.RESEND_COOLDOWN.seconds
    # The letter of the account page, not the one of a forgotten password.
    assert [email for email, _ in letters["change"]] == ["anna@example.com"]
    assert letters["reset"] == []
    code = letters["change"][-1][1]

    assert error_code(await _change(laptop, code=_wrong(code))) == "code_invalid"
    changed = await _change(laptop, code=code)
    assert changed.status_code == 204, changed.text

    # This device stays signed in (and the mailbox is confirmed), the others are signed out.
    me = await laptop.get("/api/users/me")
    assert me.status_code == 200 and me.json()["emailVerified"] is True
    assert error_code(await phone.get("/api/users/me")) == "session_expired"
    fresh = await make_client()
    old = await fresh.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert old.status_code == 401
    await login(fresh, password=NEW_PASSWORD)
    # The code is used up.
    assert error_code(await _change(laptop, code=code)) == "code_missing"


async def test_the_current_password_is_not_enough(client: httpx.AsyncClient, letters: dict) -> None:
    await register(client)
    assert (await _change(client, currentPassword=PASSWORD)).status_code == 422
    assert (await _change(client)).status_code == 422
    assert error_code(await _change(client, code="123456")) == "code_missing"
    gone = await client.request("DELETE", "/api/users/me", json={"password": PASSWORD})
    assert gone.status_code == 422
    assert (await client.get("/api/users/me")).status_code == 200


async def test_a_new_code_waits_for_the_cooldown(client: httpx.AsyncClient, letters: dict) -> None:
    await register(client)
    await client.post("/api/users/me/password/code")
    again = await client.post("/api/users/me/password/code")
    assert again.status_code == 200
    assert 0 < again.json()["retryAfter"] <= verification.RESEND_COOLDOWN.seconds
    assert len(letters["change"]) == 1
    anonymous = await client.post("/api/users/me/password/code", headers={"authorization": ""})
    assert anonymous.status_code == 401


async def test_account_is_deleted_with_an_emailed_code(
    app: FastAPI, client: httpx.AsyncClient, make_client: ClientFactory, letters: dict
) -> None:
    await register(client)
    async with app.state.sessionmaker() as db:  # plans need a confirmed email
        await db.execute(update(User).values(email_verified_at=utcnow()))
        await db.commit()
    plan = (await client.post("/api/plans", json={"name": "Рейс"})).json()

    assert (await client.post("/api/users/me/delete/code")).status_code == 200
    assert [email for email, _ in letters["delete"]] == ["anna@example.com"]
    code = letters["delete"][-1][1]

    # A password code does not delete, and a wrong code is counted.
    await client.post("/api/users/me/password/code")
    password_code = letters["change"][-1][1]
    if password_code != code:
        wrong_kind = await client.request("DELETE", "/api/users/me", json={"code": password_code})
        assert error_code(wrong_kind) == "code_invalid"
    assert error_code(await client.request("DELETE", "/api/users/me", json={"code": _wrong(code)})) in {
        "code_invalid",
        "code_attempts",
    }
    assert (await client.get("/api/users/me")).status_code == 200

    deleted = await client.request("DELETE", "/api/users/me", json={"code": code})
    assert deleted.status_code == 204, deleted.text
    assert error_code(await client.get(f"/api/plans/{plan['id']}")) == "session_expired"
    other = await make_client()
    gone = await other.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert gone.status_code == 401
