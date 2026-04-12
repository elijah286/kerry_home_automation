// ---------------------------------------------------------------------------
// Sense cloud API — authenticate + one-shot realtime sample via WebSocket
// ---------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

const API_URL = 'https://api.sense.com/apiservice/api/v1/';

function deviceId(): string {
  return randomBytes(16).toString('hex');
}

export interface SenseAuthResult {
  access_token: string;
  user_id: string;
  monitor_id: string;
  device_id: string;
}

export interface SenseRealtime {
  powerW: number;
  solarW: number;
  frequencyHz: number | null;
  voltage: number[] | null;
}

export async function senseAuthenticate(email: string, password: string): Promise<SenseAuthResult> {
  const id = deviceId();
  const res = await fetch(`${API_URL}authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-sense-device-id': id,
    },
    body: new URLSearchParams({ email, password }).toString(),
  });

  if (res.status === 401) {
    const j = (await res.json().catch(() => ({}))) as { error_reason?: string; mfa_token?: string };
    if (j.mfa_token) {
      throw new Error('Sense requires MFA — disable MFA on your Sense account or complete MFA in the Sense app.');
    }
    throw new Error(j.error_reason ?? 'Sense authentication failed');
  }

  if (!res.ok) {
    throw new Error(`Sense authenticate HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    user_id: string;
    monitors: { id: number }[];
  };

  const monitorId = data.monitors?.[0]?.id;
  if (monitorId == null) throw new Error('Sense: no monitors on account');

  return {
    access_token: data.access_token,
    user_id: String(data.user_id),
    monitor_id: String(monitorId),
    device_id: id,
  };
}

function extractRealtime(obj: unknown): SenseRealtime | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const payload = (o.payload && typeof o.payload === 'object' ? o.payload : o) as Record<string, unknown>;

  const w = typeof payload.w === 'number' ? payload.w : typeof o.w === 'number' ? o.w : null;
  if (w == null) return null;

  const solarW = typeof payload.solar_w === 'number' ? payload.solar_w : typeof o.solar_w === 'number' ? o.solar_w : 0;

  let voltage: number[] | null = null;
  const v = payload.voltage ?? o.voltage;
  if (Array.isArray(v)) {
    voltage = v.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    if (voltage.length === 0) voltage = null;
  }

  const hz = payload.hz ?? o.hz;
  const frequencyHz = typeof hz === 'number' ? hz : null;

  return {
    powerW: w,
    solarW: solarW ?? 0,
    frequencyHz,
    voltage,
  };
}

export async function senseRealtimeSnapshot(accessToken: string, monitorId: string): Promise<SenseRealtime> {
  const url = `wss://clientrt.sense.com/monitors/${monitorId}/realtimefeed?access_token=${encodeURIComponent(accessToken)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: 12000 });
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error('Sense realtime timeout'));
    }, 15000);

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(String(data)) as unknown;
        const snap = extractRealtime(parsed);
        if (snap) {
          clearTimeout(timer);
          ws.close();
          resolve(snap);
        }
      } catch {
        /* next message */
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
