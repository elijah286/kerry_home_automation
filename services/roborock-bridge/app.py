"""Internal Roborock bridge: Roborock-app login + hybrid local / MQTT vacuum control (python-roborock)."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import pickle
import time
from contextlib import asynccontextmanager
from typing import Any, Optional, Union

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header
from pydantic import BaseModel, Field

from roborock import RoborockException
from roborock.api import RoborockApiClient
from roborock.cloud_api import RoborockMqttClient
from roborock.containers import DeviceData, HomeDataDevice, LoginData
from roborock.local_api import RoborockLocalClient
from roborock.roborock_typing import RoborockCommand

logging.basicConfig(level=logging.INFO)
_LOGGER = logging.getLogger("roborock-bridge")

BRIDGE_SECRET = os.environ.get("ROBOROCK_BRIDGE_SECRET", "")

# Roborock ties the emailed code to the same API client session (header_clientid includes a per-client
# random id). request_code and code_login must use the same RoborockApiClient instance.
_pending_login_clients: dict[str, tuple[RoborockApiClient, float]] = {}
_CODE_FLOW_TTL_SEC = 900


def _email_flow_key(email: str) -> str:
    return email.strip().lower()


def _prune_stale_login_clients() -> None:
    now = time.time()
    dead = [k for k, (_, t0) in _pending_login_clients.items() if now - t0 > _CODE_FLOW_TTL_SEC]
    for k in dead:
        del _pending_login_clients[k]


def require_secret(x_roborock_bridge_token: str = Header(..., alias="X-Roborock-Bridge-Token")) -> None:
    if not BRIDGE_SECRET or x_roborock_bridge_token != BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing bridge token")


app = FastAPI(title="Roborock Bridge")
secure = APIRouter(dependencies=[Depends(require_secret)])


class RequestCodeBody(BaseModel):
    email: str = Field(..., min_length=3)


class LoginBody(BaseModel):
    email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=4)


class SessionBody(BaseModel):
    session_b64: str = Field(..., min_length=8)


class SessionDuidBody(SessionBody):
    duid: str = Field(..., min_length=4)
    cached_host: Optional[str] = None


class CommandBody(SessionDuidBody):
    action: str
    fan_speed: Optional[int] = None


def _decode_session(session_b64: str) -> LoginData:
    try:
        raw = base64.b64decode(session_b64, validate=True)
        data = pickle.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid session: {e}") from e
    if not isinstance(data, LoginData):
        raise HTTPException(status_code=400, detail="Invalid session payload")
    if data.home_data is None:
        raise HTTPException(status_code=400, detail="Session missing home data; log in again")
    return data


def _resolve_device(login: LoginData, duid: str) -> tuple[HomeDataDevice, str]:
    assert login.home_data is not None
    devices = login.home_data.get_all_devices()
    device = next((d for d in devices if d.duid == duid), None)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {duid} not found on account")
    model = next(
        (p.model for p in (login.home_data.products or []) if p.id == device.product_id),
        None,
    )
    if not model:
        raise HTTPException(status_code=400, detail=f"Could not resolve model for device {duid}")
    return device, model


def _enum_value(v: Any) -> Any:
    if v is None:
        return None
    return v.value if hasattr(v, "value") else v


def _status_to_plain(st: Any) -> dict[str, Any]:
    state = _enum_value(getattr(st, "state", None))
    err = _enum_value(getattr(st, "error_code", None)) or 0
    fan = _enum_value(getattr(st, "fan_power", None)) or 102
    return {
        "battery": getattr(st, "battery", None) or 0,
        "state": int(state) if state is not None else 3,
        "fan_power": int(fan) if fan is not None else 102,
        "clean_area": getattr(st, "clean_area", None) or 0,
        "clean_time": getattr(st, "clean_time", None) or 0,
        "error_code": int(err) if err is not None else 0,
        "msg_ver": getattr(st, "msg_ver", None) or 1,
    }


async def _try_open_local(device: HomeDataDevice, model: str, host: str) -> Optional[RoborockLocalClient]:
    """TCP :58867 with device local_key — no cloud hop when this succeeds."""
    h = (host or "").strip()
    if not h:
        return None
    local: Optional[RoborockLocalClient] = None
    try:
        local = RoborockLocalClient(DeviceData(device=device, model=model, host=h))
        await asyncio.wait_for(local.async_connect(), timeout=12.0)
        return local
    except Exception as e:
        _LOGGER.debug("Roborock: local %s:58867 not reachable (%s); will try MQTT if needed", h, e)
        if local is not None:
            try:
                await local.async_disconnect()
            except Exception:
                pass
        return None


@asynccontextmanager
async def _hybrid_client(login: LoginData, duid: str, cached_host: Optional[str]):
    """Prefer LAN TCP :58867 first when we have a cached IP; else MQTT, discover IP, then try local again."""
    device, model = _resolve_device(login, duid)
    mqtt: RoborockMqttClient | None = None
    local: RoborockLocalClient | None = None
    transport = "mqtt"
    local_ip: Optional[str] = (cached_host.strip() if cached_host and str(cached_host).strip() else None)

    try:
        # 1) Local-first: skip MQTT entirely when cached IP works (fastest, works offline from cloud for control)
        if local_ip:
            local = await _try_open_local(device, model, local_ip)
            if local is not None:
                transport = "local"
                _LOGGER.debug("Roborock: using LOCAL TCP for duid=%s… host=%s", duid[:10], local_ip)
                yield local, transport, local_ip
                return

        local = None
        _LOGGER.debug("Roborock: opening MQTT (duid=%s…) to discover IP or use cloud", duid[:10])
        mqtt = RoborockMqttClient(login.user_data, DeviceData(device=device, model=model))
        await mqtt.async_connect()

        if not local_ip:
            try:
                net = await asyncio.wait_for(mqtt.get_networking(), timeout=22.0)
                if net and getattr(net, "ip", None):
                    local_ip = net.ip
                    _LOGGER.debug("Roborock: discovered vacuum LAN IP %s via MQTT", local_ip)
            except Exception:
                _LOGGER.debug("get_networking failed; staying on MQTT", exc_info=True)

        if local_ip:
            loc2 = await _try_open_local(device, model, local_ip)
            if loc2 is not None:
                try:
                    await mqtt.async_disconnect()
                except Exception:
                    pass
                mqtt = None
                local = loc2
                transport = "local"
                client: Union[RoborockLocalClient, RoborockMqttClient] = local
                _LOGGER.debug("Roborock: switched to LOCAL TCP at %s", local_ip)
            else:
                client = mqtt
                _LOGGER.debug("Roborock: using MQTT (local fallback to %s failed)", local_ip)
        else:
            client = mqtt
            _LOGGER.debug("Roborock: using MQTT (no LAN IP yet)")

        yield client, transport, local_ip
    finally:
        for c in (local, mqtt):
            if c is not None:
                try:
                    await c.async_disconnect()
                except Exception:
                    pass


@app.get("/health")
async def health():
    return {"ok": True}


@secure.post("/v1/request-code")
async def request_code(body: RequestCodeBody):
    _prune_stale_login_clients()
    email = body.email.strip()
    try:
        api = RoborockApiClient(username=email)
        await api.request_code()
    except RoborockException as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    _pending_login_clients[_email_flow_key(email)] = (api, time.time())
    return {"ok": True}


@secure.post("/v1/login")
async def login(body: LoginBody):
    _prune_stale_login_clients()
    email = body.email.strip()
    key = _email_flow_key(email)
    entry = _pending_login_clients.get(key)
    if not entry:
        raise HTTPException(
            status_code=400,
            detail=(
                "No active verification for this email on this bridge (or the bridge restarted). "
                "Click 'Send verification code' again, then enter the new code without waiting too long."
            ),
        )
    api, t0 = entry
    if time.time() - t0 > _CODE_FLOW_TTL_SEC:
        del _pending_login_clients[key]
        raise HTTPException(
            status_code=400,
            detail="Verification session expired. Send a new code and try again.",
        )
    try:
        user_data = await api.code_login(body.code.strip())
        home_data = await api.get_home_data(user_data)
        login_data = LoginData(user_data=user_data, email=email, home_data=home_data)
        blob = base64.b64encode(pickle.dumps(login_data)).decode("ascii")
    except RoborockException as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    _pending_login_clients.pop(key, None)
    devices = [
        {"duid": d.duid, "name": d.name}
        for d in home_data.get_all_devices()
    ]
    return {"session_b64": blob, "devices": devices}


@secure.post("/v1/devices")
async def list_devices(body: SessionBody):
    login = _decode_session(body.session_b64)
    assert login.home_data is not None
    return {
        "devices": [{"duid": d.duid, "name": d.name} for d in login.home_data.get_all_devices()],
    }


@secure.post("/v1/status")
async def vacuum_status(body: SessionDuidBody):
    login = _decode_session(body.session_b64)
    _LOGGER.debug(
        "GET status duid=%s… cached_host=%s",
        body.duid[:12],
        body.cached_host or "(none)",
    )
    try:
        async with _hybrid_client(login, body.duid, body.cached_host) as (client, transport, local_ip):
            st = await asyncio.wait_for(client.get_status(), timeout=25.0)
            if st is None:
                _LOGGER.warning("Roborock: get_status returned None (duid=%s… transport=%s)", body.duid[:12], transport)
                return {"transport": transport, "local_ip": local_ip, "status": None}
            plain = _status_to_plain(st)
            _LOGGER.debug(
                "GET status ok duid=%s… transport=%s battery=%s state=%s",
                body.duid[:12],
                transport,
                plain.get("battery"),
                plain.get("state"),
            )
            return {"transport": transport, "local_ip": local_ip, "status": plain}
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Roborock command timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@secure.post("/v1/command")
async def vacuum_command(body: CommandBody):
    login = _decode_session(body.session_b64)
    action = body.action
    _LOGGER.info(
        "COMMAND %s duid=%s… cached_host=%s (starting)",
        action,
        body.duid[:12],
        body.cached_host or "(none)",
    )
    try:
        async with _hybrid_client(login, body.duid, body.cached_host) as (client, transport, local_ip):
            cmd_map = {
                "start": RoborockCommand.APP_START,
                "stop": RoborockCommand.APP_STOP,
                "pause": RoborockCommand.APP_PAUSE,
                "return_dock": RoborockCommand.APP_CHARGE,
                "find": RoborockCommand.FIND_ME,
            }
            if action == "set_fan_speed":
                speed = body.fan_speed if body.fan_speed is not None else 102
                await client.send_command(RoborockCommand.SET_CUSTOM_MODE, [speed])
            elif action in cmd_map:
                await client.send_command(cmd_map[action])
            else:
                raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
            _LOGGER.info(
                "COMMAND %s done duid=%s… transport=%s local_ip=%s",
                action,
                body.duid[:12],
                transport,
                local_ip,
            )
            return {"ok": True, "transport": transport, "local_ip": local_ip}
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Roborock command timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


async def _fetch_map_raw(client: Union[RoborockMqttClient, RoborockLocalClient]) -> Any:
    if isinstance(client, RoborockMqttClient):
        return await client.get_map_v1()
    return await client.send_command(RoborockCommand.GET_MAP_V1)


@secure.post("/v1/map")
async def vacuum_map(body: SessionDuidBody):
    try:
        from map_render import raw_map_to_png
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Map rendering dependencies missing (pip install -r requirements.txt in services/roborock-bridge): {e}",
        ) from e
    login = _decode_session(body.session_b64)
    try:
        async with _hybrid_client(login, body.duid, body.cached_host) as (client, transport, local_ip):
            raw = await asyncio.wait_for(_fetch_map_raw(client), timeout=45.0)
            png = raw_map_to_png(raw)
            if not png:
                return {"transport": transport, "local_ip": local_ip, "map_png_b64": None}
            return {
                "transport": transport,
                "local_ip": local_ip,
                "map_png_b64": base64.b64encode(png).decode("ascii"),
            }
    except asyncio.TimeoutError as e:
        raise HTTPException(status_code=504, detail="Roborock map request timed out") from e
    except RoborockException as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


app.include_router(secure)
