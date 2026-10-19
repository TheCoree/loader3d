import asyncio
from logging.config import fileConfig
from typing import Any

from alembic import context
from alembic.autogenerate.api import AutogenContext
from sqlalchemy import pool
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.models import Base, UTCDateTime

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    # Set by app.migrate (python -m app); the alembic CLI reads DATABASE_URL like the app does.
    return config.attributes.get("sqlalchemy_url") or get_settings().sqlalchemy_url


def render_item(type_: str, obj: Any, autogen_context: AutogenContext) -> str | bool:
    if type_ != "type":
        return False
    # Keep migrations independent of app code: UTCDateTime is a plain timezone-aware timestamp.
    if isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    # The default rendering references a bare `Text` that the migration does not import.
    if isinstance(obj, postgresql.JSONB):
        autogen_context.imports.add("from sqlalchemy.dialects import postgresql")
        return "postgresql.JSONB()"
    return False


def configure(**kwargs: Any) -> None:
    context.configure(
        target_metadata=target_metadata,
        # SQLite cannot ALTER most things: batch ops copy the table there and are plain ALTERs on Postgres.
        render_as_batch=True,
        compare_type=True,
        render_item=render_item,
        **kwargs,
    )


def run_migrations_offline() -> None:
    configure(url=database_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Not app.db.create_engine: on SQLite it enables foreign keys, and then the DROP TABLE of a batch
    # table copy would cascade-delete the rows that reference the table.
    engine = create_async_engine(database_url(), poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
