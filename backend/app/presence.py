"""Who is on the site right now, for the admin «Онлайн» tab (routers/presence.py, GET /api/admin/live).

Every open tab of the site (src/lib/presence.ts) reports every 15 s while it is on screen, a minute when it is
in the background, and when it closes: the page, the section of the landing page, what is open in the editor,
how long ago the visitor moved. The server adds the IP address and the user agent of the request.

All of it is kept in memory only — never in the database or a log — and forgotten RECENT after the tab is
gone: the IP is shown masked with its approximate place (app/geoip.py). Tabs of administrators (and guests
from an administrator's address) are shown apart and not counted, and the visit of a page load an
administrator signs in from is taken out of the statistics (routers/presence.py).
"""

import ipaddress
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app import analytics

# A tab that has not reported for this long has left (a background tab reports once a minute at least).
GONE_AFTER = 150.0
# Tabs that left are listed this long.
RECENT = 15 * 60.0
# Beyond this many tabs the oldest are dropped (a flood of made-up tab ids).
MAX_TABS = 3000
TRAIL = 12


@dataclass
class Tab:
    id: str
    ip: str
    user_agent: str
    first_seen: float
    last_seen: float
    bot: bool
    device: str
    browser: str
    os: str
    user_id: uuid.UUID | None = None
    admin: bool = False
    visit_id: uuid.UUID | None = None
    path: str = "/"
    section: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)
    visible: bool = True
    idle_seconds: int = 0
    left_at: float | None = None
    # The visit an administrator signed in from, already taken out of the statistics.
    forgotten_visit: uuid.UUID | None = None
    # The pages of this tab, oldest first: (path, when).
    trail: list[tuple[str, float]] = field(default_factory=list)


def mask_ip(ip: str) -> str:
    """95.24.123.• / 2a00:1fa0:4a1:•: the network, not the device."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return "—"
    if address.version == 4:
        return ".".join(str(address).split(".")[:3]) + ".•"
    return ":".join(part.lstrip("0") or "0" for part in address.exploded.split(":")[:3]) + ":•"


class Presence:
    def __init__(self) -> None:
        self._tabs: dict[str, Tab] = {}

    def beat(
        self,
        *,
        tab: str,
        ip: str,
        user_agent: str,
        user_id: uuid.UUID | None,
        admin: bool,
        visit_id: uuid.UUID | None,
        path: str,
        section: str | None,
        detail: dict[str, Any],
        visible: bool,
        idle_seconds: int,
        now: float | None = None,
    ) -> Tab:
        now = time.monotonic() if now is None else now
        entry = self._tabs.get(tab)
        if entry is None:
            if len(self._tabs) >= MAX_TABS:
                self.sweep(now, force=True)
            entry = Tab(
                id=tab,
                ip=ip,
                user_agent=user_agent,
                first_seen=now,
                last_seen=now,
                bot=analytics.is_bot(user_agent),
                device=analytics.device_of(user_agent),
                browser=analytics.browser_of(user_agent),
                os=analytics.os_of(user_agent),
            )
            self._tabs[tab] = entry
        entry.ip = ip  # a phone may change networks within a visit
        entry.last_seen = now
        entry.left_at = None
        if user_id is not None:
            entry.user_id = user_id
            entry.admin = admin
        entry.visit_id = visit_id or entry.visit_id
        path = analytics.clean_path(path)
        if not entry.trail or entry.trail[-1][0] != path:
            entry.trail = [*entry.trail, (path, now)][-TRAIL:]
        entry.path = path
        entry.section = section
        entry.detail = detail
        entry.visible = visible
        entry.idle_seconds = idle_seconds
        return entry

    def leave(self, tab: str, now: float | None = None) -> None:
        entry = self._tabs.get(tab)
        if entry is not None and entry.left_at is None:
            entry.left_at = time.monotonic() if now is None else now

    def sweep(self, now: float, force: bool = False) -> None:
        for key, entry in list(self._tabs.items()):
            if now - entry.last_seen > GONE_AFTER + RECENT:
                del self._tabs[key]
        if force and len(self._tabs) >= MAX_TABS:
            for key in sorted(self._tabs, key=lambda k: self._tabs[k].last_seen)[: MAX_TABS // 10]:
                del self._tabs[key]

    def gone(self, entry: Tab, now: float) -> bool:
        return entry.left_at is not None or now - entry.last_seen > GONE_AFTER

    def snapshot(self, now: float | None = None) -> list[Tab]:
        """Tabs on the site and those gone within RECENT, newest activity first."""
        now = time.monotonic() if now is None else now
        self.sweep(now)
        return sorted(self._tabs.values(), key=lambda t: t.last_seen, reverse=True)

    def online_users(self, now: float | None = None) -> set[uuid.UUID]:
        now = time.monotonic() if now is None else now
        return {t.user_id for t in self._tabs.values() if t.user_id and not self.gone(t, now)}
