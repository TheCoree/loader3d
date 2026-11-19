"""Outgoing mail (app/mail.py): the letters, the SMTP backend and what the API does when sending fails."""

import smtplib
from pathlib import Path
from typing import Any, ClassVar

import httpx
import pytest

from app import mail
from app.config import Settings
from tests.conftest import error_code, make_settings, register

SMTP = {
    "mail_backend": "smtp",
    "mail_from": "Loader3D <noreply@loader3d.test>",
    "smtp_host": "smtp.loader3d.test",
    "smtp_username": "noreply@loader3d.test",
    "smtp_password": "app-password",
    "site_url": "https://loader3d.test",
}


class FakeSmtp:
    """Stands in for smtplib.SMTP / SMTP_SSL and records what the backend does."""

    instances: ClassVar[list[FakeSmtp]] = []
    fail: ClassVar[Exception | None] = None

    def __init__(self, host: str, port: int, **kwargs: Any) -> None:
        self.host, self.port, self.kwargs = host, port, kwargs
        self.calls: list[str] = []
        self.sent: list[Any] = []
        FakeSmtp.instances.append(self)

    def __enter__(self) -> FakeSmtp:
        return self

    def __exit__(self, *exc: object) -> None:
        self.calls.append("quit")

    def starttls(self, **kwargs: Any) -> None:
        self.calls.append("starttls")

    def login(self, username: str, password: str) -> None:
        self.calls.append(f"login {username} {password}")

    def send_message(self, message: Any) -> None:
        if FakeSmtp.fail is not None:
            raise FakeSmtp.fail
        self.calls.append("send")
        self.sent.append(message)


@pytest.fixture
def smtp(monkeypatch: pytest.MonkeyPatch) -> type[FakeSmtp]:
    FakeSmtp.instances = []
    FakeSmtp.fail = None
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSmtp)
    return FakeSmtp


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path, email_verification=True, **SMTP)


def _body(message: Any, subtype: str) -> str:
    return message.get_body(preferencelist=(subtype,)).get_content()


async def test_a_verification_letter_goes_through_smtp_over_ssl(
    settings: Settings, smtp: type[FakeSmtp]
) -> None:
    await mail.send_verification_code(settings, "anna@example.com", "042917")
    [server] = smtp.instances
    assert (server.host, server.port) == ("smtp.loader3d.test", 465)
    assert server.calls == ["login noreply@loader3d.test app-password", "send", "quit"]
    [message] = server.sent
    assert message["To"] == "anna@example.com"
    assert message["From"] == "Loader3D <noreply@loader3d.test>"
    assert "042917" in message["Subject"]
    assert message["Message-ID"].endswith("@loader3d.test>")
    assert message["Date"]
    for subtype in ("plain", "html"):
        assert "042917" in _body(message, subtype)
        assert "https://loader3d.test" in _body(message, subtype)


async def test_starttls_and_a_relay_without_login(tmp_path: Path, smtp: type[FakeSmtp]) -> None:
    settings = make_settings(
        tmp_path, **SMTP | {"smtp_port": 587, "smtp_security": "starttls", "smtp_username": ""}
    )
    await mail.send_password_reset_code(settings, "anna@example.com", "555000")
    [server] = smtp.instances
    assert server.port == 587
    assert server.calls == ["starttls", "send", "quit"]
    assert "сброс" in server.sent[0]["Subject"]


async def test_the_console_backend_prints_the_code(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    await mail.send_verification_code(make_settings(tmp_path), "anna@example.com", "314159")
    assert "314159" in capsys.readouterr().out


async def test_a_refused_letter_raises_mail_error(settings: Settings, smtp: type[FakeSmtp]) -> None:
    smtp.fail = smtplib.SMTPRecipientsRefused({"anna@example.com": (550, b"no such user")})
    with pytest.raises(mail.MailError):
        await mail.send_verification_code(settings, "anna@example.com", "123456")


def test_smtp_needs_a_host_and_a_sender(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="SMTP_HOST"):
        make_settings(tmp_path, **SMTP | {"smtp_host": ""})
    with pytest.raises(ValueError, match="MAIL_FROM"):
        make_settings(tmp_path, **SMTP | {"mail_from": "Loader3D"})


async def test_registration_survives_a_mail_failure(client: httpx.AsyncClient, smtp: type[FakeSmtp]) -> None:
    smtp.fail = smtplib.SMTPServerDisconnected("gone")
    await register(client)
    # No code was sent, so no cooldown either: a new one can be asked for at once — and fails with a message.
    response = await client.post("/api/auth/verify-email/resend")
    assert response.status_code == 503
    assert error_code(response) == "mail_failed"

    smtp.fail = None
    response = await client.post("/api/auth/verify-email/resend")
    assert response.status_code == 200, response.text
    code = _body(smtp.instances[-1].sent[0], "plain").split("\n\n")[2].strip()
    assert (await client.post("/api/auth/verify-email", json={"code": code})).status_code == 200


async def test_a_failed_reset_letter_keeps_no_cooldown(
    client: httpx.AsyncClient, smtp: type[FakeSmtp]
) -> None:
    await register(client)
    smtp.fail = OSError("connection refused")
    forgot = await client.post("/api/auth/password/forgot", json={"email": "anna@example.com"})
    assert forgot.status_code == 503
    assert error_code(forgot) == "mail_failed"
    smtp.fail = None
    forgot = await client.post("/api/auth/password/forgot", json={"email": "anna@example.com"})
    assert forgot.status_code == 200, forgot.text
