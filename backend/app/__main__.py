"""`python -m app`: apply database migrations, then serve the API with uvicorn.

`python -m app make-admin EMAIL [--revoke]`: grant (or take away) access to the admin panel.

`python -m app send-test-mail EMAIL`: send a test letter with the current mail settings (MAIL_*, SMTP_*).

`python -m app send-reminders`: send the «тариф заканчивается» letters now (the API does it every hour).
"""

import argparse
import asyncio
import sys

import uvicorn
from sqlalchemy import select

from app import billing, mail
from app.config import BACKEND_DIR, Settings, get_settings
from app.db import create_engine, create_sessionmaker
from app.migrate import upgrade_database
from app.models import User, utcnow


async def set_admin(settings: Settings, email: str, is_admin: bool) -> bool:
    """False if there is no account with this e-mail."""
    engine = create_engine(settings.sqlalchemy_url)
    try:
        async with create_sessionmaker(engine)() as db:
            user = await db.scalar(select(User).where(User.email == email.strip().lower()))
            if user is None:
                return False
            user.is_admin = is_admin
            await db.commit()
            return True
    finally:
        await engine.dispose()


async def send_reminders(settings: Settings) -> int:
    engine = create_engine(settings.sqlalchemy_url)
    try:
        async with create_sessionmaker(engine)() as db:
            return await billing.send_tier_reminders(db, settings, utcnow())
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    parser.add_argument("--no-migrate", action="store_true", help="do not run `alembic upgrade head` first")
    commands = parser.add_subparsers(dest="command")
    make_admin = commands.add_parser("make-admin", help="grant access to the admin panel")
    make_admin.add_argument("email", help="e-mail of an existing account")
    make_admin.add_argument("--revoke", action="store_true", help="take the access away instead")
    test_mail = commands.add_parser(
        "send-test-mail", help="send a test letter with the current mail settings"
    )
    test_mail.add_argument("email", help="where to send it")
    commands.add_parser("send-reminders", help="send the «тариф заканчивается» letters now")
    args = parser.parse_args()

    settings = get_settings()
    if args.command == "send-test-mail":
        try:
            asyncio.run(mail.send_test(settings, args.email))
        except mail.MailError as exc:
            sys.exit(f"Not sent: {exc}")
        print(f"Test letter sent to {args.email} (MAIL_BACKEND={settings.mail_backend})")
        return

    if not args.no_migrate:
        upgrade_database(settings)

    if args.command == "make-admin":
        if not asyncio.run(set_admin(settings, args.email, not args.revoke)):
            sys.exit(f"No account with e-mail {args.email}")
        print(f"{args.email}: admin access {'revoked' if args.revoke else 'granted'}")
        return

    if args.command == "send-reminders":
        print(f"Reminders sent: {asyncio.run(send_reminders(settings))}")
        return

    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(BACKEND_DIR / "app")] if args.reload else None,
        server_header=False,
        proxy_headers=True,
        forwarded_allow_ips=settings.forwarded_allow_ips,
    )


if __name__ == "__main__":
    main()
