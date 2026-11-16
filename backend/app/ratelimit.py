"""Counters against brute force and flooding: at most `limit` hits per key within `window`.

Kept in this process: one API process serves the site. Behind Caddy the client address comes from
X-Forwarded-For (uvicorn's proxy headers, FORWARDED_ALLOW_IPS), so limits per IP are per visitor.
"""

import math
import time
from collections import deque
from datetime import timedelta

from fastapi import Request, status

from app.errors import ApiError

# Past this many keys a hit sweeps out the ones whose window has passed, so memory stays bounded.
_SWEEP_AT = 10_000


class RateLimiter:
    def __init__(self, limit: int, window: timedelta) -> None:
        self.limit = limit
        self.window = window.total_seconds()
        self._hits: dict[str, deque[float]] = {}
        _ALL.append(self)

    def _recent(self, key: str, now: float) -> deque[float] | None:
        hits = self._hits.get(key)
        if hits is None:
            return None
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if not hits:
            del self._hits[key]
            return None
        return hits

    def retry_after(self, key: str) -> int:
        """Seconds until the next hit is allowed; 0 — allowed now."""
        now = time.monotonic()
        hits = self._recent(key, now)
        if hits is None or len(hits) < self.limit:
            return 0
        return max(1, math.ceil(hits[0] + self.window - now))

    def hit(self, key: str) -> None:
        now = time.monotonic()
        if len(self._hits) >= _SWEEP_AT:
            for stale in list(self._hits):
                self._recent(stale, now)
        hits = self._recent(key, now)
        if hits is None:
            hits = self._hits[key] = deque()
        hits.append(now)

    def allow(self, key: str) -> int:
        """Counts a hit if allowed; returns the wait (0 — allowed and counted)."""
        wait = self.retry_after(key)
        if wait == 0:
            self.hit(key)
        return wait

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def clear(self) -> None:
        self._hits.clear()


_ALL: list[RateLimiter] = []


def clear_all() -> None:
    """Forgets every counter (tests)."""
    for limiter in _ALL:
        limiter.clear()


def client_ip(request: Request) -> str:
    return request.client.host[:45] if request.client else "unknown"


def wait_text(seconds: int) -> str:
    """«через 40 с», «через 3 мин»."""
    if seconds < 60:
        return f"через {seconds} с"
    return f"через {math.ceil(seconds / 60)} мин"


def too_many(seconds: int, message: str, code: str = "too_many_requests") -> ApiError:
    """429 with Retry-After; `message` is followed by when to try again."""
    return ApiError(
        status.HTTP_429_TOO_MANY_REQUESTS,
        code,
        f"{message}. Попробуйте {wait_text(seconds)}",
        headers={"Retry-After": str(seconds)},
        retryAfter=seconds,
    )
