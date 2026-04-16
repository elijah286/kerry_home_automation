"""Roborock bridge v2: DeviceManager-based vacuum control (python-roborock 5.x).

Maintains persistent DeviceManager sessions with automatic local/cloud failover.
The backend stores user_data as JSON and reconnects on startup via /v1/connect.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any, Optional

import aiohttp
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header
from pydantic import BaseModel, Field

from roborock import RoborockException
from roborock.data.containers import UserData
from roborock.devices.device_manager import DeviceManager, UserParams, create_device_manager
from roborock.roborock_typing import RoborockCommand
from roborock.web_api import RoborockApiClient

logging.basicConfig(level=logging.INFO)
# Reduce noise from internal library logging during polling
logging.getLogger("roborock").setLevel(logging.WARNING)
_LOGGER = logging.getLogger("roborock-bridge")

BRIDGE_SECRET = os.environ.get("ROBOROCK_BRIDGE_SECRET", "")

# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

SESSION_IDLE_TTL_SEC = 3600  # clean up unused sessions after 1 hour

@dataclass
class SessionState:
    token: str
    email: str
    manager: DeviceManager
    user_data_dict: dict[str, Any]
    base_url: str | None
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)

_sessions: dict[str, SessionState] = {}

# Login flow: ties email verification code to the same RoborockApiClient instance
_pending_login_clients: dict[str, tuple[RoborockApiClient, aiohttp.ClientSession, float]] = {}
_CODE_FLOW_TTL_SEC = 900


def _email_key(email: str) -> str:
    return email.strip().lower()


def _prune_stale_logins() -> None:
    now = time.time()
    dead = [k for k, (_, __, t0) in _pending_login_clients.items() if now - t0 > _CODE_FLOW_TTL_SEC]
    for k in dead:
        _, session, _ = _pending_login_clients.pop(k)
        asyncio.get_event_loop().create_task(_safe_close_session(session))


async def _safe_close_session(session: aiohttp.ClientSession) -> None:
    with suppress(Exception):
        await session.close()


def _prune_idle_sessions() -> None:
    now = time.time()
    dead = [t for t, s in _sessions.items() if now - s.last_used > SESSION_IDLE_TTL_SEC]
    for t in dead:
        s = _sessions.pop(t, None)
        if s:
            _LOGGER.info("Pruning idle session for %s", s.email.split("@")[0])
            asyncio.get_event_loop().create_task(_safe_close_manager(s.manager))


async def _safe_close_manager(mgr: DeviceManager) -> None:
    with suppress(Exception):
        await mgr.close()


def _get_session(token: str) -> SessionState:
    _prune_idle_sessions()
    s = _sessions.get(token)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found — call /v1/connect to re-establish")
    s.last_used = time.time()
    return s


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def require_secret(x_roborock_bridge_token: str = Header(..., alias="X-Roborock-Bridge-Token")) -> None:
    if not BRIDGE_SECRET or x_roborock_bridge_token != BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing bridge token")


app = FastAPI(title="Roborock Bridge v2")
secure = APIRouter(dependencies=[Depends(require_secret)])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RequestCodeBody(BaseModel):
    email: str = Field(..., min_length=3)

class LoginBody(BaseModel):
    email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=4)

class ConnectBody(BaseModel):
    email: str = Field(..., min_length=3)
    user_data: dict[str, Any]
    base_url: Optional[str] = None

class SessionBody(BaseModel):
    session_token: str = Field(..., min_length=1)

class SessionDuidBody(SessionBody):
    duid: str = Field(..., min_length=4)

class CommandBody(SessionDuidBody):
    action: str
    fan_speed: Optional[int] = None
    consumable: Optional[str] = None
    room_ids: Optional[list[int]] = None
    mop_mode: Optional[str] = None
    mop_intensity: Optional[str] = None
    dnd_enabled: Optional[bool] = None
    child_lock: Optional[bool] = None
    volume: Optional[int] = None
    zones: Optional[list[list[int]]] = None
    target: Optional[list[int]] = None


class RenderMapBody(BaseModel):
    """Render raw map bytes (base64) to PNG without needing a session."""
    map_b64: str = Field(..., min_length=16)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _device_list(mgr: DeviceManager) -> list[dict[str, str]]:
    """Return a simple serialisable list of devices from the manager."""
    try:
        devices = mgr.get_devices()
    except Exception:
        return []
    return [{"duid": d.duid, "name": d.name} for d in devices]


def _enum_value(v: Any) -> Any:
    if v is None:
        return None
    return v.value if hasattr(v, "value") else v


async def _get_device_status(device: Any, timeout: float = 25.0) -> dict[str, Any] | None:
    """Read vacuum status through the device's command interface."""
    try:
        raw = await asyncio.wait_for(
            device.send(RoborockCommand.GET_STATUS),
            timeout=timeout,
        )
    except Exception as e:
        _LOGGER.debug("GET_STATUS failed: %s", e)
        raw = None

    if raw is None:
        return None

    # The response may be a Status object, a dict, or a list
    d = _normalize_status(raw)
    if d is None:
        return None

    return {
        "battery": _safe_int(d, "battery", 0),
        "state": _safe_int(d, "state", 3),
        "fan_power": _safe_int(d, "fan_power", 102),
        "clean_area": _safe_int(d, "clean_area", 0),
        "clean_time": _safe_int(d, "clean_time", 0),
        "error_code": _safe_int(d, "error_code", 0),
        "msg_ver": _safe_int(d, "msg_ver", 1),
        "water_box_status": _safe_int_opt(d, "water_box_status"),
        "mop_attached": _safe_int_opt(d, "mop_attached"),
        "water_shortage_status": _safe_int_opt(d, "water_shortage_status"),
        "dock_error_status": _safe_int_opt(d, "dock_error_status"),
        "water_box_mode": _safe_int_opt(d, "water_box_mode"),
        "mop_mode": _safe_int_opt(d, "mop_mode"),
        "dnd_enabled": _safe_int_opt(d, "dnd_enabled"),
        "lock_status": _safe_int_opt(d, "lock_status"),
    }


def _safe_int_opt(d: dict, key: str) -> Optional[int]:
    """Like _safe_int, but returns None if the key is missing or unparseable."""
    v = d.get(key)
    if v is None:
        camel = key.replace("_", "")
        for k in d:
            if k.replace("_", "").lower() == camel.lower():
                v = d[k]
                break
    if v is None:
        return None
    v = _enum_value(v)
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _normalize_status(raw: Any) -> dict[str, Any] | None:
    """Convert various status response formats to a flat dict."""
    if raw is None:
        return None
    # Status object with attributes
    if hasattr(raw, "battery"):
        return {
            "battery": _enum_value(getattr(raw, "battery", 0)),
            "state": _enum_value(getattr(raw, "state", 3)),
            "fan_power": _enum_value(getattr(raw, "fan_power", 102)),
            "clean_area": _enum_value(getattr(raw, "clean_area", 0)),
            "clean_time": _enum_value(getattr(raw, "clean_time", 0)),
            "error_code": _enum_value(getattr(raw, "error_code", 0)),
            "msg_ver": _enum_value(getattr(raw, "msg_ver", 1)),
        }
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list) and len(raw) > 0:
        first = raw[0]
        if isinstance(first, dict):
            return first
        if hasattr(first, "battery"):
            return _normalize_status(first)
    return None


def _safe_int(d: dict, key: str, default: int = 0) -> int:
    v = d.get(key)
    if v is None:
        # Try camelCase variants
        camel = key.replace("_", "")
        for k in d:
            if k.replace("_", "").lower() == camel.lower():
                v = d[k]
                break
    if v is None:
        return default
    v = _enum_value(v)
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"ok": True, "active_sessions": len(_sessions)}


@secure.post("/v1/request-code")
async def request_code(body: RequestCodeBody):
    _prune_stale_logins()
    email = body.email.strip()
    try:
        http_session = aiohttp.ClientSession()
        api = RoborockApiClient(username=email, session=http_session)
        # Use v4 endpoint (matches what HA uses)
        try:
            await api.request_code_v4()
        except AttributeError:
            # Fallback for older library builds that might not have v4
            await api.request_code()
    except RoborockException as e:
        await _safe_close_session(http_session)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        await _safe_close_session(http_session)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}") from e

    _pending_login_clients[_email_key(email)] = (api, http_session, time.time())
    return {"ok": True}


@secure.post("/v1/login")
async def login(body: LoginBody):
    _prune_stale_logins()
    email = body.email.strip()
    key = _email_key(email)
    entry = _pending_login_clients.get(key)
    if not entry:
        raise HTTPException(
            status_code=400,
            detail="No active verification for this email. Click 'Send verification code' again.",
        )
    api, http_session, t0 = entry
    if time.time() - t0 > _CODE_FLOW_TTL_SEC:
        del _pending_login_clients[key]
        await _safe_close_session(http_session)
        raise HTTPException(status_code=400, detail="Verification expired. Send a new code.")

    try:
        # Use v4 login (matches HA)
        try:
            user_data = await api.code_login_v4(body.code.strip())
        except AttributeError:
            user_data = await api.code_login(body.code.strip())

        # Get the base URL for faster future connections
        base_url: str | None = None
        try:
            base_url = await api.base_url
        except Exception:
            pass

        user_data_dict = user_data.as_dict()
    except RoborockException as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        _pending_login_clients.pop(key, None)
        await _safe_close_session(http_session)

    # Create a DeviceManager session
    session_token, devices = await _create_session(email, user_data_dict, base_url)

    return {
        "session_token": session_token,
        "user_data": user_data_dict,
        "base_url": base_url,
        "devices": devices,
    }


@secure.post("/v1/connect")
async def connect(body: ConnectBody):
    """Reconnect using stored user_data (called on backend startup)."""
    email = body.email.strip()

    # Check if we already have a session for this email
    for s in _sessions.values():
        if _email_key(s.email) == _email_key(email):
            s.last_used = time.time()
            devices = _device_list(s.manager)
            _LOGGER.info("Reusing existing session for %s (%d devices)", email.split("@")[0], len(devices))
            return {"session_token": s.token, "devices": devices}

    session_token, devices = await _create_session(email, body.user_data, body.base_url)
    return {"session_token": session_token, "devices": devices}


async def _create_session(email: str, user_data_dict: dict[str, Any], base_url: str | None) -> tuple[str, list[dict]]:
    """Create a DeviceManager and register a session. Returns (token, devices)."""
    try:
        user_data = UserData.from_dict(user_data_dict)
    except Exception:
        try:
            user_data = UserData(**user_data_dict)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot reconstruct UserData: {e}") from e

    params = UserParams(username=email, user_data=user_data, base_url=base_url)

    try:
        manager = await asyncio.wait_for(
            create_device_manager(params, prefer_cache=False),
            timeout=60.0,
        )
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Timed out connecting to Roborock cloud") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=f"Roborock cloud error: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create device manager: {e}") from e

    token = str(uuid.uuid4())
    devices = _device_list(manager)

    _sessions[token] = SessionState(
        token=token,
        email=email,
        manager=manager,
        user_data_dict=user_data_dict,
        base_url=base_url,
    )

    _LOGGER.info(
        "Session created for %s: %d devices, token=%s…",
        email.split("@")[0],
        len(devices),
        token[:8],
    )
    return token, devices


@secure.post("/v1/disconnect")
async def disconnect(body: SessionBody):
    """Tear down a session (called on backend stop)."""
    s = _sessions.pop(body.session_token, None)
    if s:
        await _safe_close_manager(s.manager)
    return {"ok": True}


@secure.post("/v1/devices")
async def list_devices(body: SessionBody):
    s = _get_session(body.session_token)
    return {"devices": _device_list(s.manager)}


@secure.post("/v1/status")
async def vacuum_status(body: SessionDuidBody):
    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")

    is_local = getattr(device, "is_local_connected", False)

    try:
        status = await _get_device_status(device, timeout=25.0)
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Vacuum status timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    _LOGGER.debug(
        "status duid=%s… is_local=%s battery=%s state=%s",
        body.duid[:12],
        is_local,
        status.get("battery") if status else None,
        status.get("state") if status else None,
    )

    return {
        "transport": "local" if is_local else "cloud",
        "local_ip": None,  # DeviceManager handles routing internally
        "status": status,
    }


def _safe_get_cmd(name: str) -> Any:
    """Look up a RoborockCommand by name, tolerating library version differences."""
    return getattr(RoborockCommand, name, None)


CONSUMABLE_RESET_MAP = {
    "main_brush": "main_brush_work_time",
    "side_brush": "side_brush_work_time",
    "filter": "filter_work_time",
    "sensor": "sensor_dirty_time",
}


@secure.post("/v1/command")
async def vacuum_command(body: CommandBody):
    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")

    action = body.action
    _LOGGER.info("COMMAND %s duid=%s…", action, body.duid[:12])

    try:
        cmd_map = {
            "stop": RoborockCommand.APP_STOP,
            "pause": RoborockCommand.APP_PAUSE,
            "return_dock": RoborockCommand.APP_CHARGE,
            "find": RoborockCommand.FIND_ME,
        }
        if action == "set_fan_speed":
            speed = body.fan_speed if body.fan_speed is not None else 102
            await asyncio.wait_for(
                device.send(RoborockCommand.SET_CUSTOM_MODE, [speed]),
                timeout=20.0,
            )
        elif action == "start":
            try:
                await asyncio.wait_for(device.send(RoborockCommand.APP_START), timeout=20.0)
            except (RoborockException, Exception) as e:
                _LOGGER.info("app_start failed, retrying with use_new_map: %s", e)
                await asyncio.wait_for(
                    device.send(RoborockCommand.APP_START, [{"use_new_map": 1}]),
                    timeout=20.0,
                )
        elif action == "reset_consumable":
            reset_cmd = _safe_get_cmd("RESET_CONSUMABLE")
            if reset_cmd is None:
                raise HTTPException(status_code=501, detail="reset_consumable not supported by this python-roborock build")
            key = CONSUMABLE_RESET_MAP.get(body.consumable or "")
            if not key:
                raise HTTPException(status_code=400, detail=f"Unknown consumable: {body.consumable}")
            await asyncio.wait_for(device.send(reset_cmd, [key]), timeout=20.0)
        elif action == "segment_clean":
            seg_cmd = _safe_get_cmd("APP_SEGMENT_CLEAN")
            if seg_cmd is None:
                raise HTTPException(status_code=501, detail="segment_clean not supported")
            if not body.room_ids:
                raise HTTPException(status_code=400, detail="room_ids required")
            await asyncio.wait_for(device.send(seg_cmd, body.room_ids), timeout=20.0)
        elif action == "zone_clean":
            zone_cmd = _safe_get_cmd("APP_ZONED_CLEAN")
            if zone_cmd is None:
                raise HTTPException(status_code=501, detail="zone_clean not supported")
            if not body.zones:
                raise HTTPException(status_code=400, detail="zones required")
            await asyncio.wait_for(device.send(zone_cmd, body.zones), timeout=20.0)
        elif action == "goto_target":
            goto_cmd = _safe_get_cmd("APP_GOTO_TARGET")
            if goto_cmd is None:
                raise HTTPException(status_code=501, detail="goto_target not supported")
            if not body.target or len(body.target) != 2:
                raise HTTPException(status_code=400, detail="target must be [x, y]")
            await asyncio.wait_for(device.send(goto_cmd, list(body.target)), timeout=20.0)
        elif action == "set_mop_mode":
            mop_cmd = _safe_get_cmd("SET_MOP_MODE")
            if mop_cmd is None:
                raise HTTPException(status_code=501, detail="set_mop_mode not supported")
            mode = body.mop_mode
            if mode is None:
                raise HTTPException(status_code=400, detail="mop_mode required")
            # Accept either int or name
            param: Any
            try:
                param = int(mode)
            except (TypeError, ValueError):
                param = mode
            await asyncio.wait_for(device.send(mop_cmd, [param]), timeout=20.0)
        elif action == "set_mop_intensity":
            intensity_cmd = _safe_get_cmd("SET_WATER_BOX_CUSTOM_MODE")
            if intensity_cmd is None:
                raise HTTPException(status_code=501, detail="set_mop_intensity not supported")
            val = body.mop_intensity
            if val is None:
                raise HTTPException(status_code=400, detail="mop_intensity required")
            try:
                param = int(val)
            except (TypeError, ValueError):
                param = val
            await asyncio.wait_for(device.send(intensity_cmd, [param]), timeout=20.0)
        elif action == "set_dnd":
            if body.dnd_enabled:
                dnd_set = _safe_get_cmd("SET_DND_TIMER")
                if dnd_set is None:
                    raise HTTPException(status_code=501, detail="set_dnd not supported")
                # Default DND window 22:00–08:00 when enabling without a caller-provided window
                await asyncio.wait_for(device.send(dnd_set, [22, 0, 8, 0]), timeout=20.0)
            else:
                dnd_close = _safe_get_cmd("CLOSE_DND_TIMER")
                if dnd_close is None:
                    raise HTTPException(status_code=501, detail="close_dnd not supported")
                await asyncio.wait_for(device.send(dnd_close), timeout=20.0)
        elif action == "set_child_lock":
            lock_cmd = _safe_get_cmd("SET_CHILD_LOCK_STATUS")
            if lock_cmd is None:
                raise HTTPException(status_code=501, detail="set_child_lock not supported")
            await asyncio.wait_for(
                device.send(lock_cmd, [{"lock_status": 1 if body.child_lock else 0}]),
                timeout=20.0,
            )
        elif action == "set_volume":
            vol_cmd = _safe_get_cmd("CHANGE_SOUND_VOLUME")
            if vol_cmd is None:
                raise HTTPException(status_code=501, detail="set_volume not supported")
            if body.volume is None:
                raise HTTPException(status_code=400, detail="volume required")
            v = max(0, min(100, int(body.volume)))
            await asyncio.wait_for(device.send(vol_cmd, [v]), timeout=20.0)
        elif action == "start_dust_collection":
            dust_cmd = _safe_get_cmd("APP_START_COLLECT_DUST")
            if dust_cmd is None:
                raise HTTPException(status_code=501, detail="start_dust_collection not supported")
            await asyncio.wait_for(device.send(dust_cmd), timeout=20.0)
        elif action == "start_mop_wash":
            wash_cmd = _safe_get_cmd("APP_START_WASH")
            if wash_cmd is None:
                raise HTTPException(status_code=501, detail="start_mop_wash not supported")
            await asyncio.wait_for(device.send(wash_cmd), timeout=20.0)
        elif action == "stop_mop_wash":
            wash_stop = _safe_get_cmd("APP_STOP_WASH")
            if wash_stop is None:
                raise HTTPException(status_code=501, detail="stop_mop_wash not supported")
            await asyncio.wait_for(device.send(wash_stop), timeout=20.0)
        elif action in cmd_map:
            await asyncio.wait_for(device.send(cmd_map[action]), timeout=20.0)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Command timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    is_local = getattr(device, "is_local_connected", False)
    _LOGGER.info("COMMAND %s done duid=%s… transport=%s", action, body.duid[:12], "local" if is_local else "cloud")
    return {"ok": True, "transport": "local" if is_local else "cloud"}


@secure.post("/v1/map")
async def vacuum_map(body: SessionDuidBody):
    try:
        from map_render import raw_map_to_png
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Map rendering dependencies missing: {e}") from e

    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")

    try:
        raw = await asyncio.wait_for(
            device.send(RoborockCommand.GET_MAP_V1),
            timeout=45.0,
        )
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Map request timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    png = raw_map_to_png(raw)
    is_local = getattr(device, "is_local_connected", False)

    # Try to extract rooms from the parsed map segments
    rooms: list[dict[str, Any]] = []
    try:
        from map_render import extract_rooms_from_map
        rooms = extract_rooms_from_map(raw) or []
    except Exception:
        rooms = []

    if not png:
        return {
            "transport": "local" if is_local else "cloud",
            "map_png_b64": None,
            "rooms": rooms,
        }

    return {
        "transport": "local" if is_local else "cloud",
        "map_png_b64": base64.b64encode(png).decode("ascii"),
        "rooms": rooms,
    }


# ---------------------------------------------------------------------------
# Consumables / clean summary / rooms / render-map
# ---------------------------------------------------------------------------


def _to_plain_dict(raw: Any) -> dict[str, Any] | None:
    """Best-effort convert a python-roborock dataclass/list/dict to a flat dict."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list) and raw:
        first = raw[0]
        if isinstance(first, dict):
            return first
        raw = first
    if hasattr(raw, "as_dict"):
        try:
            d = raw.as_dict()
            if isinstance(d, dict):
                return d
        except Exception:
            pass
    if hasattr(raw, "__dict__"):
        # dataclass instance
        return {k: _enum_value(v) for k, v in vars(raw).items() if not k.startswith("_")}
    return None


@secure.post("/v1/consumables")
async def vacuum_consumables(body: SessionDuidBody):
    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")
    cmd = _safe_get_cmd("GET_CONSUMABLE")
    if cmd is None:
        raise HTTPException(status_code=501, detail="get_consumable not supported")
    try:
        raw = await asyncio.wait_for(device.send(cmd), timeout=25.0)
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Consumables request timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    d = _to_plain_dict(raw) or {}
    return {
        "main_brush_work_time": _safe_int_opt(d, "main_brush_work_time"),
        "side_brush_work_time": _safe_int_opt(d, "side_brush_work_time"),
        "filter_work_time": _safe_int_opt(d, "filter_work_time"),
        "sensor_dirty_time": _safe_int_opt(d, "sensor_dirty_time"),
        "strainer_work_times": _safe_int_opt(d, "strainer_work_times"),
        "dust_collection_work_times": _safe_int_opt(d, "dust_collection_work_times"),
        "cleaning_brush_work_times": _safe_int_opt(d, "cleaning_brush_work_times"),
    }


@secure.post("/v1/clean-summary")
async def vacuum_clean_summary(body: SessionDuidBody):
    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")
    cmd = _safe_get_cmd("GET_CLEAN_SUMMARY")
    if cmd is None:
        raise HTTPException(status_code=501, detail="get_clean_summary not supported")
    try:
        raw = await asyncio.wait_for(device.send(cmd), timeout=25.0)
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Clean summary request timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    # Library returns either a CleanSummary dataclass or list [total_time, total_area, total_count, [ids...]]
    d = _to_plain_dict(raw)
    if d is None and isinstance(raw, list) and len(raw) >= 3:
        return {
            "clean_time": _safe_int({"v": raw[0]}, "v"),
            "clean_area": _safe_int({"v": raw[1]}, "v"),
            "clean_count": _safe_int({"v": raw[2]}, "v"),
        }
    d = d or {}
    return {
        "clean_time": _safe_int_opt(d, "clean_time"),
        "clean_area": _safe_int_opt(d, "clean_area"),
        "clean_count": _safe_int_opt(d, "clean_count"),
        "dust_collection_count": _safe_int_opt(d, "dust_collection_count"),
    }


@secure.post("/v1/rooms")
async def vacuum_rooms(body: SessionDuidBody):
    s = _get_session(body.session_token)
    device = await s.manager.get_device(body.duid)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {body.duid} not found")
    cmd = _safe_get_cmd("GET_ROOM_MAPPING")
    if cmd is None:
        return {"rooms": []}
    try:
        raw = await asyncio.wait_for(device.send(cmd), timeout=25.0)
    except asyncio.TimeoutError:
        return {"rooms": []}
    except RoborockException:
        return {"rooms": []}

    rooms: list[dict[str, Any]] = []
    # Typical raw format is a list of [room_id, mapping_id] pairs
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, (list, tuple)) and len(item) >= 1:
                try:
                    rid = int(item[0])
                except (TypeError, ValueError):
                    continue
                name = f"Room {rid}"
                if len(item) >= 2 and item[1]:
                    name = str(item[1])
                rooms.append({"id": rid, "name": name})
    return {"rooms": rooms}


@secure.post("/v1/render-map")
async def render_map_endpoint(body: RenderMapBody):
    """Render raw map bytes to PNG (for the local miIO path)."""
    try:
        from map_render import raw_map_to_png
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Map rendering dependencies missing: {e}") from e
    try:
        raw = base64.b64decode(body.map_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid map_b64: {e}") from e
    png = raw_map_to_png(raw)
    if not png:
        return {"map_png_b64": None}
    return {"map_png_b64": base64.b64encode(png).decode("ascii")}


app.include_router(secure)
