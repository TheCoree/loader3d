import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import ApiModel


class CollectContext(ApiModel):
    # document.referrer and the first page with its query (utm_*, yclid, gclid).
    referrer: str | None = Field(None, max_length=2000)
    landing: str = Field("/", max_length=2000)
    screen: int | None = Field(None, ge=0, le=20000)
    lang: str | None = Field(None, max_length=35)


class CollectEvent(ApiModel):
    kind: Literal["page", "section", "click", "signup"]
    name: str = Field(max_length=200)
    # "section": milliseconds in the section since the last report.
    ms: int | None = Field(None, ge=0, le=86_400_000)


class CollectIn(ApiModel):
    """A report of src/lib/analytics.ts: sent every few seconds of activity and when the page is hidden."""

    visit_id: uuid.UUID
    engaged_ms: int = Field(0, ge=0, le=86_400_000)
    context: CollectContext = Field(default_factory=CollectContext)
    events: list[CollectEvent] = Field(default_factory=list, max_length=100)


class AnalyticsSummary(ApiModel):
    visits: int
    # Unique per day, summed over the days.
    visitors: int
    pageviews: int
    avg_engaged_ms: int
    median_engaged_ms: int
    bounce_rate: float
    signups: int
    conversion: float


class AnalyticsDay(ApiModel):
    date: date
    visits: int
    visitors: int
    signups: int


class AnalyticsBreakdown(ApiModel):
    key: str
    visits: int
    signups: int
    avg_engaged_ms: int


class AnalyticsDuration(ApiModel):
    label: str
    visits: int


class AnalyticsPage(ApiModel):
    path: str
    views: int
    visits: int


class AnalyticsSection(ApiModel):
    section: str
    # Visits of the landing page that saw the section, their share and the average time in it.
    visits: int
    reach: float
    avg_ms: int


class AnalyticsClick(ApiModel):
    name: str
    clicks: int
    visits: int


class AnalyticsReport(ApiModel):
    days: Literal[7, 30, 90]
    since: datetime
    summary: AnalyticsSummary
    # The same figures for the period of the same length before.
    previous: AnalyticsSummary
    daily: list[AnalyticsDay]
    channels: list[AnalyticsBreakdown]
    sources: list[AnalyticsBreakdown]
    search_engines: list[AnalyticsBreakdown]
    campaigns: list[AnalyticsBreakdown]
    keywords: list[AnalyticsBreakdown]
    entry_pages: list[AnalyticsBreakdown]
    devices: list[AnalyticsBreakdown]
    browsers: list[AnalyticsBreakdown]
    systems: list[AnalyticsBreakdown]
    durations: list[AnalyticsDuration]
    pages: list[AnalyticsPage]
    landing_visits: int
    sections: list[AnalyticsSection]
    clicks: list[AnalyticsClick]
