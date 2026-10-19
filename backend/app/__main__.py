"""`python -m app`: apply database migrations, then serve the API with uvicorn."""

import argparse

import uvicorn

from app.config import BACKEND_DIR, get_settings
from app.migrate import upgrade_database


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    parser.add_argument("--no-migrate", action="store_true", help="do not run `alembic upgrade head` first")
    args = parser.parse_args()

    if not args.no_migrate:
        upgrade_database(get_settings())
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(BACKEND_DIR / "app")] if args.reload else None,
        server_header=False,
    )


if __name__ == "__main__":
    main()
