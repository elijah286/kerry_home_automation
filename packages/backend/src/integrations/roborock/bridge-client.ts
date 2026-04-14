// ---------------------------------------------------------------------------
// HTTP client for the Python roborock-bridge service (cloud login + hybrid path)
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
      `Cannot reach roborock-bridge at ${base} (${msg}). Ensure Python deps in services/roborock-bridge (venv + pip install -r requirements.txt), or set ROBOROCK_BRIDGE_URL to a running bridge.`,
    );
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function bridgeRequestCode(email: string): Promise<void> {
  const res = await bridgeFetch('/v1/request-code', { email: email.trim() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string | string[]; error?: string };
    const detail = err.detail;
    const detailStr = Array.isArray(detail) ? detail.map((d) => String(d)).join('; ') : String(detail ?? '');
    throw new Error(detailStr || err.error || res.statusText);
  }
}

export async function bridgeLogin(email: string, code: string): Promise<{ session_b64: string; devices: BridgeDevice[] }> {
  const res = await bridgeFetch('/v1/login', { email: email.trim(), code: code.trim() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<{ session_b64: string; devices: BridgeDevice[] }>;
}

export async function bridgeListDevices(sessionB64: string): Promise<BridgeDevice[]> {
  const res = await bridgeFetch('/v1/devices', { session_b64: sessionB64 });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  const data = (await res.json()) as { devices: BridgeDevice[] };
  return data.devices ?? [];
}

export async function bridgeStatus(
  sessionB64: string,
  duid: string,
  cachedHost?: string,
): Promise<BridgeStatusResult> {
  const res = await bridgeFetch('/v1/status', {
    session_b64: sessionB64,
    duid,
    cached_host: cachedHost ?? null,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    log.warn({ duid, detail: err.detail }, 'Roborock bridge status failed');
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<BridgeStatusResult>;
}

export async function bridgeCommand(
  sessionB64: string,
  duid: string,
  action: string,
  opts?: { fanSpeed?: number; cachedHost?: string },
): Promise<void> {
  log.info(
    { duid: duid.slice(0, 12), action, cachedHost: opts?.cachedHost ?? null },
    'Roborock bridge: sending vacuum command',
  );
  const res = await bridgeFetch('/v1/command', {
    session_b64: sessionB64,
    duid,
    cached_host: opts?.cachedHost ?? null,
    action,
    fan_speed: opts?.fanSpeed,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? res.statusText);
  }
  const out = (await res.json().catch(() => ({}))) as { transport?: string; local_ip?: string | null };
  log.info(
    {
      duid: duid.slice(0, 12),
      action,
      transport: out.transport ?? '?',
      localIp: out.local_ip ?? null,
    },
    'Roborock bridge: vacuum command succeeded',
  );
}

export interface BridgeMapResult {
  transport: string;
  local_ip: string | null;
  png: Buffer | null;
}

export async function bridgeMap(
  sessionB64: string,
  duid: string,
  cachedHost?: string,
): Promise<BridgeMapResult> {
  const res = await bridgeFetch(
    '/v1/map',
    {
      session_b64: sessionB64,
      duid,
      cached_host: cachedHost ?? null,
    },
    55_000,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    log.warn({ duid, detail: err.detail }, 'Roborock bridge map failed');
    throw new Error(err.detail ?? res.statusText);
  }
  const data = (await res.json()) as {
    transport: string;
    local_ip: string | null;
    map_png_b64: string | null;
  };
  const png =
    data.map_png_b64 && data.map_png_b64.length > 0
      ? Buffer.from(data.map_png_b64, 'base64')
      : null;
  return { transport: data.transport, local_ip: data.local_ip, png };
}
