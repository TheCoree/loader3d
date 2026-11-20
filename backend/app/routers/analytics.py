"""Collection of visit statistics (app/analytics.py); the report is GET /api/admin/analytics."""

from datetime import timedelta
from urllib.parse import urlsplit

from fastapi import APIRouter, Request, Response, status
from sqlalchemy.exc import IntegrityError

from app import analytics
from app.db import Db
from app.deps import SettingsDep
from app.models import utcnow
from app.ratelimit import RateLimiter, client_ip
from app.schemas.analytics import CollectIn

router = APIRouter(prefix="/analytics", tags=["analytics"])

# A page sends a report every 15 s of activity and when it is hidden: a few per minute per visitor.
REPORTS_PER_IP = RateLimiter(300, timedelta(minutes=10))


@router.post("/collect", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def collect(body: CollectIn, request: Request, db: Db, settings: SettingsDep) -> Response:
    """Public, sent with navigator.sendBeacon; answers 204 whatever happens (a beacon reads no reply)."""
    ip = client_ip(request)
    if not settings.analytics_enabled or REPORTS_PER_IP.allow(ip):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    own_host = urlsplit(settings.site_url).hostname if settings.site_url else request.url.hostname
    report = {
        "visit_id": body.visit_id,
        "ip": ip,
        "user_agent": request.headers.get("user-agent", "")[:500],
        "own_host": (own_host or "").removeprefix("www.") or None,
        "context": body.context.model_dump(),
        "engaged_ms": body.engaged_ms,
        "events": [e.model_dump() for e in body.events],
    }
    # Two first reports of a visit at once: the second finds the visit made by the first on a retry.
    for attempt in range(2):
        try:
            if await analytics.record(db, settings, **report, now=utcnow()):
                await db.commit()
            break
        except IntegrityError:
            await db.rollback()
            if attempt:
                raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
