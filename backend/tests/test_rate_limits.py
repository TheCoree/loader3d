"""Limits against password guessing and flooding (app/ratelimit.py)."""

from datetime import timedelta

import httpx
import pytest

from app import ratelimit
from app.ratelimit import RateLimiter
from app.routers import auth
from tests.conftest import PASSWORD, ClientFactory, error_code, login, register


def test_limiter_window(monkeypatch: pytest.MonkeyPatch) -> None:
    now = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now[0])
    limiter = RateLimiter(2, timedelta(seconds=60))
    assert limiter.allow("a") == 0
    now[0] += 10
    assert limiter.allow("a") == 0
    assert limiter.allow("a") == 50  # until the first hit leaves the window
    assert limiter.allow("b") == 0  # keys are separate
    now[0] += 50
    assert limiter.allow("a") == 0
    limiter.reset("a")
    assert limiter.retry_after("a") == 0


def test_wait_text() -> None:
    assert ratelimit.wait_text(40) == "через 40 с"
    assert ratelimit.wait_text(61) == "через 2 мин"


async def _wrong_login(client: httpx.AsyncClient, email: str = "anna@example.com") -> httpx.Response:
    return await client.post("/api/auth/login", json={"email": email, "password": "wrong password"})


async def test_login_locks_after_wrong_passwords(
    client: httpx.AsyncClient, make_client: ClientFactory
) -> None:
    await register(client)
    other = await make_client()
    for _ in range(auth.LOGIN_FAILURES_PER_EMAIL.limit):
        assert (await _wrong_login(other)).status_code == 401
    # Now even the right password waits: the guesser learns nothing.
    locked = await other.post("/api/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert locked.status_code == 429
    assert error_code(locked) == "too_many_attempts"
    assert int(locked.headers["retry-after"]) > 0
    assert locked.json()["detail"]["retryAfter"] > 0
    assert "мин" in locked.json()["detail"]["message"]
    # Other accounts from the same address still log in.
    await register(await make_client(), "boris@example.com")
    await login(other, "boris@example.com")


async def test_right_password_clears_the_account_counter(client: httpx.AsyncClient) -> None:
    await register(client)
    for _ in range(auth.LOGIN_FAILURES_PER_EMAIL.limit - 1):
        await _wrong_login(client)
    await login(client)
    assert (await _wrong_login(client)).status_code == 401


async def test_login_locks_an_address_guessing_many_accounts(client: httpx.AsyncClient) -> None:
    for i in range(auth.LOGIN_FAILURES_PER_IP.limit):
        assert (await _wrong_login(client, f"user{i}@example.com")).status_code == 401
    assert (await _wrong_login(client, "someone@example.com")).status_code == 429


async def test_registrations_per_address(client: httpx.AsyncClient) -> None:
    for i in range(auth.REGISTRATIONS_PER_IP.limit):
        response = await client.post(
            "/api/auth/register", json={"email": f"user{i}@example.com", "password": PASSWORD}
        )
        assert response.status_code == 201, response.text
    response = await client.post(
        "/api/auth/register", json={"email": "more@example.com", "password": PASSWORD}
    )
    assert response.status_code == 429
    assert error_code(response) == "too_many_requests"


async def test_wrong_reset_codes_per_address(client: httpx.AsyncClient) -> None:
    body = {"email": "nobody@example.com", "code": "123456", "password": "a new password"}
    for _ in range(auth.RESET_FAILURES_PER_IP.limit):
        assert (await client.post("/api/auth/password/reset", json=body)).status_code == 400
    response = await client.post("/api/auth/password/reset", json=body)
    assert response.status_code == 429
    assert error_code(response) == "too_many_attempts"


async def test_reset_requests_per_address(client: httpx.AsyncClient) -> None:
    for i in range(auth.RESET_REQUESTS_PER_IP.limit):
        response = await client.post("/api/auth/password/forgot", json={"email": f"user{i}@example.com"})
        assert response.status_code == 200
    response = await client.post("/api/auth/password/forgot", json={"email": "more@example.com"})
    assert response.status_code == 429
