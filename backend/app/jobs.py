"""Hourly work of the API (started by the lifespan in app/main.py): «тариф заканчивается» letters
(app/billing.py, with tiers on) and the removal of old visit statistics (app/analytics.py)."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import analytics, billing
from app.config import Settings
from app.models import utcnow

logger = logging.getLogger("app.jobs")

INTERVAL = timedelta(hours=1)


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
