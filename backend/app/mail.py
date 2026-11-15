"""Outgoing mail. For now only the "console" backend: the message goes to the API log, so the code can be
read there while the domain has no mailbox. A real backend (SMTP) plugs in here behind MAIL_BACKEND."""

import logging

from app.config import Settings

logger = logging.getLogger("app.mail")


async def send_verification_code(settings: Settings, email: str, code: str) -> None:
    if settings.mail_backend == "console":
        # print: uvicorn does not configure the root logger, and the code must be visible in development.
        print(f"[mail] Verification code for {email}: {code}", flush=True)
        logger.info("verification code sent to %s", email)
