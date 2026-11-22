from datetime import date, datetime
from typing import Literal

from app.schemas.base import ApiModel

# Why the status is not "ok" (the widget words them): "db_down", "db_slow", "server_errors",
# "slow_responses", "high_cpu", "high_memory", "low_disk".
WidgetIssue = Literal[
    "db_down", "db_slow", "server_errors", "slow_responses", "high_cpu", "high_memory", "low_disk"
]


class WidgetLoad(ApiModel):
    """Measured by the API process itself (app/metrics.py), so known even when the database is down."""

    # Requests to the API (without the Docker healthcheck and the widget) in the last minute, and in each
    # of the last 30 minutes (the oldest first).
    requests_per_minute: int
    requests_series: list[int]
    # 95th percentile of the response time over 5 minutes; null — no requests.
    p95_ms: int | None
    # Answers 5xx in the last hour.
    errors_last_hour: int
    # Round trip of `SELECT 1`; null — the database did not answer.
    db_ms: float | None
    # Shares 0…1 of the server: load average per core (may exceed 1), memory in use, disk; null — unknown.
    cpu: float | None
    memory: float | None
    disk: float | None
    # Seconds since the API process started.
    uptime_seconds: int


class WidgetOnline(ApiModel):
    # Signed-in users with a request within 5 minutes.
    users: int
    # Visitors of the public pages within 5 minutes (app/analytics.py); null — statistics are off.
    guests: int | None


class WidgetPeriod(ApiModel):
    signups: int
    # Roubles of the payments paid within the period, and how many there were.
    revenue: int
    payments: int
    # Unique visitors of the public pages, summed by day; null — statistics are off.
    visitors: int | None


class WidgetDay(WidgetPeriod):
    # A day in Moscow time, like the admin panel.
    date: date


class WidgetTotals(ApiModel):
    users: int
    new_leads: int
    pending_payments: int


class WidgetData(ApiModel):
    """From the database: refreshed at most every half a minute, the last one is kept while it is down."""

    computed_at: datetime
    online: WidgetOnline
    # The last 7 days with today, and the 7 before them.
    week: WidgetPeriod
    previous_week: WidgetPeriod
    # 14 days, the oldest first; the last one is today.
    days: list[WidgetDay]
    totals: WidgetTotals


class WidgetStatsOut(ApiModel):
    status: Literal["ok", "degraded", "down"]
    issues: list[WidgetIssue]
    generated_at: datetime
    db_ok: bool
    # Online payment is on (TIERS_ENABLED and PAYMENT_PROVIDER): without it revenue stays 0.
    payments_enabled: bool
    load: WidgetLoad
    # null: the database has not answered once since the API started.
    data: WidgetData | None
