"""The owner's phone widget (app/widget.py): mounted only with WIDGET_KEY_SHA256 (app/main.py)."""

import logging
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app import widget
from app.deps import SettingsDep
from app.errors import unauthorized
from app.ratelimit import RateLimiter, client_ip, too_many
from app.schemas.widget import WidgetStatsOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/widget", tags=["widget"])

# A widget asks every 15 minutes or so; the app on the phone a few times when it is opened.
_calls = RateLimiter(30, timedelta(minutes=1))
# Wrong keys from one address: nothing more is answered there for a while, even to the right key.
_wrong_keys = RateLimiter(10, timedelta(minutes=15))


async def require_key(request: Request, settings: SettingsDep) -> None:
    ip = client_ip(request)
    if wait := _wrong_keys.retry_after(ip):
        raise too_many(wait, "Слишком много неверных ключей")
    if wait := _calls.allow(ip):
        raise too_many(wait, "Слишком частые запросы")
    scheme, _, key = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not widget.key_matches(settings.widget_key_sha256, key.strip()):
        _wrong_keys.hit(ip)
        logger.warning("widget: a wrong key from %s", ip)
        raise unauthorized("invalid_widget_key", "Неверный ключ виджета")


WidgetKey = Annotated[None, Depends(require_key)]


@router.get("/stats")
async def stats(_: WidgetKey, request: Request, response: Response, settings: SettingsDep) -> WidgetStatsOut:
    """Status, load, online and the last two weeks by day — aggregates only."""
    response.headers["cache-control"] = "no-store"
    return await widget.stats(request.app.state, settings)
