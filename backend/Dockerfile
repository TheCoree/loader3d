# syntax=docker/dockerfile:1

# Versions come from .env via docker-compose.yml (build args); these are fallbacks.
ARG PYTHON_VERSION=3.14
ARG UV_VERSION=0.13.1

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# --- build: dependencies from uv.lock, unit tests, then drop the dev dependencies ------
FROM python:${PYTHON_VERSION}-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-install-project

COPY . .
RUN .venv/bin/python -m pytest -q -p no:cacheprovider
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev \
 && rm -rf tests

# --- runtime -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim

RUN useradd --system --uid 10001 --home-dir /app app
WORKDIR /app
COPY --from=build --chown=app:app /app /app

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    # Requests arrive through Caddy on the compose network: trust its X-Forwarded-For.
    FORWARDED_ALLOW_IPS=*
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

# Applies migrations (alembic upgrade head), then serves the API.
CMD ["python", "-m", "app", "--host", "0.0.0.0", "--port", "8000"]
