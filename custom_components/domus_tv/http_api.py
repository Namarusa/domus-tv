"""REST endpoints polled by the Freebox Player app."""
from __future__ import annotations

import functools
import logging
import time
from datetime import timedelta
from http import HTTPStatus
from typing import Any

from aiohttp import web

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components.http import KEY_HASS_REFRESH_TOKEN_ID, KEY_HASS_USER, HomeAssistantView
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from .const import COMMON_ATTRIBUTES, DOMAIN, FORWARDED_ATTRIBUTES

_LOGGER = logging.getLogger(__name__)


@callback
def async_register_views(hass: HomeAssistant) -> None:
    for view in (PairStartView, PairPollView, LayoutView, StatesView, ActionView, HistoryView):
        hass.http.register_view(view(hass))


class _Base(HomeAssistantView):
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    def data(self):
        return self.hass.data.get(DOMAIN)

    def seen(self, request: web.Request) -> None:
        data = self.data()
        token_id = request.get(KEY_HASS_REFRESH_TOKEN_ID)
        if data is not None and token_id:
            data.last_seen[token_id] = time.time()


class PairStartView(_Base):
    """The Player asks for a code to display (no auth: it has no token yet)."""

    url = "/api/domus_tv/pair/start"
    name = "api:domus_tv:pair_start"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        try:
            body = await request.json() if request.can_read_body else {}
        except ValueError:
            body = {}
        result = data.start_pairing(str(body.get("name", "")) if isinstance(body, dict) else "")
        if result is None:
            return self.json_message("Too many pending pairings", HTTPStatus.TOO_MANY_REQUESTS)
        result["home"] = self.hass.config.location_name
        return self.json(result)


class PairPollView(_Base):
    """The Player waits for an admin to type the code in the panel."""

    url = "/api/domus_tv/pair/poll/{poll_id}"
    name = "api:domus_tv:pair_poll"
    requires_auth = False

    async def get(self, request: web.Request, poll_id: str) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        result = data.poll_pairing(poll_id)
        if result is False:
            return self.json_message("Unknown or expired pairing", HTTPStatus.NOT_FOUND)
        if result is None:
            return self.json({"status": "pending"}, HTTPStatus.ACCEPTED)
        return self.json({"status": "paired", **result})


class LayoutView(_Base):
    url = "/api/domus_tv/layout"
    name = "api:domus_tv:layout"

    async def get(self, request: web.Request) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        self.seen(request)
        return self.json({**data.layout(), "home": self.hass.config.location_name})


def _compact_state(state) -> dict[str, Any]:
    domain = state.domain
    attrs = {}
    for key in COMMON_ATTRIBUTES + FORWARDED_ATTRIBUTES.get(domain, ()):
        if key in state.attributes:
            attrs[key] = state.attributes[key]
    return {
        "s": state.state,
        "a": attrs,
        "c": int(state.last_changed.timestamp()),
    }


class StatesView(_Base):
    """States of the entities used on the dashboards only (small payload)."""

    url = "/api/domus_tv/states"
    name = "api:domus_tv:states"

    async def get(self, request: web.Request) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        self.seen(request)
        user = request[KEY_HASS_USER]
        states: dict[str, Any] = {}
        for entity_id in data.used_entities():
            if not user.is_admin and not user.permissions.check_entity(entity_id, POLICY_READ):
                continue
            state = self.hass.states.get(entity_id)
            states[entity_id] = _compact_state(state) if state else {"s": "unavailable", "a": {}, "c": 0}
        return self.json({"v": data.version, "t": int(time.time()), "states": states})


def _service_for(domain: str, action: str, value: Any, state) -> tuple[str, str, dict[str, Any]] | None:
    """Translate a remote-friendly action into a Home Assistant service call."""
    attrs = state.attributes if state else {}
    if action in ("toggle", "turn_on", "turn_off"):
        if domain in ("scene", "script") and action != "turn_off":
            return domain, "turn_on", {}
        if domain in ("button", "input_button"):
            return domain, "press", {}
        if domain == "lock":
            locked = state is not None and state.state == "locked"
            return domain, "unlock" if locked else "lock", {}
        if domain == "cover":
            return domain, "toggle", {}
        if domain == "automation" and action == "toggle":
            return domain, "toggle", {}
        if domain in ("light", "switch", "fan", "input_boolean", "automation", "climate",
                      "media_player", "humidifier", "siren", "vacuum", "group"):
            return domain, action, {}
        return None
    if action == "press":
        if domain in ("button", "input_button"):
            return domain, "press", {}
        if domain in ("scene", "script"):
            return domain, "turn_on", {}
        if domain == "automation":
            return domain, "trigger", {}
    if domain == "light" and action == "brightness_step":
        return domain, "turn_on", {"brightness_step_pct": max(-100, min(100, int(value)))}
    if domain == "light" and action == "brightness":
        return domain, "turn_on", {"brightness_pct": max(1, min(100, int(value)))}
    if domain == "fan" and action == "percentage":
        return domain, "set_percentage", {"percentage": max(0, min(100, int(value)))}
    if domain == "cover":
        if action in ("open", "close", "stop"):
            return domain, f"{action}_cover", {}
        if action == "position":
            return domain, "set_cover_position", {"position": max(0, min(100, int(value)))}
    if domain == "climate":
        if action == "temp_step":
            current = attrs.get("temperature")
            if current is None:
                return None
            step = float(attrs.get("target_temp_step") or 0.5)
            target = float(current) + (step if float(value) > 0 else -step)
            lo, hi = attrs.get("min_temp"), attrs.get("max_temp")
            if lo is not None:
                target = max(float(lo), target)
            if hi is not None:
                target = min(float(hi), target)
            return domain, "set_temperature", {"temperature": round(target, 1)}
        if action == "hvac_mode" and value in (attrs.get("hvac_modes") or []):
            return domain, "set_hvac_mode", {"hvac_mode": value}
    if domain == "lock" and action in ("lock", "unlock", "open"):
        return domain, action, {}
    if domain == "media_player" and action in (
        "media_play_pause", "media_next_track", "media_previous_track",
        "volume_up", "volume_down", "volume_mute",
    ):
        extra = {"is_volume_muted": not attrs.get("is_volume_muted")} if action == "volume_mute" else {}
        return domain, action, extra
    return None


class ActionView(_Base):
    """Run an action on an entity that is placed on a dashboard."""

    url = "/api/domus_tv/action"
    name = "api:domus_tv:action"

    async def post(self, request: web.Request) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        self.seen(request)
        try:
            body = await request.json()
            entity_id = str(body["entity"])
            action = str(body["action"])
        except (ValueError, KeyError, TypeError):
            return self.json_message("Expected {entity, action, value?}", HTTPStatus.BAD_REQUEST)

        if entity_id not in data.used_entities():
            return self.json_message("Entity not on a dashboard", HTTPStatus.FORBIDDEN)
        user = request[KEY_HASS_USER]
        if not user.is_admin and not user.permissions.check_entity(entity_id, POLICY_CONTROL):
            return self.json_message("Not allowed", HTTPStatus.FORBIDDEN)

        state = self.hass.states.get(entity_id)
        try:
            call = _service_for(entity_id.split(".", 1)[0], action, body.get("value"), state)
        except (TypeError, ValueError):
            call = None
        if call is None:
            return self.json_message("Unsupported action", HTTPStatus.BAD_REQUEST)
        domain, service, service_data = call
        try:
            await self.hass.services.async_call(
                domain, service, {"entity_id": entity_id, **service_data},
                blocking=True, context=Context(user_id=user.id),
            )
        except (HomeAssistantError, ValueError) as err:
            _LOGGER.warning("Domus TV action %s on %s failed: %s", action, entity_id, err)
            return self.json_message(str(err), HTTPStatus.BAD_REQUEST)
        new_state = self.hass.states.get(entity_id)
        return self.json({"ok": True, "state": _compact_state(new_state) if new_state else None})


HISTORY_HOURS = (1, 6, 24, 48, 168)
HISTORY_POINTS = 96


def _bucket(states, start, end, points):
    """Average numeric states per time bucket; carry the last value through gaps."""
    samples = []
    for st in states:
        try:
            samples.append((st.last_changed.timestamp(), float(st.state)))
        except (TypeError, ValueError):
            continue
    if not samples:
        return []
    t0, t1 = start.timestamp(), end.timestamp()
    width = (t1 - t0) / points
    out, i, last = [], 0, None
    # value in force at the start of the window
    while i < len(samples) and samples[i][0] <= t0:
        last = samples[i][1]
        i += 1
    for b in range(points):
        b_end = t0 + (b + 1) * width
        acc = []
        while i < len(samples) and samples[i][0] < b_end:
            acc.append(samples[i][1])
            last = samples[i][1]
            i += 1
        if acc:
            out.append(round(sum(acc) / len(acc), 3))
        else:
            out.append(last)
    return out


class HistoryView(_Base):
    """Down-sampled numeric history of one dashboard entity, for TV graphs."""

    url = "/api/domus_tv/history"
    name = "api:domus_tv:history"

    async def get(self, request: web.Request) -> web.Response:
        data = self.data()
        if data is None:
            return self.json_message("Domus TV not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        entity_id = request.query.get("entity", "")
        try:
            hours = int(request.query.get("hours", "24"))
        except ValueError:
            hours = 24
        if hours not in HISTORY_HOURS:
            hours = 24
        if entity_id not in data.used_entities():
            return self.json_message("Entity not on a dashboard", HTTPStatus.FORBIDDEN)
        user = request[KEY_HASS_USER]
        if not user.is_admin and not user.permissions.check_entity(entity_id, POLICY_READ):
            return self.json_message("Not allowed", HTTPStatus.FORBIDDEN)
        self.seen(request)
        if "recorder" not in self.hass.config.components:
            return self.json({"entity": entity_id, "hours": hours, "points": [], "recorder": False})

        from homeassistant.components.recorder import get_instance, history
        from homeassistant.util import dt as dt_util

        end = dt_util.utcnow()
        start = end - timedelta(hours=hours)
        result = await get_instance(self.hass).async_add_executor_job(
            functools.partial(
                history.state_changes_during_period, self.hass, start, end, entity_id,
                no_attributes=True, include_start_time_state=True,
            )
        )
        points = _bucket(result.get(entity_id, []), start, end, HISTORY_POINTS)
        values = [p for p in points if p is not None]
        state = self.hass.states.get(entity_id)
        return self.json({
            "entity": entity_id,
            "hours": hours,
            "points": points,
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "unit": state.attributes.get("unit_of_measurement") if state else None,
        })
