// ---------------------------------------------------------------------------
// HTTP client for the Python roborock-bridge v2 (session-based DeviceManager)
// ---------------------------------------------------------------------------

import type { RoborockStatus } from './miio-client.js';
import { logger } from '../../logger.js';
import { roborockBridgeSettings } from '../../config.js';

const log = logger.child({ integration: 'roborock' });

export interface BridgeDevice {
  duid: string;
  name: string;
}

export interface BridgeStatusResult {
  transport: string;
  local_ip: string | null;
  status: RoborockStatus | null;
}

export interface BridgeConsumables {
  main_brush_work_time: number | null;
  side_brush_work_time: number | null;
  filter_work_time: number | null;
  sensor_dirty_time: number | null;
  strainer_work_times?: number | null;
  dust_collection_work_times?: number | null;
  cleaning_brush_work_times?: number | null;
}

export interface BridgeCleanSummary {
  clean_time: number | null;
  clean_area: number | null;
  clean_count: number | null;
  dust_collection_count?: number | null;
}

export interface BridgeRoom {
  id: number;
  name: string;
  center_x?: number | null;
  center_y?: number | null;
}

export interface BridgeCommandOptions {
  fanSpeed?: number;
  consumable?: string;
  roomIds?: number[];
  mopMode?: string | number;
  mopIntensity?: string | number;
  dndEnabled?: boolean;
  childLock?: boolean;
  volume?: number;
  zones?: number[][];
  target?: [number, number];
}

function bridgeHeaders(): Record<string, string> {
  const secret = roborockBridgeSettings.secret;
  return {
    'Content-Type': 'application/json',
    'X-Roborock-Bridge-Token': secret,
  };
}

export function isRoborockBridgeConfigured(): boolean {
  return Boolean(roborockBridgeSettings.baseUrl.trim() && roborockBridgeSettings.secret.trim());
}

async function bridgeFetch(path: string, body: unknown, timeoutMs?: number): Promise<Response> {
  const base = roborockBridgeSettings.baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
  try {
    return await fetch(`${base}${path}`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg === 'The operation was aborted') {
      throw new Error('Roborock bridge request timed out');
    }
    throw new Error(
      `Cannot reach roborock-bridge at ${base} (${msg}). Ensure the bridge service is running.`,
    );
  } finally {
    if (t) clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Login flow (unchanged API shape)
// ---------------------------------------------------------------------------

export async function bridgeRequestCode(email: string): Promise<void> {
  const res = await bridgeFetch('/v1/request-code', { email: email.trim() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string | string[]; error?: string };
    const detail = err.detail;
    const detailStr = Array.isArray(detail) ? detail.map((d) => String(d)).join('; ') : String(detail ?? '');
    throw new Error(detailStr || err.error || res.statusText);
  }
}

export interface BridgeLoginResult {
  session_token: string;
  user_data: Record<string, unknown>;
  base_url: string | null;
  devices: BridgeDevice[];
}

export async function bridgeLogin(email: string, code: string): Promise<BridgeLoginResult> {
  const res = await bridgeFetch('/v1/login', { email: email.trim(), code: code.trim() }, 90_000);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<BridgeLoginResult>;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export interface BridgeConnectResult {
  session_token: string;
  devices: BridgeDevice[];
}

/** Establish or reconnect a session with stored user_data. */
export async function bridgeConnect(
  email: string,
  userData: Record<string, unknown>,
  baseUrl?: string | null,
): Promise<BridgeConnectResult> {
  const res = await bridgeFetch(
    '/v1/connect',
    { email, user_data: userData, base_url: baseUrl ?? null },
    90_000,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<BridgeConnectResult>;
}

/** Tear down a bridge session. */
export async function bridgeDisconnect(sessionToken: string): Promise<void> {
  try {
    await bridgeFetch('/v1/disconnect', { session_token: sessionToken }, 10_000);
  } catch {
    // Best-effort — bridge may already be gone
  }
}

// ---------------------------------------------------------------------------
// Device operations
// ---------------------------------------------------------------------------

export async function bridgeListDevices(sessionToken: string): Promise<BridgeDevice[]> {
  const res = await bridgeFetch('/v1/devices', { session_token: sessionToken });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  const data = (await res.json()) as { devices: BridgeDevice[] };
  return data.devices ?? [];
}

export async function bridgeStatus(
  sessionToken: string,
  duid: string,
): Promise<BridgeStatusResult> {
  const res = await bridgeFetch('/v1/status', {
    session_token: sessionToken,
    duid,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    log.warn({ duid, detail: err.detail }, 'Roborock bridge status failed');
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<BridgeStatusResult>;
}

export async function bridgeCommand(
  sessionToken: string,
  duid: string,
  action: string,
  opts?: BridgeCommandOptions,
): Promise<void> {
  log.info(
    { duid: duid.slice(0, 12), action },
    'Roborock bridge: sending vacuum command',
  );
  const res = await bridgeFetch('/v1/command', {
    session_token: sessionToken,
    duid,
    action,
    fan_speed: opts?.fanSpeed,
    consumable: opts?.consumable,
    room_ids: opts?.roomIds,
    mop_mode: opts?.mopMode,
    mop_intensity: opts?.mopIntensity,
    dnd_enabled: opts?.dndEnabled,
    child_lock: opts?.childLock,
    volume: opts?.volume,
    zones: opts?.zones,
    target: opts?.target,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  const out = (await res.json().catch(() => ({}))) as { transport?: string };
  log.info(
    { duid: duid.slice(0, 12), action, transport: out.transport ?? '?' },
    'Roborock bridge: vacuum command succeeded',
  );
}

export async function bridgeConsumables(
  sessionToken: string,
  duid: string,
): Promise<BridgeConsumables | null> {
  const res = await bridgeFetch('/v1/consumables', {
    session_token: sessionToken,
    duid,
  });
  if (!res.ok) {
    log.debug({ duid: duid.slice(0, 12), status: res.status }, 'Roborock: consumables fetch failed');
    return null;
  }
  return res.json() as Promise<BridgeConsumables>;
}

export async function bridgeCleanSummary(
  sessionToken: string,
  duid: string,
): Promise<BridgeCleanSummary | null> {
  const res = await bridgeFetch('/v1/clean-summary', {
    session_token: sessionToken,
    duid,
  });
  if (!res.ok) {
    log.debug({ duid: duid.slice(0, 12), status: res.status }, 'Roborock: clean summary fetch failed');
    return null;
  }
  return res.json() as Promise<BridgeCleanSummary>;
}

export async function bridgeRooms(
  sessionToken: string,
  duid: string,
): Promise<BridgeRoom[]> {
  const res = await bridgeFetch('/v1/rooms', {
    session_token: sessionToken,
    duid,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { rooms?: BridgeRoom[] };
  return data.rooms ?? [];
}

export async function bridgeRenderMap(
  mapBase64: string,
): Promise<Buffer | null> {
  const res = await bridgeFetch('/v1/render-map', { map_b64: mapBase64 }, 30_000);
  if (!res.ok) return null;
  const data = (await res.json()) as { map_png_b64: string | null };
  if (!data.map_png_b64) return null;
  return Buffer.from(data.map_png_b64, 'base64');
}

export interface BridgeMapResult {
  transport: string;
  local_ip: string | null;
  png: Buffer | null;
  rooms: BridgeRoom[];
}

export async function bridgeMap(
  sessionToken: string,
  duid: string,
): Promise<BridgeMapResult> {
  const res = await bridgeFetch(
    '/v1/map',
    { session_token: sessionToken, duid },
    55_000,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    log.warn({ duid, detail: err.detail }, 'Roborock bridge map failed');
    throw new Error(err.detail ?? res.statusText);
  }
  const data = (await res.json()) as {
    transport: string;
    map_png_b64: string | null;
    rooms?: BridgeRoom[];
  };
  const png =
    data.map_png_b64 && data.map_png_b64.length > 0
      ? Buffer.from(data.map_png_b64, 'base64')
      : null;
  return { transport: data.transport, local_ip: null, png, rooms: data.rooms ?? [] };
}
