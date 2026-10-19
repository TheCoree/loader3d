from alembic import command
from alembic.config import Config

from app.config import BACKEND_DIR, Settings


def alembic_config(settings: Settings) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["sqlalchemy_url"] = settings.sqlalchemy_url
    return config


def upgrade_database(settings: Settings) -> None:
    """`alembic upgrade head` for the configured database."""
    command.upgrade(alembic_config(settings), "head")
