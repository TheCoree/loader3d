"""Admin panel «Почта»: companies to write to, their letters and referral links (app/outreach.py), and the
mailbox the letters are answered in (app/inbox.py). Every route needs `is_admin`."""

import asyncio
import uuid

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app import inbox, outreach
from app.auth import AdminAuth
from app.db import Db
from app.deps import SettingsDep
from app.errors import ApiError, not_found
from app.models import OutreachContact, User, Visit, utcnow
from app.schemas.outreach import (
    MailboxOut,
    MailMessageOut,
    MailSeenIn,
    OutreachContactIn,
    OutreachContactOut,
    OutreachLetterOut,
    OutreachList,
    OutreachQueued,
    OutreachSignup,
)

router = APIRouter(prefix="/admin", tags=["admin"])

QUEUEABLE = ("new", "failed")


async def _get(db: Db, contact_id: uuid.UUID) -> OutreachContact:
    contact = await db.get(OutreachContact, contact_id)
    if contact is None:
        raise not_found("contact_not_found", "Компания не найдена")
    return contact


async def _rows(db: Db, settings: SettingsDep, contacts: list[OutreachContact]) -> list[OutreachContactOut]:
    refs = [c.ref for c in contacts]
    visits = (
        dict(
            (
                await db.execute(
                    select(Visit.utm_term, func.count())
                    .where(Visit.utm_term.in_(refs))
                    .group_by(Visit.utm_term)
                )
            ).all()
        )
        if refs
        else {}
    )
    signups: dict[str, list[OutreachSignup]] = {}
    if refs:
        for ref, email, created_at in await db.execute(
            select(User.ref, User.email, User.created_at).where(User.ref.in_(refs)).order_by(User.created_at)
        ):
            signups.setdefault(ref, []).append(OutreachSignup(email=email, created_at=created_at))
    return [
        OutreachContactOut(
            id=c.id,
            company=c.company,
            email=c.email,
            city=c.city,
            note=c.note,
            ref=c.ref,
            link=outreach.ref_link(settings, c.ref),
            status=c.status,  # type: ignore[arg-type]
            queued_at=c.queued_at,
            sent_at=c.sent_at,
            error=c.error,
            created_at=c.created_at,
            visits=visits.get(c.ref, 0),
            signups=signups.get(c.ref, []),
        )
        for c in contacts
    ]


@router.get("/outreach")
async def list_contacts(auth: AdminAuth, db: Db, settings: SettingsDep) -> OutreachList:
    contacts = list(await db.scalars(select(OutreachContact).order_by(OutreachContact.created_at)))
    return OutreachList(
        items=await _rows(db, settings, contacts),
        sender=settings.outreach_sender,
        sending=settings.mail_backend == "smtp",
    )


@router.post("/outreach", status_code=status.HTTP_201_CREATED)
async def add_contact(
    body: OutreachContactIn, auth: AdminAuth, db: Db, settings: SettingsDep
) -> OutreachContactOut:
    taken = ApiError(
        status.HTTP_409_CONFLICT, "contact_exists", "Этой компании уже писали: такой email есть в списке"
    )
    if await db.scalar(select(OutreachContact.id).where(OutreachContact.email == body.email)):
        raise taken
    contact = OutreachContact(
        company=body.company, email=body.email, city=body.city or None, note=body.note or None
    )
    # Codes are random; a clash with an existing one is retried.
    for _ in range(5):
        ref = outreach.new_ref()
        if not await db.scalar(select(OutreachContact.id).where(OutreachContact.ref == ref)):
            contact.ref = ref
            break
    db.add(contact)
    try:
        await db.commit()
    except IntegrityError:
        raise taken from None
    return (await _rows(db, settings, [contact]))[0]


@router.delete("/outreach/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(contact_id: uuid.UUID, auth: AdminAuth, db: Db) -> None:
    await db.delete(await _get(db, contact_id))
    await db.commit()


@router.get("/outreach/{contact_id}/letter")
async def preview_letter(
    contact_id: uuid.UUID, auth: AdminAuth, db: Db, settings: SettingsDep
) -> OutreachLetterOut:
    """The letter exactly as it will leave (its plain-text part)."""
    message = outreach.letter(settings, await _get(db, contact_id))
    body = message.get_body(preferencelist=("plain",))
    return OutreachLetterOut(
        sender=str(message["From"]),
        to=str(message["To"]),
        subject=str(message["Subject"]),
        text=body.get_content() if body is not None else "",  # type: ignore[union-attr]
    )


@router.post("/outreach/{contact_id}/send")
async def send_one(
    contact_id: uuid.UUID, auth: AdminAuth, db: Db, settings: SettingsDep
) -> OutreachContactOut:
    """Queues the letter: the job sends one a minute (app/jobs.py)."""
    contact = await _get(db, contact_id)
    if contact.status not in QUEUEABLE:
        raise ApiError(
            status.HTTP_409_CONFLICT, "already_sent", "Письмо этой компании уже отправлено или в очереди"
        )
    contact.status = "queued"
    contact.queued_at = utcnow()
    contact.error = None
    await db.commit()
    return (await _rows(db, settings, [contact]))[0]


@router.post("/outreach/send-all")
async def send_all(auth: AdminAuth, db: Db) -> OutreachQueued:
    """Queues every company that has not been written to yet."""
    contacts = list(await db.scalars(select(OutreachContact).where(OutreachContact.status == "new")))
    now = utcnow()
    for contact in contacts:
        contact.status = "queued"
        contact.queued_at = now
    await db.commit()
    return OutreachQueued(queued=len(contacts))


@router.get("/mail")
async def mailbox(auth: AdminAuth, db: Db, settings: SettingsDep) -> MailboxOut:
    """The newest letters of the mailbox, each matched to a company by its address (or the bounced one)."""
    try:
        messages = await asyncio.to_thread(inbox.fetch, settings)
    except inbox.InboxError as exc:
        return MailboxOut(messages=[], error=str(exc))
    by_email = dict((await db.execute(select(OutreachContact.email, OutreachContact.id))).all())
    return MailboxOut(
        messages=[
            MailMessageOut(
                uid=m.uid,
                received_at=m.received_at,
                sender_name=m.sender_name,
                sender=m.sender,
                subject=m.subject,
                kind=m.kind,  # type: ignore[arg-type]
                about=m.about,
                text=m.text,
                contact_id=by_email.get(m.about or "") or by_email.get(m.sender),
                seen=m.seen,
            )
            for m in messages
        ],
        error=None,
    )


@router.post("/mail/{uid}/seen", status_code=status.HTTP_204_NO_CONTENT)
async def mark_seen(uid: str, body: MailSeenIn, auth: AdminAuth, settings: SettingsDep) -> None:
    """Marks a letter read (opened in the panel) or unread again — in the mailbox itself."""
    try:
        await asyncio.to_thread(inbox.set_seen, settings, uid, body.seen)
    except inbox.InboxError as exc:
        raise ApiError(status.HTTP_502_BAD_GATEWAY, "mailbox_failed", str(exc)) from exc
