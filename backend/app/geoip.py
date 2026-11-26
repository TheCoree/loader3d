"""The approximate place and network of an IP address, for the admin «Онлайн» tab (app/presence.py).

Free DB-IP Lite databases (https://db-ip.com, CC BY 4.0 — the tab names the source): «IP to City Lite» and
«IP to ASN Lite» in the MaxMind DB format, downloaded once a month into GEOIP_DIR (app/jobs.py). Lookups are
local: no address leaves the server. Without the files (GEOIP_DIR empty, no download yet) there is no place,
and nothing else changes.

The reader is a small one of our own (the format is public: https://maxmind.github.io/MaxMind-DB/), so the
API has no extra dependency; it reads the file through mmap.
"""

import gzip
import ipaddress
import logging
import mmap
import os
import shutil
import struct
import urllib.request
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

METADATA_MARKER = b"\xab\xcd\xefMaxMind.com"
DOWNLOAD_URL = "https://download.db-ip.com/free/dbip-{name}-lite-{month}.mmdb.gz"
NAMES = ("city", "asn")
# A month's file is published at the start of the month; older than this — fetch the new one.
MAX_AGE_DAYS = 35
DOWNLOAD_TIMEOUT_SECONDS = 120


class DatabaseError(Exception):
    """Not a MaxMind DB file, or a damaged one."""


class Reader:
    """Lookups in one .mmdb file (IPv4 and IPv6 trees, record sizes 24, 28 and 32)."""

    def __init__(self, path: Path) -> None:
        with path.open("rb") as file:
            self._buf: Any = mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ)
        start = self._buf.rfind(METADATA_MARKER, max(0, len(self._buf) - 128 * 1024))
        if start < 0:
            raise DatabaseError(f"{path.name}: no metadata")
        self.metadata, _ = self._decode(start + len(METADATA_MARKER), 0)
        if not isinstance(self.metadata, dict):
            raise DatabaseError(f"{path.name}: bad metadata")
        self._nodes = int(self.metadata["node_count"])
        self._record = int(self.metadata["record_size"])
        if self._record not in (24, 28, 32):
            raise DatabaseError(f"{path.name}: record size {self._record}")
        self._node_bytes = self._record // 4
        self._data = self._nodes * self._node_bytes + 16
        self._ip_version = int(self.metadata["ip_version"])
        self._ipv4_start = self._find_ipv4_start()

    def close(self) -> None:
        self._buf.close()

    def _find_ipv4_start(self) -> int:
        """IPv4 addresses live under ::/96 of an IPv6 tree."""
        if self._ip_version == 4:
            return 0
        node = 0
        for _ in range(96):
            if node >= self._nodes:
                break
            node = self._read_node(node, 0)
        return node

    def _read_node(self, node: int, bit: int) -> int:
        offset = node * self._node_bytes
        b = self._buf
        if self._record == 24:
            at = offset + bit * 3
            return int.from_bytes(b[at : at + 3])
        if self._record == 28:
            middle = b[offset + 3]
            if bit == 0:
                return ((middle & 0xF0) << 20) | int.from_bytes(b[offset : offset + 3])
            return ((middle & 0x0F) << 24) | int.from_bytes(b[offset + 4 : offset + 7])
        at = offset + bit * 4
        return int.from_bytes(b[at : at + 4])

    def get(self, ip: str) -> Any:
        try:
            address = ipaddress.ip_address(ip)
        except ValueError:
            return None
        if address.version == 6 and self._ip_version == 4:
            return None
        packed = address.packed
        node = self._ipv4_start if address.version == 4 else 0
        for i in range(len(packed) * 8):
            if node >= self._nodes:
                break
            node = self._read_node(node, (packed[i >> 3] >> (7 - (i & 7))) & 1)
        if node <= self._nodes:
            return None
        value, _ = self._decode(self._data + node - self._nodes - 16, self._data)
        return value

    def _decode(self, offset: int, base: int) -> tuple[Any, int]:
        """(value, next offset) of the data field at `offset`; `base` — where pointers count from."""
        b = self._buf
        control = b[offset]
        offset += 1
        kind = control >> 5
        if kind == 1:  # pointer
            size = (control >> 3) & 0x3
            low = control & 0x7
            if size == 0:
                pointer = (low << 8) | b[offset]
            elif size == 1:
                pointer = ((low << 16) | int.from_bytes(b[offset : offset + 2])) + 2048
            elif size == 2:
                pointer = ((low << 24) | int.from_bytes(b[offset : offset + 3])) + 526336
            else:
                pointer = int.from_bytes(b[offset : offset + 4])
            value, _ = self._decode(base + pointer, base)
            return value, offset + size + 1
        if kind == 0:  # extended type
            kind = 7 + b[offset]
            offset += 1
        size = control & 0x1F
        if size >= 29:
            extra = size - 28
            raw = int.from_bytes(b[offset : offset + extra])
            size = (29, 285, 65821)[extra - 1] + raw
            offset += extra
        if kind == 2:  # UTF-8 string
            return bytes(b[offset : offset + size]).decode("utf-8", "replace"), offset + size
        if kind == 3:  # double
            return struct.unpack(">d", b[offset : offset + 8])[0], offset + 8
        if kind == 4:  # bytes
            return bytes(b[offset : offset + size]), offset + size
        if kind in (5, 6, 9, 10):  # unsigned integers
            return int.from_bytes(b[offset : offset + size]), offset + size
        if kind == 7:  # map
            result: dict[str, Any] = {}
            for _ in range(size):
                key, offset = self._decode(offset, base)
                result[str(key)], offset = self._decode(offset, base)
            return result, offset
        if kind == 8:  # int32
            return int.from_bytes(b[offset : offset + size], signed=size == 4), offset + size
        if kind == 11:  # array
            items: list[Any] = []
            for _ in range(size):
                item, offset = self._decode(offset, base)
                items.append(item)
            return items, offset
        if kind == 14:  # boolean: the size is the value
            return bool(size), offset
        if kind == 15:  # float
            return struct.unpack(">f", b[offset : offset + 4])[0], offset + 4
        raise DatabaseError(f"unknown data type {kind}")


@dataclass(frozen=True, slots=True)
class Place:
    city: str | None
    region: str | None
    country: str | None
    # The network's owner: «Rostelecom», «Google LLC».
    org: str | None
    asn: int | None


def _name(record: Any) -> str | None:
    names = record.get("names") if isinstance(record, dict) else None
    if not isinstance(names, dict):
        return None
    return names.get("ru") or names.get("en")


class GeoIP:
    """The databases of one directory; reloaded when the job has downloaded new files."""

    def __init__(self, directory: str) -> None:
        self.directory = Path(directory) if directory else None
        self._readers: dict[str, Reader] = {}
        self._loaded: dict[str, float] = {}

    @property
    def available(self) -> bool:
        self._load()
        return "city" in self._readers or "asn" in self._readers

    def _load(self) -> None:
        if self.directory is None:
            return
        for name in NAMES:
            path = self.directory / f"{name}.mmdb"
            try:
                mtime = path.stat().st_mtime
            except OSError:
                continue
            if self._loaded.get(name) == mtime:
                continue
            try:
                reader = Reader(path)
            except OSError, ValueError, KeyError, IndexError, DatabaseError:
                logger.exception("GeoIP: cannot read %s", path)
                continue
            old = self._readers.get(name)
            self._readers[name] = reader
            self._loaded[name] = mtime
            self.lookup.cache_clear()
            if old is not None:
                old.close()

    @lru_cache(maxsize=4096)  # noqa: B019 — one instance for the app's life
    def lookup(self, ip: str) -> Place | None:
        self._load()
        try:
            city = self._readers["city"].get(ip) if "city" in self._readers else None
            asn = self._readers["asn"].get(ip) if "asn" in self._readers else None
        except IndexError, ValueError, DatabaseError:
            return None
        if not city and not asn:
            return None
        city = city if isinstance(city, dict) else {}
        asn = asn if isinstance(asn, dict) else {}
        regions = city.get("subdivisions")
        return Place(
            city=_name(city.get("city")),
            region=_name(regions[0]) if isinstance(regions, list) and regions else None,
            country=_name(city.get("country")),
            org=asn.get("autonomous_system_organization"),
            asn=asn.get("autonomous_system_number"),
        )


def _fresh(path: Path, today: date) -> bool:
    try:
        age = today - date.fromtimestamp(path.stat().st_mtime)
    except OSError:
        return False
    return age.days < MAX_AGE_DAYS


def _months(today: date) -> list[str]:
    """This month and the one before: the new file may not be out yet on the 1st."""
    previous = date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)
    return [f"{today:%Y-%m}", f"{previous:%Y-%m}"]


def download(directory: str, today: date) -> list[str]:
    """Fetches the files that are missing or older than a month. Blocking: call it in a worker thread."""
    if not directory:
        return []
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    fetched: list[str] = []
    for name in NAMES:
        target = folder / f"{name}.mmdb"
        if _fresh(target, today):
            continue
        for month in _months(today):
            url = DOWNLOAD_URL.format(name=name, month=month)
            partial = folder / f"{name}.mmdb.part"
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "loader3d-geoip"})
                with (
                    urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response,
                    gzip.GzipFile(fileobj=response) as unpacked,
                    partial.open("wb") as out,
                ):
                    shutil.copyfileobj(unpacked, out, 1024 * 1024)
                Reader(partial).close()  # a whole, readable file before it replaces the old one
                os.replace(partial, target)
                fetched.append(f"{name} {month}")
                break
            except (OSError, ValueError, EOFError, DatabaseError) as exc:
                partial.unlink(missing_ok=True)
                logger.warning("GeoIP: %s: %s", url, exc)
    return fetched
