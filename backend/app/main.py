import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import jobs
from app.config import Settings, get_settings
from app.db import create_engine, create_sessionmaker
from app.routers import admin, analytics, auth, billing, health, leads, plans, users

API_PREFIX = "/api"


def create_app(settings: Settings | None = None) -> FastAPI:
    """App factory: `uvicorn app.main:create_app --factory`, or `python -m app`."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.sqlalchemy_url)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)
        # Hourly: «тариф заканчивается» letters and the removal of old visit statistics (app/jobs.py).
        hourly = asyncio.create_task(jobs.hourly(app.state.sessionmaker, settings))
        try:
            yield
        finally:
            hourly.cancel()
            with suppress(asyncio.CancelledError):
                await hourly
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

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    for module in (health, auth, users, plans, leads, billing, analytics, admin):
        app.include_router(module.router, prefix=API_PREFIX)
    return app
