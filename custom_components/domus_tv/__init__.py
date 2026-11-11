"""Domus TV: design Home Assistant dashboards for the Freebox Player app.

The integration provides:
* a sidebar panel (admin only) to design TV dashboards and pair Players;
* durable storage of the dashboards in .storage/domus_tv;
* a pairing flow so the Player never needs a typed token;
* light REST endpoints the Player polls (layout + states of used entities).
"""
from __future__ import annotations

import inspect
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_COMPONENT, PANEL_URL, STATIC_URL
from .http_api import async_register_views
from .store import DomusData
from .websocket import async_register_commands

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Domus TV from the config entry."""
    data = DomusData(hass)
    await data.async_load()
    hass.data[DOMAIN] = data

    # Views, websocket commands and static paths cannot be unregistered:
    # register them once per Home Assistant run.
    if not hass.data.get(f"{DOMAIN}_registered"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
        )
        async_register_views(hass)
        async_register_commands(hass)
        hass.data[f"{DOMAIN}_registered"] = True

    version = await hass.async_add_executor_job(_frontend_version)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_COMPONENT,
        sidebar_title="Domus TV",
        sidebar_icon="mdi:television-guide",
        module_url=f"{STATIC_URL}/panel.js?v={version}",
        require_admin=True,
        config={},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the panel; stored dashboards are kept."""
    frontend.async_remove_panel(hass, PANEL_URL)
    hass.data.pop(DOMAIN, None)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Integration deleted: revoke Player tokens and drop the storage."""
    data = DomusData(hass)
    await data.async_load()
    for tv in list(data.tvs):
        token = hass.auth.async_get_refresh_token(tv["refresh_token_id"])
        if token is not None:
            result = hass.auth.async_remove_refresh_token(token)
            if inspect.isawaitable(result):
                await result
    await data.store.async_remove()


def _frontend_version() -> str:
    """Cache-buster for the panel module: newest file mtime."""
    return str(int(max(p.stat().st_mtime for p in FRONTEND_DIR.iterdir())))
