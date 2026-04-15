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
  opts?: { fanSpeed?: number },
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

export interface BridgeMapResult {
  transport: string;
  local_ip: string | null;
  png: Buffer | null;
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
  };
  const png =
    data.map_png_b64 && data.map_png_b64.length > 0
      ? Buffer.from(data.map_png_b64, 'base64')
      : null;
  return { transport: data.transport, local_ip: null, png };
}
