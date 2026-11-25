"""Letters to companies (app/outreach.py), their referral codes and the mailbox (app/inbox.py)."""

import uuid

import pytest
from sqlalchemy import select

from app import inbox, outreach
from app.models import OutreachContact, Visit, utcnow
from tests.conftest import ClientFactory, error_code, make_admin, register

COMPANY = {
    "company": "Крым Чай",
    "email": "Sales@Example.com",
    "city": "Симферополь",
    "note": "возите чай по Крыму своим автопарком",
}


@pytest.fixture
async def admin(app, client):
    await register(client, "admin@example.com")
    await make_admin(app, "admin@example.com")
    return client


async def test_only_admins(client):
    await register(client, "bob@example.com")
    assert (await client.get("/api/admin/outreach")).status_code == 403
    assert (await client.get("/api/admin/mail")).status_code == 403


async def test_add_list_and_the_letter(admin, settings):
    created = await admin.post("/api/admin/outreach", json=COMPANY)
    assert created.status_code == 201, created.text
    contact = created.json()
    assert contact["email"] == "sales@example.com"
    assert contact["status"] == "new"
    assert outreach.REF_PATTERN.fullmatch(contact["ref"])
    assert contact["link"].endswith(f"/r/{contact['ref']}")

    again = await admin.post("/api/admin/outreach", json=COMPANY | {"email": "sales@example.com"})
    assert again.status_code == 409 and error_code(again) == "contact_exists"

    listing = (await admin.get("/api/admin/outreach")).json()
    assert [c["company"] for c in listing["items"]] == ["Крым Чай"]
    assert listing["sending"] is False

    letter = (await admin.get(f"/api/admin/outreach/{contact['id']}/letter")).json()
    assert letter["to"] == "sales@example.com"
    assert "Крым Чай" in letter["subject"]
    assert "Видели, что вы возите чай по Крыму своим автопарком." in letter["text"]
    assert f"/r/{contact['ref']}" in letter["text"]
    assert "14 дней" in letter["text"]


async def test_the_letter_is_a_personal_letter(app, settings):
    contact = OutreachContact(company="ТК 82", email="info@example.com", ref="abc234")
    message = outreach.letter(settings, contact)
    assert message["Auto-Submitted"] is None
    assert message["List-Unsubscribe"] is not None or not settings.outreach_sender
    assert {part.get_content_type() for part in message.iter_parts()} == {"text/plain", "text/html"}
    html = message.get_body(preferencelist=("html",)).get_content()
    assert html.count("<a ") == 1 and "<img" not in html
    # What spam filters look at: text not hidden in base64, a date with its time zone.
    assert {part["Content-Transfer-Encoding"] for part in message.iter_parts()} == {"quoted-printable"}
    assert message["Date"].endswith("+0000")


async def test_queue_and_send_one_a_call(app, admin, settings):
    first = (await admin.post("/api/admin/outreach", json=COMPANY)).json()
    second = (
        await admin.post("/api/admin/outreach", json=COMPANY | {"company": "ОАЗИС", "email": "o@example.com"})
    ).json()

    queued = await admin.post(f"/api/admin/outreach/{first['id']}/send")
    assert queued.json()["status"] == "queued"
    assert error_code(await admin.post(f"/api/admin/outreach/{first['id']}/send")) == "already_sent"
    assert (await admin.post("/api/admin/outreach/send-all")).json() == {"queued": 1}

    async with app.state.sessionmaker() as db:
        sent = await outreach.send_next(db, settings, utcnow())
        assert sent is not None and sent.email == "sales@example.com"
        assert sent.status == "sent" and sent.message_id
    async with app.state.sessionmaker() as db:
        assert (await outreach.send_next(db, settings, utcnow())).email == "o@example.com"  # type: ignore[union-attr]
    async with app.state.sessionmaker() as db:
        assert await outreach.send_next(db, settings, utcnow()) is None
    statuses = {c["id"]: c["status"] for c in (await admin.get("/api/admin/outreach")).json()["items"]}
    assert statuses == {first["id"]: "sent", second["id"]: "sent"}


async def test_signups_and_visits_by_the_code(app, admin, make_client: ClientFactory):
    contact = (await admin.post("/api/admin/outreach", json=COMPANY)).json()
    visitor = await make_client()
    await register(visitor, "driver@example.com", ref=contact["ref"].upper())
    # A code that does not look like one never stops a registration.
    await register(await make_client(), "other@example.com", ref="<script>")
    async with app.state.sessionmaker() as db:
        db.add(
            Visit(
                id=uuid.uuid4(),
                visitor="v",
                landing_path="/",
                channel="email",
                device="desktop",
                browser="Chrome",
                os="Windows",
                utm_term=contact["ref"],
            )
        )
        await db.commit()
    row = (await admin.get("/api/admin/outreach")).json()["items"][0]
    assert [s["email"] for s in row["signups"]] == ["driver@example.com"]
    assert row["visits"] == 1


async def test_delete(app, admin):
    contact = (await admin.post("/api/admin/outreach", json=COMPANY)).json()
    assert (await admin.delete(f"/api/admin/outreach/{contact['id']}")).status_code == 204
    async with app.state.sessionmaker() as db:
        assert await db.scalar(select(OutreachContact)) is None


async def test_mailbox_without_mail_says_why(admin):
    response = await admin.get("/api/admin/mail")
    assert response.status_code == 200
    assert response.json()["messages"] == [] and "не настроен" in response.json()["error"]


BOUNCE = b"""From: Mail Delivery System <MAILER-DAEMON@mail.loader3d.pro>
To: noreply@loader3d.pro
Subject: Undelivered Mail Returned to Sender
Date: Wed, 25 Nov 2026 12:00:00 +0300
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="b1"

--b1
Content-Type: text/plain; charset=utf-8

Your message could not be delivered: mailbox unavailable.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; mail.loader3d.pro

Final-Recipient: rfc822; Nobody@Example.com
Action: failed
Status: 5.1.1

--b1--
"""

REPLY = """From: =?utf-8?b?0J7Qu9GM0LPQsA==?= <sales@example.com>
To: noreply@loader3d.pro
Subject: Re: Крым Чай: схема загрузки машины в 3D
In-Reply-To: <123@loader3d.pro>
Date: Wed, 25 Nov 2026 13:00:00 +0300
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Интересно, пришлите подробнее.
""".encode()

AUTO = b"""From: office@example.com
To: noreply@loader3d.pro
Subject: Auto-reply: in the office from Monday
Auto-Submitted: auto-replied
Content-Type: text/plain; charset=utf-8

Away.
"""


def test_bounces_replies_and_auto_replies():
    bounce = inbox.parse("1", BOUNCE)
    assert (bounce.kind, bounce.about) == ("bounce", "nobody@example.com")
    assert "could not be delivered" in bounce.text

    reply = inbox.parse("2", REPLY)
    assert (reply.kind, reply.sender, reply.sender_name) == ("reply", "sales@example.com", "Ольга")
    assert reply.text == "Интересно, пришлите подробнее."
    assert reply.received_at is not None

    assert inbox.parse("3", AUTO).kind == "auto"


def test_referral_codes():
    assert outreach.clean_ref(" AbC234 ") == "abc234"
    assert outreach.clean_ref("<script>") is None
    assert outreach.clean_ref(None) is None
    assert len({outreach.new_ref() for _ in range(50)}) == 50


async def test_add_from_the_console(app, settings):
    from app.__main__ import add_outreach

    report = await add_outreach(
        settings,
        [
            "Крым Чай\tcrimeatea@example.com\tСимферополь\tвозите чай по Крыму\n",
            "Без почты\t\t\t\n",
            "Крым Чай снова\tCrimeaTea@example.com\t\t\n",
            "ТК 82\tinfo@example.com\n",
        ],
    )
    assert [line.split(":")[0] for line in report] == [
        "added",
        "skipped (company and e-mail needed)",
        "already in the list",
        "added",
    ]
    async with app.state.sessionmaker() as db:
        contacts = list(await db.scalars(select(OutreachContact).order_by(OutreachContact.created_at)))
    assert [(c.company, c.city, c.note) for c in contacts] == [
        ("Крым Чай", "Симферополь", "возите чай по Крыму"),
        ("ТК 82", None, None),
    ]
    assert all(outreach.REF_PATTERN.fullmatch(c.ref) for c in contacts)


def test_the_read_flag_of_a_fetch_answer():
    assert inbox.seen_flag([(rb"5 (UID 5 FLAGS (\Seen \Answered) BODY[] {12}", b"raw"), b")"]) is True
    assert inbox.seen_flag([(b"5 (UID 5 FLAGS () BODY[] {12}", b"raw"), b")"]) is False
    # Some servers send the flags after the body.
    assert inbox.seen_flag([(b"5 (UID 5 BODY[] {12}", b"raw"), rb" FLAGS (\Seen))"]) is True
    assert inbox.parse("7", REPLY, seen=True).seen is True


async def test_marking_read_needs_a_mailbox(admin, client):
    response = await admin.post("/api/admin/mail/12/seen", json={"seen": True})
    assert response.status_code == 502 and error_code(response) == "mailbox_failed"
    await register(client, "bob@example.com")
    assert (await client.post("/api/admin/mail/12/seen", json={"seen": True})).status_code == 403
