"""The mailbox of the letters to companies (app/outreach.py), read over IMAP for the admin panel's «Почта»:
replies, bounces («письмо не доставлено») and auto-replies, newest first, with the mailbox's own «прочитано»
flag. Reading never changes the mailbox (BODY.PEEK); only opening a letter in the panel marks it read there,
as a mail client would (`set_seen`). Nothing of it is stored: the panel reads it each time it is opened.

One login per call, never retried in a loop: docker-mailserver's fail2ban bans an address after a few failed
logins, and the api's address carries its SMTP too."""

import imaplib
import re
import ssl
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from email import message_from_bytes, policy
from email.message import EmailMessage, Message
from email.utils import getaddresses, parsedate_to_datetime

from app.config import Settings

IMAP_TIMEOUT_SECONDS = 20
TEXT_LIMIT = 20_000

_AUTO_SUBJECT = re.compile(r"^\s*(автоответ|auto[- ]?reply|automatic reply|out of office|отсутствую)", re.I)
_REPLY_SUBJECT = re.compile(r"^\s*(re|ответ|отв)\s*:", re.I)
_DAEMON = re.compile(r"^(mailer-daemon|postmaster|mail-daemon|bounce)", re.I)
_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"[ \t\r\f\v]+")
_BLANK_LINES = re.compile(r"\n\s*\n\s*\n+")
_FLAGS = re.compile(rb"FLAGS \(([^)]*)\)")
_UID = re.compile(r"[0-9]{1,10}")


class InboxError(Exception):
    """The mailbox could not be read (not configured, refused the login, did not answer)."""


@dataclass
class InboxMessage:
    uid: str
    received_at: datetime | None
    sender_name: str
    sender: str
    subject: str
    # "reply", "bounce", "auto" or "letter".
    kind: str
    # Bounces: the address the failed letter was for.
    about: str | None
    text: str
    # The mailbox's \Seen flag: read here or in a mail client.
    seen: bool = False


def _text_of(message: Message) -> str:
    """The plain text of a letter (or its HTML without tags)."""
    plain: str | None = None
    html: str | None = None
    for part in message.walk():
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        kind = part.get_content_type()
        try:
            content = part.get_content() if isinstance(part, EmailMessage) else part.get_payload(decode=True)
        except LookupError, ValueError:
            continue
        if isinstance(content, bytes):
            content = content.decode(part.get_content_charset() or "utf-8", "replace")
        if not isinstance(content, str):
            continue
        if kind == "text/plain" and plain is None:
            plain = content
        elif kind == "text/html" and html is None:
            html = content
    text = plain if plain is not None else _TAGS.sub(" ", html or "")
    text = _SPACES.sub(" ", text.replace("\r\n", "\n"))
    return _BLANK_LINES.sub("\n\n", text).strip()[:TEXT_LIMIT]


def _bounced_address(message: Message) -> str | None:
    """Final-Recipient of a delivery status report (RFC 3464)."""
    for part in message.walk():
        if part.get_content_type() != "message/delivery-status":
            continue
        for block in part.get_payload() if isinstance(part.get_payload(), list) else []:
            for header in ("Final-Recipient", "Original-Recipient"):
                value = block.get(header)
                if value and ";" in value:
                    return value.split(";", 1)[1].strip().lower()
    return None


def classify(message: Message) -> tuple[str, str | None]:
    """(kind, the bounced address) of an incoming letter."""
    sender = (getaddresses([message.get("From", "")]) or [("", "")])[0][1]
    subject = str(message.get("Subject", ""))
    report = (
        message.get_content_type() == "multipart/report"
        and (message.get_param("report-type") or "").lower() == "delivery-status"
    )
    if report or _DAEMON.match(sender):
        return "bounce", _bounced_address(message)
    auto = (message.get("Auto-Submitted") or "no").lower()
    if (
        auto != "no"
        or message.get("X-Autoreply")
        or message.get("X-Autorespond")
        or _AUTO_SUBJECT.match(subject)
    ):
        return "auto", None
    if message.get("In-Reply-To") or message.get("References") or _REPLY_SUBJECT.match(subject):
        return "reply", None
    return "letter", None


def parse(uid: str, raw: bytes, seen: bool = False) -> InboxMessage:
    message = message_from_bytes(raw, policy=policy.default)
    name, address = (getaddresses([str(message.get("From", ""))]) or [("", "")])[0]
    try:
        received_at = parsedate_to_datetime(str(message["Date"])) if message["Date"] else None
        if received_at is not None and received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=UTC)
    except TypeError, ValueError:
        received_at = None
    kind, about = classify(message)
    return InboxMessage(
        uid=uid,
        received_at=received_at,
        sender_name=name,
        sender=address.lower(),
        subject=str(message.get("Subject", "")).strip()[:300],
        kind=kind,
        about=about,
        text=_text_of(message),
        seen=seen,
    )


@contextmanager
def _mailbox(settings: Settings, readonly: bool) -> Iterator[imaplib.IMAP4_SSL]:
    """The INBOX of the outreach mailbox, logged in once."""
    username, password = settings.outreach_login
    if settings.mail_backend != "smtp" or not settings.smtp_host or not username:
        raise InboxError("Почтовый ящик не настроен: нужны MAIL_BACKEND=smtp, SMTP_HOST и логин ящика")
    try:
        with imaplib.IMAP4_SSL(
            settings.smtp_host,
            settings.imap_port,
            ssl_context=ssl.create_default_context(),
            timeout=IMAP_TIMEOUT_SECONDS,
        ) as imap:
            imap.login(username, password)
            imap.select("INBOX", readonly=readonly)
            yield imap
    except imaplib.IMAP4.error as exc:
        raise InboxError(f"Ящик не принял вход: {exc}") from exc
    except (OSError, ssl.SSLError) as exc:
        raise InboxError(f"Почтовый сервер не ответил: {exc}") from exc


def seen_flag(fetch_parts: list[object]) -> bool:
    """Whether the FLAGS of an IMAP FETCH answer have \\Seen (the flags come before or after the body)."""
    for part in fetch_parts:
        head = part[0] if isinstance(part, tuple) else part
        if isinstance(head, bytes) and (flags := _FLAGS.search(head)):
            return b"\\Seen" in flags.group(1)
    return False


def fetch(settings: Settings, limit: int = 100) -> list[InboxMessage]:
    """The newest `limit` letters of the INBOX. Blocking: call it in a worker thread."""
    with _mailbox(settings, readonly=True) as imap:
        status, data = imap.uid("SEARCH", "ALL")  # type: ignore[arg-type]
        if status != "OK":
            raise InboxError("Ящик не отдал список писем")
        uids = data[0].split()[-limit:] if data and data[0] else []
        messages: list[InboxMessage] = []
        for uid in reversed(uids):
            status, parts = imap.uid("FETCH", uid, "(FLAGS BODY.PEEK[])")  # type: ignore[arg-type]
            raw = next((p[1] for p in parts if isinstance(p, tuple) and isinstance(p[1], bytes)), None)
            if status == "OK" and raw is not None:
                messages.append(parse(uid.decode(), raw, seen_flag(parts)))
        return messages


def set_seen(settings: Settings, uid: str, seen: bool) -> None:
    """Marks a letter read or unread in the mailbox. Blocking: call it in a worker thread."""
    if not _UID.fullmatch(uid):
        raise InboxError("Нет такого письма")
    with _mailbox(settings, readonly=False) as imap:
        command = "+FLAGS.SILENT" if seen else "-FLAGS.SILENT"
        status, _ = imap.uid("STORE", uid, command, r"(\Seen)")  # type: ignore[arg-type]
        if status != "OK":
            raise InboxError("Ящик не отметил письмо")
