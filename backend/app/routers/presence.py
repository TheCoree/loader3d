"""Who is on the site (app/presence.py): the tabs' reports and the admin «Онлайн» tab."""

import time
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app import analytics, messages
from app.auth import AdminAuth, AuthIfSent
from app.db import Db
from app.geoip import GeoIP
from app.models import OutreachContact, Plan, User, UserMessage, Visit, utcnow
from app.presence import Presence, Tab, mask_ip
from app.ratelimit import RateLimiter, client_ip
from app.schemas.presence import (
    LiveCounts,
    LiveOut,
    LivePlace,
    LiveSource,
    LiveTab,
    LiveUser,
    PresenceDetail,
    PresenceIn,
    PresenceOut,
    UserMessageOut,
)
from app.tiers import effective_tier

router = APIRouter(tags=["presence"])

# A tab reports 4 times a minute: a few tabs of an office behind one address fit easily.
BEATS_PER_IP = RateLimiter(600, timedelta(minutes=10))


@router.post("/presence", include_in_schema=False)
async def beat(body: PresenceIn, request: Request, db: Db, auth: AuthIfSent) -> PresenceOut:
    """A tab is open: where, and what is open in it. Answers the messages waiting for a signed-in user."""
    ip = client_ip(request)
    presence: Presence = request.app.state.presence
    if BEATS_PER_IP.allow(ip):
        return PresenceOut()
    if body.leaving:
        presence.leave(body.tab)
        return PresenceOut()
    user = auth.user if auth else None
    tab = presence.beat(
        tab=body.tab,
        ip=ip,
        user_agent=request.headers.get("user-agent", "")[:500],
        user_id=user.id if user else None,
        admin=bool(user and user.is_admin),
        visit_id=body.visit_id,
        path=body.path,
        section=body.section,
        detail=body.detail.model_dump(exclude_defaults=True) if body.detail else {},
        visible=body.visible,
        idle_seconds=body.idle_seconds,
    )
    if user is None:
        return PresenceOut()
    if user.is_admin and tab.visit_id and tab.forgotten_visit != tab.visit_id:
        # The owner signed in from this page load: it was not a visitor.
        await analytics.forget_visit(db, tab.visit_id)
        await db.commit()
        tab.forgotten_visit = tab.visit_id
    return PresenceOut(
        messages=[UserMessageOut.model_validate(m) for m in await messages.pending(db, user.id)]
    )


def _kind(tab: Tab, admin_ips: set[str]) -> str:
    if tab.bot:
        return "bot"
    if tab.admin or (tab.user_id is None and tab.ip in admin_ips):
        return "admin"
    return "user" if tab.user_id else "guest"


@router.get("/admin/live")
async def live(request: Request, auth: AdminAuth, db: Db) -> LiveOut:
    presence: Presence = request.app.state.presence
    geoip: GeoIP = request.app.state.geoip
    mono, wall = time.monotonic(), utcnow()

    def at(moment: float) -> datetime:
        return wall - timedelta(seconds=max(0.0, mono - moment))

    tabs = presence.snapshot(mono)
    admin_ips = {t.ip for t in tabs if t.admin}
    user_ids = {t.user_id for t in tabs if t.user_id}
    visit_ids = {t.visit_id for t in tabs if t.visit_id}
    users: dict[uuid.UUID, User] = {}
    plan_counts: dict[uuid.UUID, int] = {}
    last_messages: dict[uuid.UUID, UserMessage] = {}
    if user_ids:
        users = {u.id: u for u in await db.scalars(select(User).where(User.id.in_(user_ids)))}
        plan_counts = dict(
            (
                await db.execute(
                    select(Plan.owner_id, func.count())
                    .where(Plan.owner_id.in_(user_ids))
                    .group_by(Plan.owner_id)
                )
            ).all()  # type: ignore[arg-type]
        )
        for m in await db.scalars(
            select(UserMessage)
            .where(UserMessage.user_id.in_(user_ids))
            .order_by(UserMessage.created_at.desc())
        ):
            last_messages.setdefault(m.user_id, m)
    visits = (
        {v.id: v for v in await db.scalars(select(Visit).where(Visit.id.in_(visit_ids)))} if visit_ids else {}
    )
    refs = {v.utm_term for v in visits.values() if v.utm_term} | {u.ref for u in users.values() if u.ref}
    companies = (
        dict(
            (
                await db.execute(
                    select(OutreachContact.ref, OutreachContact.company).where(OutreachContact.ref.in_(refs))
                )
            ).all()
        )
        if refs
        else {}
    )
    authors = (
        {
            u.id: u.display_name
            for u in await db.scalars(
                select(User).where(User.id.in_({m.author_id for m in last_messages.values() if m.author_id}))
            )
        }
        if last_messages
        else {}
    )

    out: list[LiveTab] = []
    counts = dict.fromkeys(("guests", "users", "editing", "demo", "bots", "admins"), 0)
    for tab in tabs:
        kind = _kind(tab, admin_ips)
        online = not presence.gone(tab, mono)
        user = users.get(tab.user_id) if tab.user_id else None
        visit = visits.get(tab.visit_id) if tab.visit_id else None
        detail = PresenceDetail.model_validate(tab.detail) if tab.detail else None
        if online:
            counts[{"guest": "guests", "user": "users", "admin": "admins", "bot": "bots"}[kind]] += 1
            if kind == "user" and tab.path.startswith("/plans/"):
                counts["editing"] += 1
            if kind == "guest" and detail and detail.demo:
                counts["demo"] += 1
        source = None
        if visit is not None:
            source = LiveSource(
                channel=visit.channel,
                search_engine=visit.search_engine,
                referrer_host=visit.referrer_host,
                utm_source=visit.utm_source,
                utm_term=visit.utm_term,
                company=companies.get(visit.utm_term) if visit.utm_term else None,
            )
        elif user is not None and user.ref:
            source = LiveSource(channel="email", utm_term=user.ref, company=companies.get(user.ref))
        place = geoip.lookup(tab.ip)
        message = last_messages.get(user.id) if user else None
        out.append(
            LiveTab(
                id=tab.id,
                kind=kind,  # type: ignore[arg-type]
                online=online,
                first_seen=at(tab.first_seen),
                last_seen=at(tab.left_at if tab.left_at is not None else tab.last_seen),
                path=tab.path,
                section=tab.section,
                detail=detail,
                visible=tab.visible,
                idle_seconds=tab.idle_seconds + int(mono - tab.last_seen) if online else tab.idle_seconds,
                trail=[path for path, _ in tab.trail],
                ip=mask_ip(tab.ip),
                place=LivePlace(city=place.city, region=place.region, country=place.country, org=place.org)
                if place
                else None,
                device=tab.device,
                browser=tab.browser,
                os=tab.os,
                user=LiveUser(
                    id=user.id,
                    email=user.email,
                    display_name=user.display_name,
                    created_at=user.created_at,
                    plan_count=plan_counts.get(user.id, 0),
                    tier=effective_tier(user, wall) if request.app.state.settings.tiers_enabled else None,
                    trial=user.tier_trial,
                    last_message=messages.admin_out(
                        message, user, authors.get(message.author_id) if message.author_id else None
                    )
                    if message
                    else None,
                )
                if user
                else None,
                source=source,
                signed_up=bool(visit and visit.signed_up),
            )
        )
    return LiveOut(counts=LiveCounts(**counts), tabs=out, geo=geoip.available)
