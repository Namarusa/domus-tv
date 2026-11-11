"""Storage, validation and pairing state for Domus TV."""
from __future__ import annotations

import inspect
import re
import secrets
import time
from datetime import timedelta
from typing import Any

from homeassistant.auth.models import TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN, User
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    PAIR_CODE_TTL,
    PAIR_MAX_PENDING,
    STORAGE_KEY,
    STORAGE_VERSION,
    TILE_TYPES,
    TOKEN_LIFETIME_DAYS,
)

ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
MAX_DASHBOARDS = 30
MAX_TILES = 200
MAX_GRID = 40
GRAPH_HOURS = (0, 6, 24, 48, 168)
MAX_LINKS = 4


def _default_data() -> dict[str, Any]:
    return {
        "version": 1,
        "dashboards": [
            {"id": "home", "title": "Maison", "columns": 6, "tiles": []},
        ],
        "tvs": [],
    }


class DomusData:
    """Holds the dashboards, the paired Players and pending pairings."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.data: dict[str, Any] = _default_data()
        self.pending: dict[str, dict[str, Any]] = {}  # code -> pairing
        self.last_seen: dict[str, float] = {}  # refresh_token_id -> epoch

    # ------------------------------------------------------------------ load/save
    async def async_load(self) -> None:
        stored = await self.store.async_load()
        if stored:
            self.data = {**_default_data(), **stored}

    async def async_save(self) -> None:
        await self.store.async_save(self.data)

    @property
    def tvs(self) -> list[dict[str, Any]]:
        return self.data["tvs"]

    @property
    def version(self) -> int:
        return int(self.data.get("version", 1))

    def layout(self) -> dict[str, Any]:
        return {"version": self.version, "dashboards": self.data["dashboards"]}

    async def async_set_dashboards(self, dashboards: Any) -> int:
        self.data["dashboards"] = validate_dashboards(dashboards)
        self.data["version"] = self.version + 1
        await self.async_save()
        return self.version

    def used_entities(self) -> set[str]:
        used: set[str] = set()
        for dash in self.data["dashboards"]:
            for tile in dash["tiles"]:
                if tile.get("entity"):
                    used.add(tile["entity"])
                used.update(tile.get("links") or [])
        return used

    # ------------------------------------------------------------------ pairing
    def _purge(self) -> None:
        now = time.monotonic()
        for code in [c for c, p in self.pending.items() if p["expires"] < now]:
            del self.pending[code]

    def start_pairing(self, device_name: str) -> dict[str, Any] | None:
        """Called by a Player: returns the code to display and a poll secret."""
        self._purge()
        if len(self.pending) >= PAIR_MAX_PENDING:
            return None
        code = f"{secrets.randbelow(1_000_000):06d}"
        while code in self.pending:
            code = f"{secrets.randbelow(1_000_000):06d}"
        poll_id = secrets.token_urlsafe(24)
        self.pending[code] = {
            "poll_id": poll_id,
            "name": (device_name or "Freebox Player").strip()[:40],
            "expires": time.monotonic() + PAIR_CODE_TTL,
            "result": None,
        }
        return {"code": code, "poll_id": poll_id, "expires_in": PAIR_CODE_TTL}

    async def async_confirm_pairing(self, code: str, user: User, name: str | None) -> dict[str, Any]:
        """Called from the panel by an admin who typed the code shown on the TV."""
        self._purge()
        code = re.sub(r"\D", "", code or "")
        pairing = self.pending.get(code)
        if pairing is None or pairing["result"] is not None:
            raise ValueError("invalid_code")

        tv_id = secrets.token_hex(4)
        tv_name = (name or pairing["name"]).strip()[:40] or "Freebox Player"
        refresh_token = await self.hass.auth.async_create_refresh_token(
            user,
            client_name=f"Domus TV – {tv_name} ({tv_id})",
            token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN,
            access_token_expiration=timedelta(days=TOKEN_LIFETIME_DAYS),
        )
        access_token = self.hass.auth.async_create_access_token(refresh_token)
        tv = {
            "id": tv_id,
            "name": tv_name,
            "user_id": user.id,
            "refresh_token_id": refresh_token.id,
            "created": int(time.time()),
        }
        self.tvs.append(tv)
        await self.async_save()
        pairing["result"] = {"token": access_token, "tv_id": tv_id, "name": tv_name}
        pairing["expires"] = time.monotonic() + 120  # TV has 2 min to collect it
        return tv

    def poll_pairing(self, poll_id: str) -> dict[str, Any] | None | bool:
        """Returns the token once confirmed, None if pending, False if unknown."""
        self._purge()
        for code, pairing in self.pending.items():
            if secrets.compare_digest(pairing["poll_id"], poll_id):
                if pairing["result"] is None:
                    return None
                del self.pending[code]
                return pairing["result"]
        return False

    async def async_revoke(self, tv_id: str) -> bool:
        tv = next((t for t in self.tvs if t["id"] == tv_id), None)
        if tv is None:
            return False
        token = self.hass.auth.async_get_refresh_token(tv["refresh_token_id"])
        if token is not None:
            result = self.hass.auth.async_remove_refresh_token(token)
            if inspect.isawaitable(result):
                await result
        self.tvs.remove(tv)
        await self.async_save()
        return True

    async def async_rename(self, tv_id: str, name: str) -> bool:
        tv = next((t for t in self.tvs if t["id"] == tv_id), None)
        if tv is None:
            return False
        tv["name"] = name.strip()[:40] or tv["name"]
        await self.async_save()
        return True

    def tv_list(self) -> list[dict[str, Any]]:
        out = []
        for tv in self.tvs:
            token = self.hass.auth.async_get_refresh_token(tv["refresh_token_id"])
            out.append({
                "id": tv["id"],
                "name": tv["name"],
                "created": tv["created"],
                "last_seen": self.last_seen.get(tv["refresh_token_id"]),
                "valid": token is not None,
            })
        return out


# ---------------------------------------------------------------------- validation
def _int(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _str(value: Any, limit: int = 60) -> str:
    return str(value).strip()[:limit] if value is not None else ""


def _links(value: Any, own: str) -> list[str]:
    """Up to MAX_LINKS other entities shown as action buttons on a tile."""
    out: list[str] = []
    if isinstance(value, list):
        for item in value:
            eid = _str(item, 255)
            if eid and ENTITY_RE.match(eid) and eid != own and eid not in out:
                out.append(eid)
            if len(out) >= MAX_LINKS:
                break
    return out


def validate_dashboards(dashboards: Any) -> list[dict[str, Any]]:
    """Normalise what the editor sends; drop anything unexpected."""
    if not isinstance(dashboards, list) or not dashboards:
        raise ValueError("dashboards must be a non-empty list")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for dash in dashboards[:MAX_DASHBOARDS]:
        if not isinstance(dash, dict):
            continue
        dash_id = _str(dash.get("id"), 40)
        if not ID_RE.match(dash_id) or dash_id in seen:
            dash_id = secrets.token_hex(4)
        seen.add(dash_id)
        columns = _int(dash.get("columns"), 3, 8, 6)
        tiles = []
        for tile in (dash.get("tiles") or [])[:MAX_TILES]:
            if not isinstance(tile, dict):
                continue
            ttype = tile.get("type") if tile.get("type") in TILE_TYPES else "auto"
            entity = _str(tile.get("entity"), 255)
            if entity and not ENTITY_RE.match(entity):
                entity = ""
            if ttype != "header" and not entity:
                continue
            w = _int(tile.get("w"), 1, columns, 1)
            tiles.append({
                "id": _str(tile.get("id"), 40) or secrets.token_hex(4),
                "type": ttype,
                "entity": entity,
                "name": _str(tile.get("name")),
                "icon": _str(tile.get("icon"), 80),
                "color": _str(tile.get("color"), 9),
                "x": _int(tile.get("x"), 0, columns - w, 0),
                "y": _int(tile.get("y"), 0, MAX_GRID, 0),
                "w": w,
                "h": 1 if ttype == "header" else _int(tile.get("h"), 1, 4, 1),
                "graph": _int(tile.get("graph"), 0, 168, 0) if _int(tile.get("graph"), 0, 168, 0) in GRAPH_HOURS else 0,
                "links": _links(tile.get("links"), entity),
            })
        out.append({
            "id": dash_id,
            "title": _str(dash.get("title"), 30) or "Dashboard",
            "icon": _str(dash.get("icon"), 80),
            "columns": columns,
            "tiles": tiles,
        })
    if not out:
        raise ValueError("no valid dashboard")
    return out
