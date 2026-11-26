"""Who is on the site (app/presence.py, admin «Онлайн»), messages of the team (app/messages.py) and the
places of IP addresses (app/geoip.py)."""

import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app import geoip, presence, tiers
from app.models import User, Visit, utcnow
from tests.conftest import ClientFactory, error_code, make_admin, make_settings, register

TAB = "tab-0000-1111"
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0"


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path, tiers_enabled=True)


@pytest.fixture
async def admin(app, make_client: ClientFactory):
    client = await make_client(BROWSER)
    await register(client, "admin@example.com")
    await make_admin(app, "admin@example.com")
    return client


async def live(admin) -> dict:
    response = await admin.get("/api/admin/live")
    assert response.status_code == 200, response.text
    return response.json()


def beat(tab: str = TAB, **body) -> dict:
    return {"tab": tab, "path": "/", **body}


async def test_a_guest_is_on_the_site_until_the_tab_closes(admin, make_client: ClientFactory):
    guest = await make_client(BROWSER)
    sent = await guest.post("/api/presence", json=beat(path="/pricing", section="pricing", idleSeconds=3))
    assert sent.status_code == 200 and sent.json() == {"messages": []}

    report = await live(admin)
    assert report["counts"]["guests"] == 1
    [tab] = report["tabs"]
    assert (tab["kind"], tab["online"], tab["path"], tab["section"]) == ("guest", True, "/pricing", "pricing")
    assert tab["ip"] == "127.0.0.•" and tab["browser"] == "Chrome" and tab["trail"] == ["/pricing"]
    assert tab["place"] is None and report["geo"] is False

    await guest.post("/api/presence", json=beat(path="/register"))
    assert (await live(admin))["tabs"][0]["trail"] == ["/pricing", "/register"]

    await guest.post("/api/presence", json=beat(leaving=True))
    report = await live(admin)
    assert report["counts"]["guests"] == 0 and report["tabs"][0]["online"] is False


async def test_bots_are_counted_apart(admin, make_client: ClientFactory):
    crawler = await make_client("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
    await crawler.post("/api/presence", json=beat())
    report = await live(admin)
    assert report["counts"]["bots"] == 1 and report["counts"]["guests"] == 0
    assert report["tabs"][0]["kind"] == "bot"


async def test_users_in_the_editor_and_their_messages(app, admin, make_client: ClientFactory):
    anna = await make_client(BROWSER)
    await register(anna, "anna@example.com", tier="pro")
    detail = {"plan": "Рейс на Казань", "vehicles": 2, "items": 34}
    await anna.post("/api/presence", json=beat("tab-anna-0001", path=f"/plans/{uuid.uuid4()}", detail=detail))

    report = await live(admin)
    assert report["counts"] == {"guests": 0, "users": 1, "editing": 1, "demo": 0, "bots": 0, "admins": 0}
    [tab] = report["tabs"]
    assert tab["kind"] == "user" and tab["path"] == "/plans/:id" and tab["detail"]["plan"] == "Рейс на Казань"
    assert tab["user"]["email"] == "anna@example.com"
    assert tab["user"]["tier"] == "pro" and tab["user"]["trial"]
    user_id = tab["user"]["id"]

    sent = await admin.post(
        f"/api/admin/users/{user_id}/messages",
        json={"kind": "gift", "title": "Подарок", "body": "Месяц Pro", "button": "Забрать", "giftDays": 30},
    )
    assert sent.status_code == 201, sent.text
    message = sent.json()
    assert message["outcome"] is None and message["authorName"]

    # The next report of her tab brings it; showing and answering it is seen by the admin.
    [waiting] = (await anna.post("/api/presence", json=beat("tab-anna-0001"))).json()["messages"]
    assert waiting["id"] == message["id"] and waiting["giftDays"] == 30
    assert (await anna.post(f"/api/messages/{message['id']}/shown")).status_code == 204
    trial_end = (await anna.get("/api/users/me")).json()["subscription"]["expiresAt"]

    answered = await anna.post(f"/api/messages/{message['id']}/answer", json={"outcome": "accepted"})
    assert answered.status_code == 200, answered.text
    subscription = answered.json()["user"]["subscription"]
    assert subscription["tier"] == "pro" and subscription["trial"] is False
    assert subscription["expiresAt"] > trial_end  # added to the end of the trial, not from today

    again = await anna.post(f"/api/messages/{message['id']}/answer", json={"outcome": "dismissed"})
    assert again.status_code == 409 and error_code(again) == "already_answered"
    assert (await anna.post("/api/presence", json=beat("tab-anna-0001"))).json()["messages"] == []

    [history] = (await admin.get(f"/api/admin/users/{user_id}/messages")).json()
    assert history["outcome"] == "accepted" and history["shownAt"] and history["giftUntil"]
    assert (await live(admin))["tabs"][0]["user"]["lastMessage"]["outcome"] == "accepted"


async def test_replies_closing_and_withdrawing(admin, make_client: ClientFactory):
    bob = await make_client(BROWSER)
    await register(bob, "bob@example.com")
    bob_id = (await bob.get("/api/users/me")).json()["id"]
    ask = {"kind": "feedback", "title": "Как вам?", "body": "Напишите пару слов", "button": "Отправить"}
    first = (await admin.post(f"/api/admin/users/{bob_id}/messages", json=ask | {"askReply": True})).json()
    second = (await admin.post(f"/api/admin/users/{bob_id}/messages", json=ask)).json()
    third = (await admin.post(f"/api/admin/users/{bob_id}/messages", json=ask)).json()

    waiting = [m["id"] for m in (await bob.get("/api/messages")).json()]
    assert waiting == [first["id"], second["id"], third["id"]]
    await bob.post(f"/api/messages/{first['id']}/answer", json={"outcome": "accepted", "reply": " Удобно! "})
    await bob.post(f"/api/messages/{second['id']}/answer", json={"outcome": "dismissed"})
    assert (await admin.delete(f"/api/admin/messages/{third['id']}")).status_code == 204
    assert error_code(await admin.delete(f"/api/admin/messages/{first['id']}")) == "already_answered"

    feed = (await admin.get("/api/admin/messages")).json()
    assert {m["id"]: (m["outcome"], m["reply"]) for m in feed} == {
        first["id"]: ("accepted", "Удобно!"),
        second["id"]: ("dismissed", None),
    }
    # Somebody else's message is not found.
    assert (await admin.post(f"/api/messages/{first['id']}/shown")).status_code == 404


async def test_only_admins_see_and_write(make_client: ClientFactory):
    bob = await make_client(BROWSER)
    await register(bob, "bob@example.com")
    bob_id = (await bob.get("/api/users/me")).json()["id"]
    assert (await bob.get("/api/admin/live")).status_code == 403
    assert (await bob.get("/api/admin/messages")).status_code == 403
    message = {"title": "Привет", "body": "Текст", "button": "OK"}
    assert (await bob.post(f"/api/admin/users/{bob_id}/messages", json=message)).status_code == 403


async def test_the_owner_signing_in_is_not_a_visit(app, admin, make_client: ClientFactory):
    visit_id = uuid.uuid4()
    async with app.state.sessionmaker() as db:
        db.add(
            Visit(
                id=visit_id,
                visitor="v",
                landing_path="/login",
                channel="direct",
                device="desktop",
                browser="Chrome",
                os="Windows",
            )
        )
        await db.commit()
    # A guest from the same address as an administrator is the administrator in another tab.
    guest = await make_client(BROWSER)
    await guest.post("/api/presence", json=beat("tab-guest-0001"))
    await admin.post("/api/presence", json=beat("tab-admin-0001", path="/admin", visitId=str(visit_id)))

    async with app.state.sessionmaker() as db:
        assert await db.get(Visit, visit_id) is None
    report = await live(admin)
    assert report["counts"]["admins"] == 2 and report["counts"]["guests"] == 0
    assert {t["kind"] for t in report["tabs"]} == {"admin"}


async def test_an_expired_token_is_not_taken_for_a_guest(make_client: ClientFactory):
    anna = await make_client(BROWSER)
    await register(anna, "anna@example.com")
    anna.headers["authorization"] = "Bearer not-a-token"
    response = await anna.post("/api/presence", json=beat())
    assert response.status_code == 401


async def test_gifts(app, admin, make_client: ClientFactory):
    carl = await make_client(BROWSER)
    await register(carl, "carl@example.com")
    carl_id = (await carl.get("/api/users/me")).json()["id"]
    now = utcnow()
    async with app.state.sessionmaker() as db:
        user = await db.scalar(select(User).where(User.email == "carl@example.com"))
        assert user is not None
        # «Старт»: from today.
        assert tiers.gift_pro(user, 30, now) == now + timedelta(days=30)
        assert (user.tier, user.tier_trial) == ("pro", False)
        # Paid «Pro»: from its end.
        assert tiers.gift_pro(user, 10, now) == now + timedelta(days=40)
        # Unlimited «Pro» and «Индивидуальный»: nothing to add.
        user.tier_expires_at = None
        assert tiers.gift_pro(user, 10, now) is None
        user.tier = "custom"
        assert tiers.gift_pro(user, 10, now) is None
        await db.commit()
    gift = {"kind": "gift", "title": "Подарок", "body": "Месяц Pro", "button": "Забрать", "giftDays": 30}
    refused = await admin.post(f"/api/admin/users/{carl_id}/messages", json=gift)
    assert refused.status_code == 400 and error_code(refused) == "gift_not_applicable"


def test_masked_addresses():
    assert presence.mask_ip("95.24.123.45") == "95.24.123.•"
    assert presence.mask_ip("2a00:1fa0:04a1:0:1:2:3:4") == "2a00:1fa0:4a1:•"
    assert presence.mask_ip("garbage") == "—"


# ------------------------------------------------------------------ a tiny MaxMind DB for app/geoip.py


def _string(text: str) -> bytes:
    raw = text.encode()
    if len(raw) < 29:
        return bytes([(2 << 5) | len(raw)]) + raw
    return bytes([(2 << 5) | 29, len(raw) - 29]) + raw  # the longer size form of the format


def _uint(value: int, kind: int = 6) -> bytes:
    raw = value.to_bytes(max(1, (value.bit_length() + 7) // 8))
    return bytes([(kind << 5) | len(raw)]) + raw


def _map(pairs: list[tuple[str, bytes]]) -> bytes:
    return bytes([(7 << 5) | len(pairs)]) + b"".join(_string(k) + v for k, v in pairs)


def _pointer(offset: int) -> bytes:
    assert offset < 2048
    return bytes([(1 << 5) | (offset >> 8)]) + bytes([offset & 0xFF])


def write_mmdb(path: Path, record: bytes, shared: bytes = b"") -> None:
    """An IPv4 tree with one network, 10.0.0.0/8, whose data is `record` (it may point into `shared`)."""
    nodes = 8
    data = shared + record
    leaf = nodes + 16 + len(shared)
    tree = b""
    for depth in range(nodes):
        bit = (10 >> (7 - depth)) & 1
        follow = depth + 1 if depth < nodes - 1 else leaf
        left, right = (follow, nodes) if bit == 0 else (nodes, follow)
        tree += left.to_bytes(3) + right.to_bytes(3)
    metadata = _map(
        [
            ("node_count", _uint(nodes)),
            ("record_size", _uint(24, 5)),
            ("ip_version", _uint(4, 5)),
            ("database_type", _string("test")),
        ]
    )
    path.write_bytes(tree + bytes(16) + data + geoip.METADATA_MARKER + metadata)


def test_places_of_addresses(tmp_path: Path):
    country = _map([("names", _map([("ru", _string("Россия")), ("en", _string("Russia"))]))])
    city = _map(
        [
            ("city", _map([("names", _map([("en", _string("Moscow")), ("ru", _string("Москва"))]))])),
            ("country", _pointer(0)),
        ]
    )
    write_mmdb(tmp_path / "city.mmdb", city, shared=country)
    write_mmdb(
        tmp_path / "asn.mmdb",
        _map(
            [
                ("autonomous_system_number", _uint(12389)),
                ("autonomous_system_organization", _string("Rostelecom")),
            ]
        ),
    )
    places = geoip.GeoIP(str(tmp_path))
    assert places.available
    assert places.lookup("10.20.30.40") == geoip.Place(
        city="Москва", region=None, country="Россия", org="Rostelecom", asn=12389
    )
    assert places.lookup("11.0.0.1") is None
    assert places.lookup("2a00::1") is None
    assert geoip.GeoIP("").lookup("10.0.0.1") is None


def test_download_months():
    from datetime import date

    assert geoip._months(date(2026, 1, 3)) == ["2026-01", "2025-12"]
    assert geoip._months(date(2026, 11, 25)) == ["2026-11", "2026-10"]
