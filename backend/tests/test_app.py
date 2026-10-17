import asyncio
from pathlib import Path

from alembic import command
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.migrate import alembic_config
from app.models import Base
from tests.conftest import make_settings


async def test_health(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_openapi_schema_is_served(client):
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert {"/api/auth/login", "/api/auth/refresh", "/api/plans", "/api/plans/{plan_id}"} <= paths.keys()


def test_migrations_match_the_models(tmp_path: Path):
    """`alembic upgrade head` builds exactly the schema of app/models.py, and `downgrade` undoes it."""
    settings = make_settings(tmp_path)

    async def drop_everything() -> None:
        engine = create_async_engine(settings.sqlalchemy_url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        await engine.dispose()

    asyncio.run(drop_everything())
    config = alembic_config(settings)
    command.upgrade(config, "head")
    command.check(config)  # raises if autogenerate would produce a new migration
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    asyncio.run(drop_everything())
