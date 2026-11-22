"""What the API measures about itself for the owner's widget (routers/widget.py): requests per minute,
response times, server errors, which signed-in users made a request a moment ago, the load of the server.

Kept in the memory of this process (one API process serves the site, as for app/ratelimit.py) and lost on
a restart. Nothing about a request is kept but its time, how long it took and whether it failed; of a user
only the id and when they were last seen, forgotten after a few minutes. Only counts leave this module.
"""

import math
import os
import shutil
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable, MutableMapping
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

# Requests are counted in buckets of this many seconds, for an hour.
BUCKET_SECONDS = 10
HISTORY_SECONDS = 60 * 60
# Response times of this recent past give the 95th percentile, at most this many of them.
LATENCY_SECONDS = 5 * 60
_MAX_LATENCIES = 5000
# Not counted: the Docker healthcheck (every 30 s) and the widget itself.
UNCOUNTED_PATHS = frozenset({"/api/health", "/api/widget/stats"})


class RequestStats:
    """Requests to the API: how many, how fast, how many failed with 5xx."""

    def __init__(self) -> None:
        self.started = time.monotonic()
        # Bucket number (monotonic time // BUCKET_SECONDS) → [requests, server errors].
        self._buckets: dict[int, list[int]] = {}
        self._latencies: deque[tuple[float, float]] = deque(maxlen=_MAX_LATENCIES)

    def record(self, duration: float, status: int, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        key = int(now // BUCKET_SECONDS)
        bucket = self._buckets.get(key)
        if bucket is None:
            oldest = key - HISTORY_SECONDS // BUCKET_SECONDS
            for stale in [k for k in self._buckets if k < oldest]:
                del self._buckets[stale]
            bucket = self._buckets[key] = [0, 0]
        bucket[0] += 1
        if status >= 500:
            bucket[1] += 1
        self._latencies.append((now, duration))

    def _sum(self, since: float, until: float, index: int) -> int:
        return sum(
            counts[index]
            for key, counts in self._buckets.items()
            if since <= key * BUCKET_SECONDS + BUCKET_SECONDS / 2 < until
        )

    def requests(self, seconds: float, now: float | None = None) -> int:
        """Requests within the last `seconds` (to the nearest bucket)."""
        now = time.monotonic() if now is None else now
        return self._sum(now - seconds, now + BUCKET_SECONDS, 0)

    def errors(self, seconds: float, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        return self._sum(now - seconds, now + BUCKET_SECONDS, 1)

    def per_minute(self, minutes: int, now: float | None = None) -> list[int]:
        """Requests in each of the last `minutes` minutes, the oldest first; the last one ends now."""
        now = time.monotonic() if now is None else now
        series = []
        for back in range(minutes - 1, -1, -1):
            until = now - back * 60
            series.append(self._sum(until - 60, until + (BUCKET_SECONDS if back == 0 else 0), 0))
        return series

    def p95_ms(self, now: float | None = None) -> int | None:
        """95th percentile of the response time within LATENCY_SECONDS; None without requests."""
        now = time.monotonic() if now is None else now
        recent = sorted(d for t, d in self._latencies if now - t <= LATENCY_SECONDS)
        if not recent:
            return None
        return round(recent[min(len(recent) - 1, math.ceil(0.95 * len(recent)) - 1)] * 1000)

    def uptime(self, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        return int(now - self.started)


class RequestMetricsMiddleware:
    """Counts every request to /api (but UNCOUNTED_PATHS) in `stats`: its duration and status."""

    def __init__(self, app: ASGIApp, stats: RequestStats) -> None:
        self.app = app
        self.stats = stats

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/") or path in UNCOUNTED_PATHS:
            await self.app(scope, receive, send)
            return
        start = time.monotonic()
        # An exception that escapes the app becomes a 500 of ServerErrorMiddleware, outside of this one.
        status = 500

        async def send_status(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_status)
        finally:
            self.stats.record(time.monotonic() - start, status)


class Activity:
    """Signed-in users who made a request lately (`seen` from app/auth.py): id → when."""

    def __init__(self, window: float) -> None:
        self.window = window
        self._seen: dict[uuid.UUID, float] = {}
        self._swept = -math.inf

    def seen(self, user_id: uuid.UUID, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        self._seen[user_id] = now
        if now - self._swept > self.window:
            self._swept = now
            for stale in [u for u, at in self._seen.items() if now - at > self.window]:
                del self._seen[stale]

    def recent(self, now: float | None = None) -> set[uuid.UUID]:
        now = time.monotonic() if now is None else now
        return {u for u, at in self._seen.items() if now - at <= self.window}


@dataclass(frozen=True, slots=True)
class SystemLoad:
    """Shares 0…1 (the CPU may go above 1: more work than cores); None where the system does not tell."""

    cpu: float | None
    memory: float | None
    disk: float | None


def system_load() -> SystemLoad:
    """The server the API runs on. In a container these are the host's numbers (/proc is not virtualized
    for them): the load average over a minute per core, the memory in use, the disk of the root."""
    cpu = None
    getloadavg = getattr(os, "getloadavg", None)
    if getloadavg is not None:
        with suppress(OSError):
            cpu = round(getloadavg()[0] / (os.cpu_count() or 1), 3)
    memory = None
    try:
        with open("/proc/meminfo", encoding="ascii") as file:
            info = {line.split(":")[0]: int(line.split()[1]) for line in file if line.count(":") == 1}
        if info.get("MemTotal"):
            memory = round(1 - info["MemAvailable"] / info["MemTotal"], 3)
    except OSError, KeyError, ValueError, IndexError:
        pass
    disk = None
    try:
        usage = shutil.disk_usage("/")
        disk = round(usage.used / usage.total, 3) if usage.total else None
    except OSError:
        pass
    return SystemLoad(cpu=cpu, memory=memory, disk=disk)
