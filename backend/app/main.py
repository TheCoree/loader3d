import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import jobs
from app.analytics import LIVE_WINDOW
from app.config import Settings, get_settings
from app.db import create_engine, create_sessionmaker
from app.geoip import GeoIP
from app.metrics import Activity, RequestMetricsMiddleware, RequestStats
from app.presence import Presence
from app.routers import (
    admin,
    analytics,
    auth,
    billing,
    health,
    leads,
    messages,
    outreach,
    plans,
    presence,
    users,
    widget,
)
from app.widget import WidgetCache

API_PREFIX = "/api"


def create_app(settings: Settings | None = None) -> FastAPI:
    """App factory: `uvicorn app.main:create_app --factory`, or `python -m app`."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.sqlalchemy_url)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)
        # Hourly: «тариф заканчивается» letters and the removal of old visit statistics; every few minutes:
        # pending payments asked about at their provider; every minute: one queued letter to a company
        # (app/jobs.py).
        tasks = [
            asyncio.create_task(jobs.hourly(app.state.sessionmaker, settings)),
            asyncio.create_task(jobs.check_payments(app.state.sessionmaker, settings)),
            asyncio.create_task(jobs.send_outreach(app.state.sessionmaker, settings)),
        ]
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            for task in tasks:
                with suppress(asyncio.CancelledError):
                    await task
            await engine.dispose()

    app = FastAPI(
        title="Loader3D API",
        version="0.1.0",
        lifespan=lifespan,
        # The interactive docs and the schema only in development: production does not describe its API
        # to everyone.
        docs_url=f"{API_PREFIX}/docs" if settings.environment == "development" else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if settings.environment == "development" else None,
    )
    app.state.settings = settings
    # For the owner's widget (app/metrics.py): requests and their times, users seen a moment ago.
    app.state.request_stats = RequestStats()
    app.state.activity = Activity(LIVE_WINDOW.total_seconds())
    # The admin «Онлайн» tab (app/presence.py, app/geoip.py): open tabs in memory, places of addresses.
    app.state.presence = Presence()
    app.state.geoip = GeoIP(settings.geoip_dir)
    app.add_middleware(RequestMetricsMiddleware, stats=app.state.request_stats)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    for module in (
        health,
        auth,
        users,
        plans,
        leads,
        billing,
        analytics,
        admin,
        outreach,
        presence,
        messages,
    ):
        app.include_router(module.router, prefix=API_PREFIX)
    # Without a key the widget's endpoint does not exist at all: 404 like any unknown path.
    if settings.widget_key_sha256:
        app.state.widget_cache = WidgetCache()
        app.include_router(widget.router, prefix=API_PREFIX)
    return app
