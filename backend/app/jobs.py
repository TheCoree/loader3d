"""Background work of the API (started by the lifespan in app/main.py). Hourly: «тариф заканчивается»
letters (app/billing.py, with tiers on) and the removal of old visit statistics (app/analytics.py). Every
few minutes: pending payments are asked about at their provider (billing.reconcile). Every minute: one queued
letter to a company (app/outreach.py), so the mail server never sends them in a burst."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import analytics, billing, outreach
from app.config import Settings
from app.models import utcnow

logger = logging.getLogger("app.jobs")

INTERVAL = timedelta(hours=1)
PAYMENTS_INTERVAL = timedelta(minutes=5)
OUTREACH_INTERVAL = timedelta(minutes=1)


async def run_once(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    now = utcnow()
    if settings.tiers_enabled:
        async with sessionmaker() as db:
            if sent := await billing.send_tier_reminders(db, settings, now):
                # print: uvicorn does not configure the root logger.
                print(f"[jobs] tier reminders sent: {sent}", flush=True)
    async with sessionmaker() as db:
        await analytics.prune(db, settings, now)


async def hourly(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    await asyncio.sleep(60)  # not in the middle of the start-up
    while True:
        try:
            await run_once(sessionmaker, settings)
        except Exception:
            logger.exception("hourly jobs failed")
        await asyncio.sleep(INTERVAL.total_seconds())


async def check_payments_once(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    if not settings.tiers_enabled:
        return
    async with sessionmaker() as db:
        if changed := await billing.reconcile(db, settings, utcnow()):
            print(f"[jobs] payments settled by a status check: {changed}", flush=True)


async def check_payments(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    await asyncio.sleep(90)
    while True:
        try:
            await check_payments_once(sessionmaker, settings)
        except Exception:
            logger.exception("payment checks failed")
        await asyncio.sleep(PAYMENTS_INTERVAL.total_seconds())


async def send_outreach_once(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    async with sessionmaker() as db:
        if contact := await outreach.send_next(db, settings, utcnow()):
            print(f"[jobs] outreach letter to {contact.email}: {contact.status}", flush=True)


async def send_outreach(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    await asyncio.sleep(30)
    while True:
        try:
            await send_outreach_once(sessionmaker, settings)
        except Exception:
            logger.exception("outreach letters failed")
        await asyncio.sleep(OUTREACH_INTERVAL.total_seconds())
