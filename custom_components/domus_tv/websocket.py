"""Websocket commands used by the editor panel (admins only)."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    for handler in (ws_get, ws_save, ws_pair, ws_tv_list, ws_tv_revoke, ws_tv_rename):
        websocket_api.async_register_command(hass, handler)


def _data(hass: HomeAssistant):
    return hass.data.get(DOMAIN)


def _not_loaded(connection, msg) -> None:
    connection.send_error(msg["id"], "not_loaded", "Domus TV is not set up")


@websocket_api.websocket_command({vol.Required("type"): "domus_tv/config/get"})
@websocket_api.require_admin
@callback
def ws_get(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], data.layout())


@websocket_api.websocket_command(
    {vol.Required("type"): "domus_tv/config/save", vol.Required("dashboards"): list}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    try:
        version = await data.async_set_dashboards(msg["dashboards"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"version": version, "dashboards": data.data["dashboards"]})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "domus_tv/pair",
        vol.Required("code"): str,
        vol.Optional("name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_pair(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    try:
        tv = await data.async_confirm_pairing(msg["code"], connection.user, msg.get("name"))
    except ValueError:
        connection.send_error(msg["id"], "invalid_code", "Code inconnu ou expiré")
        return
    connection.send_result(msg["id"], {"id": tv["id"], "name": tv["name"]})


@websocket_api.websocket_command({vol.Required("type"): "domus_tv/tv/list"})
@websocket_api.require_admin
@callback
def ws_tv_list(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], data.tv_list())


@websocket_api.websocket_command(
    {vol.Required("type"): "domus_tv/tv/revoke", vol.Required("tv_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_tv_revoke(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], {"removed": await data.async_revoke(msg["tv_id"])})


@websocket_api.websocket_command(
    {vol.Required("type"): "domus_tv/tv/rename", vol.Required("tv_id"): str, vol.Required("name"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_tv_rename(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    if data is None:
        return _not_loaded(connection, msg)
    connection.send_result(msg["id"], {"ok": await data.async_rename(msg["tv_id"], msg["name"])})
