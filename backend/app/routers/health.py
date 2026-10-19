from fastapi import APIRouter
from sqlalchemy import text

from app.db import Db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: Db) -> dict[str, str]:
    """Liveness and database connectivity (used by the Docker healthcheck)."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}
