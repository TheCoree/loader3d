"""Letters to companies from the admin panel («Почта»): one personal letter per company, with its own
referral link `SITE_URL/r/<ref>` (Caddy turns it into `/?ref=…&utm_…`: the visit statistics count the visits
by the code, registration keeps it in `User.ref`).

Written to look like what it is — a short personal letter, not a mailing: plain text with the same text in
light HTML, one link, no pictures or tracking, the sender's own address to reply to and a way to say no
(List-Unsubscribe). Queued letters leave one a minute (app/jobs.py), so the mail server never sends a burst.
"""

import re
import secrets
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import mail
from app.config import Settings
from app.models import OutreachContact

# A referral code: lower-case letters and digits without the ones easy to confuse (l, 1, o, 0, i).
REF_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
REF_LENGTH = 6
REF_PATTERN = re.compile(r"[a-z0-9]{4,12}")


def new_ref() -> str:
    return "".join(secrets.choice(REF_ALPHABET) for _ in range(REF_LENGTH))


def clean_ref(value: str | None) -> str | None:
    """A referral code from a visitor (registration): kept only if it looks like one."""
    if not value:
        return None
    value = value.strip().lower()
    return value if REF_PATTERN.fullmatch(value) else None


def ref_link(settings: Settings, ref: str) -> str:
    base = (settings.site_url or "https://loader3d.pro").rstrip("/")
    return f"{base}/r/{ref}"


def subject(contact: OutreachContact) -> str:
    return f"{contact.company}: схема загрузки машины в 3D"


def paragraphs(settings: Settings, contact: OutreachContact) -> list[str]:
    """The letter, paragraph by paragraph (the link is a paragraph of its own)."""
    benefit = "С такой схемой машина собирается с первого раза — без пустого места и без перегруза по осям."
    hook = f"Видели, что вы {contact.note.strip().rstrip('.')}. {benefit}" if contact.note else benefit
    return [
        "Здравствуйте!",
        "Это Loader3D — мы делаем программу, которая собирает схему загрузки фуры, грузовика или "
        "контейнера в 3D. " + hook,
        "Как это работает: вносите грузы списком, автозагрузка расставляет их сама — тяжёлое вниз "
        "и к центру, лёгкое сверху. Сразу видно, сколько поместится, нагрузку на каждую ось и центр тяжести, "
        "а водитель и склад получают PDF со схемой и порядком погрузки. Работает в браузере, ничего ставить "
        "не нужно.",
        f"Для «{contact.company}» — 14 дней полного доступа (тариф «Pro») без оплаты и без карты. "
        "Зарегистрируйтесь по ссылке:",
        ref_link(settings, contact.ref),
        "Если удобнее, пришлите в ответ упаковочный лист любой отгрузки — соберём схему сами и пришлём PDF.",
        "Если тема не актуальна, просто ответьте «нет» — больше не напишем.",
    ]


SIGNATURE = ["Команда Loader3D", "loader3d.pro"]


def _html(parts: list[str], link: str) -> str:
    font = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
    body = []
    for part in parts:
        if part == link:
            shown = escape(link.split("://", 1)[-1])
            body.append(
                f'<p style="margin:0 0 14px"><a href="{escape(link)}" style="color:#2f6fed">{shown}</a></p>'
            )
        else:
            body.append(f'<p style="margin:0 0 14px">{escape(part)}</p>')
    signature = "<br>".join(escape(line) for line in SIGNATURE)
    style = f"margin:0;padding:16px;font-family:{font};font-size:15px;line-height:1.55;color:#1f2937"
    return (
        f'<!doctype html><html lang="ru"><body style="{style}">{"".join(body)}'
        f'<p style="margin:18px 0 0;color:#52525b">{signature}</p></body></html>\n'
    )


def letter(settings: Settings, contact: OutreachContact) -> EmailMessage:
    sender = settings.outreach_sender
    address = parseaddr(sender)[1]
    parts = paragraphs(settings, contact)
    link = ref_link(settings, contact.ref)
    message = EmailMessage()
    message["Subject"] = subject(contact)
    message["From"] = sender
    message["To"] = contact.email
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=address.rpartition("@")[2] or "loader3d.local")
    if address:
        # Gmail and Mail.ru show «Отписаться»; a reply with this subject is treated as a no.
        message["List-Unsubscribe"] = f"<mailto:{address}?subject=unsubscribe>"
    message.set_content("\n\n".join([*parts, "\n".join(SIGNATURE)]) + "\n")
    message.add_alternative(_html(parts, link), subtype="html")
    return message


async def send_next(db: AsyncSession, settings: Settings, now: datetime) -> OutreachContact | None:
    """Sends the oldest queued letter, if any (one per call: app/jobs.py calls it once a minute)."""
    contact = await db.scalar(
        select(OutreachContact)
        .where(OutreachContact.status == "queued")
        .order_by(OutreachContact.queued_at, OutreachContact.created_at)
        .limit(1)
    )
    if contact is None:
        return None
    message = letter(settings, contact)
    try:
        await mail.send(settings, message, settings.outreach_login)
    except mail.MailError as exc:
        contact.status = "failed"
        contact.error = str(exc)[:300]
    else:
        contact.status = "sent"
        contact.sent_at = now
        contact.message_id = message["Message-ID"]
        contact.error = None
    await db.commit()
    return contact
