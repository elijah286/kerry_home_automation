// ---------------------------------------------------------------------------
// Ring cloud API client (unofficial, same approach as ring-client-api)
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const OAUTH_URL = 'https://oauth.ring.com/oauth/token';
const API_BASE = 'https://api.ring.com';
const TIMEOUT_MS = 5000;
const CLIENT_ID = 'ring_official_android';

export interface RingDeviceRaw {
  id: number;
  description: string;
  device_id: string;
  firmware_version: string;
  battery_life: string | number | null;
  features: Record<string, unknown>;
  alerts: { connection?: string };
  health: { firmware?: string };
}

export interface RingDevicesResponse {
  doorbots: RingDeviceRaw[];
  stickup_cams: RingDeviceRaw[];
  chimes: RingDeviceRaw[];
}

export interface RingHistoryEvent {
  id: number;
  kind: 'motion' | 'ding' | 'on_demand';
  created_at: string;
  answered: boolean;
}

export class RingClient {
  private accessToken: string | null = null;

  constructor(private refreshToken: string) {}

  async refreshAuth(): Promise<void> {
    const res = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: CLIENT_ID,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ring OAuth ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    this.accessToken = data.access_token;

    // Ring may rotate the refresh token
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    logger.debug('Ring: auth refreshed');
  }

  private async apiGet<T>(path: string): Promise<T> {
    if (!this.accessToken) throw new Error('Ring: not authenticated');

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ring API ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  private async apiPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.accessToken) throw new Error('Ring: not authenticated');

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ring API ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  async getDevices(): Promise<RingDevicesResponse> {
    return this.apiGet<RingDevicesResponse>('/clients_api/ring_devices');
  }

  async getHistory(deviceId: number, limit = 20): Promise<RingHistoryEvent[]> {
    return this.apiGet<RingHistoryEvent[]>(
      `/clients_api/doorbots/${deviceId}/history?limit=${limit}`,
    );
  }

  async getSnapshot(deviceId: number): Promise<Buffer | null> {
    try {
      // Request a new snapshot
      await this.apiPost(`/clients_api/snapshots/image/${deviceId}`, {});

      // Fetch the snapshot image
      if (!this.accessToken) return null;
      const res = await fetch(
        `${API_BASE}/clients_api/snapshots/image/${deviceId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );

      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err) {
      logger.warn({ err, deviceId }, 'Ring: snapshot fetch failed');
      return null;
    }
  }

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /** Returns true if last request got a 401 */
  isAuthError(err: unknown): boolean {
    return err instanceof Error && err.message.includes('Ring API 401');
  }
}
