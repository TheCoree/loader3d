"""Outgoing mail: the one-time codes of app/verification.py. MAIL_BACKEND picks how they leave:

- "console" — printed to the API log (development, or a server without a mailbox yet);
- "smtp" — sent through SMTP_HOST (a mail provider's submission server) from MAIL_FROM.

A letter that could not be sent raises MailError; the caller decides what the visitor is told.
"""

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

from app.config import Settings

logger = logging.getLogger("app.mail")

SMTP_TIMEOUT_SECONDS = 20


class MailError(Exception):
    """The letter was not accepted by the mail server."""


def _footer(settings: Settings) -> str:
    return f"— Loader3D\n{settings.site_url}" if settings.site_url else "— Loader3D"


def _html(lead: str, code: str, notes: list[str], settings: Settings) -> str:
    # Plain inline styles: mail clients ignore <style> and external CSS. Only fixed texts and digits go in.
    paragraphs = "".join(f'<p style="margin:0 0 12px;color:#52525b">{note}</p>' for note in notes)
    link = (
        f'<a href="{settings.site_url}" style="color:#71717a">{settings.site_url}</a>'
        if settings.site_url
        else "Loader3D"
    )
    font = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
    code_style = (
        "margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px;color:#09090b;"
        "font-family:'SFMono-Regular',Consolas,monospace"
    )
    return f"""<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:{font}">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#09090b">Loader3D</p>
<p style="margin:0 0 16px;color:#09090b">{lead}</p>
<p style="{code_style}">{code}</p>
{paragraphs}
<p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">{link}</p>
</div>
</body>
</html>
"""


def build_message(
    settings: Settings, to: str, subject: str, lead: str, code: str, notes: list[str]
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.mail_from
    message["To"] = to
    message["Date"] = formatdate(localtime=False)
    sender_domain = parseaddr(settings.mail_from)[1].rpartition("@")[2] or None
    message["Message-ID"] = make_msgid(domain=sender_domain)
    message["Auto-Submitted"] = "auto-generated"
    text = "\n\n".join(["Здравствуйте!", f"{lead}\n\n{code}", *notes, _footer(settings)])
    message.set_content(text + "\n")
    message.add_alternative(_html(lead, code, notes, settings), subtype="html")
    return message


def _deliver_smtp(settings: Settings, message: EmailMessage) -> None:
    """Blocking: runs in a worker thread."""
    context = ssl.create_default_context()
    smtp: smtplib.SMTP
    if settings.smtp_security == "ssl":
        smtp = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS, context=context
        )
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS)
    with smtp:
        if settings.smtp_security == "starttls":
            smtp.starttls(context=context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        smtp.send_message(message)


async def send(settings: Settings, message: EmailMessage) -> None:
    to = message["To"]
    if settings.mail_backend == "console":
        # print: uvicorn does not configure the root logger, and the code must be visible in development.
        print(f"[mail] To {to}: {message['Subject']}", flush=True)
        return
    try:
        await asyncio.to_thread(_deliver_smtp, settings, message)
    except (smtplib.SMTPException, OSError) as exc:
        # WARNING and above reach stderr (docker compose logs api) even without a configured handler.
        logger.error("mail to %s was not sent: %s: %s", to, type(exc).__name__, exc)
        raise MailError(str(exc)) from exc
    logger.info("mail sent to %s: %s", to, message["Subject"])


async def send_verification_code(settings: Settings, email: str, code: str) -> None:
    message = build_message(
        settings,
        email,
        f"Код подтверждения Loader3D: {code}",
        "Ваш код подтверждения email:",
        code,
        [
            "Введите его на странице подтверждения. Код действует 15 минут.",
            "Если вы не регистрировались в Loader3D, просто удалите это письмо.",
        ],
    )
    await send(settings, message)


async def send_password_reset_code(settings: Settings, email: str, code: str) -> None:
    message = build_message(
        settings,
        email,
        f"Код для сброса пароля Loader3D: {code}",
        "Код для сброса пароля:",
        code,
        [
            "Введите его на странице сброса пароля. Код действует 15 минут.",
            "Если вы не запрашивали сброс, ничего не делайте — пароль останется прежним.",
        ],
    )
    await send(settings, message)


async def send_test(settings: Settings, email: str) -> None:
    """`python -m app send-test-mail EMAIL`: checks the mail settings with a letter like the real ones."""
    message = build_message(
        settings,
        email,
        "Проверка почты Loader3D",
        "Это тестовое письмо: отправка кодов настроена. Так будет выглядеть код:",
        "123456",
        ["Отвечать на письмо не нужно."],
    )
    await send(settings, message)
