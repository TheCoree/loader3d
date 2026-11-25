"""Outgoing mail: the one-time codes of app/verification.py. MAIL_BACKEND picks how they leave:

- "console" — printed to the API log (development, or a server without a mailbox yet);
- "smtp" — sent through SMTP_HOST (a mail provider's submission server) from MAIL_FROM.

A letter that could not be sent raises MailError; the caller decides what the visitor is told.
"""

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

from app.config import Settings

logger = logging.getLogger("app.mail")

SMTP_TIMEOUT_SECONDS = 20


class MailError(Exception):
    """The letter was not accepted by the mail server."""


def _footer(settings: Settings) -> str:
    return f"— Loader3D\n{settings.site_url}" if settings.site_url else "— Loader3D"


def _site_link(settings: Settings, path: str) -> str | None:
    """An absolute link into the site for a button in the letter; None without SITE_URL."""
    return f"{settings.site_url.rstrip('/')}{path}" if settings.site_url else None


def _html(
    lead: str, code: str | None, notes: list[str], button: tuple[str, str] | None, settings: Settings
) -> str:
    # Plain inline styles: mail clients ignore <style> and external CSS. Only fixed texts, digits, dates
    # and SITE_URL go in.
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
    code_html = f'<p style="{code_style}">{code}</p>' if code else ""
    button_style = (
        "display:inline-block;padding:10px 18px;border-radius:8px;background:#09090b;color:#ffffff;"
        "text-decoration:none;font-weight:600"
    )
    button_html = (
        f'<p style="margin:20px 0 8px"><a href="{button[1]}" style="{button_style}">{button[0]}</a></p>'
        if button
        else ""
    )
    return f"""<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:{font}">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#09090b">Loader3D</p>
<p style="margin:0 0 16px;color:#09090b">{lead}</p>
{code_html}
{paragraphs}
{button_html}
<p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">{link}</p>
</div>
</body>
</html>
"""


def build_message(
    settings: Settings,
    to: str,
    subject: str,
    lead: str,
    code: str | None,
    notes: list[str],
    button: tuple[str, str] | None = None,
) -> EmailMessage:
    """`code` — the big digits of a one-time code; `button` — (label, absolute URL) under the notes."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.mail_from
    message["To"] = to
    message["Date"] = formatdate(localtime=False)
    # Not the host's name when there is no sender (console letters): socket.getfqdn() may wait on DNS for
    # seconds, and the whole API with it.
    sender_domain = parseaddr(settings.mail_from)[1].rpartition("@")[2] or "loader3d.local"
    message["Message-ID"] = make_msgid(domain=sender_domain)
    message["Auto-Submitted"] = "auto-generated"
    head = f"{lead}\n\n{code}" if code else lead
    tail = [f"{button[0]}: {button[1]}"] if button else []
    text = "\n\n".join(["Здравствуйте!", head, *notes, *tail, _footer(settings)])
    message.set_content(text + "\n")
    message.add_alternative(_html(lead, code, notes, button, settings), subtype="html")
    return message


def _deliver_smtp(settings: Settings, message: EmailMessage, login: tuple[str, str] | None = None) -> None:
    """Blocking: runs in a worker thread. `login` — another mailbox's username and password (outreach)."""
    username, password = login or (settings.smtp_username, settings.smtp_password.get_secret_value())
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
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


async def send(settings: Settings, message: EmailMessage, login: tuple[str, str] | None = None) -> None:
    to = message["To"]
    if settings.mail_backend == "console":
        # print: uvicorn does not configure the root logger, and the code must be visible in development.
        print(f"[mail] To {to}: {message['Subject']}", flush=True)
        return
    try:
        await asyncio.to_thread(_deliver_smtp, settings, message, login)
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


async def send_password_change_code(settings: Settings, email: str, code: str) -> None:
    """The code to change the password from the account page, without the current one."""
    message = build_message(
        settings,
        email,
        f"Код для смены пароля Loader3D: {code}",
        "Код для смены пароля:",
        code,
        [
            "Введите его в аккаунте, в разделе «Пароль». Код действует 15 минут.",
            "Если вы не меняли пароль, ничего не делайте — пароль останется прежним.",
        ],
    )
    await send(settings, message)


async def send_account_delete_code(settings: Settings, email: str, code: str) -> None:
    """The code that confirms deleting the account with all its plans."""
    message = build_message(
        settings,
        email,
        f"Код для удаления аккаунта Loader3D: {code}",
        "Код для удаления аккаунта:",
        code,
        [
            "Введите его в аккаунте, в разделе «Профиль» → «Опасная зона». Код действует 15 минут.",
            "Аккаунт и все схемы будут удалены без возможности восстановления.",
            "Если вы не удаляли аккаунт, ничего не делайте и смените пароль — возможно, кто-то вошёл в него.",
        ],
    )
    await send(settings, message)


MONTHS_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
# Dates in the letters are Moscow dates (UTC+3 all year), like the support hours on the site.
MOSCOW = timezone(timedelta(hours=3), "MSK")


def ru_date(moment: datetime) -> str:
    """«19 декабря 2026»."""
    local = moment.astimezone(MOSCOW)
    return f"{local.day} {MONTHS_GENITIVE[local.month - 1]} {local.year}"


def _rub(amount: int) -> str:
    return f"{amount:,}".replace(",", " ") + " ₽"


async def send_payment_received(
    settings: Settings, email: str, tier_name: str, period_name: str, amount: int, paid_until: datetime
) -> None:
    """After a payment (app/billing.py). Not a fiscal receipt: that one comes from the payment provider."""
    message = build_message(
        settings,
        email,
        f"Оплата получена: «{tier_name}» до {ru_date(paid_until)}",
        f"Спасибо! Оплата {_rub(amount)} получена, тариф «{tier_name}» ({period_name}) действует до "
        f"{ru_date(paid_until)}.",
        None,
        [
            "Продлить тариф можно в любой момент на странице «Тариф и оплата»: новый период добавится "
            "к текущему.",
            "Автоматических списаний нет. Вопросы по оплате — в поддержку, контакты внизу сайта.",
        ],
        ("Тариф и оплата", link) if (link := _site_link(settings, "/billing")) else None,
    )
    await send(settings, message)


async def send_tier_ending(
    settings: Settings, email: str, tier_name: str, ends_at: datetime, trial: bool
) -> None:
    """A few days before a period of «Pro» ends (app/billing.py `send_tier_reminders`)."""
    what = "Пробный период тарифа" if trial else "Тариф"
    message = build_message(
        settings,
        email,
        f"{what} «{tier_name}» заканчивается {ru_date(ends_at)}",
        f"{what} «{tier_name}» действует до {ru_date(ends_at)}.",
        None,
        [
            "Потом аккаунт перейдёт на бесплатный тариф «Старт»: сохранённые схемы останутся, а для новых "
            "будут действовать его лимиты.",
            "Чтобы продолжить без ограничений, оплатите «Pro» на странице «Тариф и оплата» — на месяц "
            "или на год.",
        ],
        ("Продлить «Pro»", link) if (link := _site_link(settings, "/billing")) else None,
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
