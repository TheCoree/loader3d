from datetime import timedelta

from fastapi import APIRouter, Request, status

from app.auth import OptionalAuth
from app.db import Db
from app.models import Lead
from app.ratelimit import RateLimiter, client_ip, too_many
from app.schemas.leads import LeadIn

router = APIRouter(prefix="/leads", tags=["leads"])

# Per client IP: enough against a script hammering the public form.
LEADS_PER_IP = RateLimiter(5, timedelta(minutes=10))


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def create_lead(body: LeadIn, request: Request, auth: OptionalAuth, db: Db) -> None:
    """A request for the «Индивидуальный» tier or a demo; admins see it in the admin panel."""
    if body.website:
        return  # a bot filled in the hidden field: pretend it worked
    ip = client_ip(request)
    if wait := LEADS_PER_IP.allow(ip):
        raise too_many(wait, "Слишком много заявок")
    db.add(
        Lead(
            name=body.name,
            email=body.email,
            phone=body.phone,
            company=body.company or None,
            message=body.message or None,
            tier=body.tier,
            user_id=auth.user.id if auth else None,
            ip_address=ip if request.client else None,
        )
    )
    await db.commit()
