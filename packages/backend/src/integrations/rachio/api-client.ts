// ---------------------------------------------------------------------------
// Rachio REST API client
// https://rachio.readme.io/reference
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const BASE_URL = 'https://api.rach.io/1/public';

export interface RachioZone {
  id: string;
  name: string;
  zoneNumber: number;
  enabled: boolean;
  imageUrl: string | null;
}

export interface RachioDevice {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  status: string; // ONLINE, OFFLINE
  zones: RachioZone[];
  scheduleModeType: string;
  on: boolean;
}

export interface RachioCurrentSchedule {
  status: string; // PROCESSING, IDLE
  zoneId: string | null;
  zoneName: string | null;
  startDate: number | null;
  duration: number | null;
  zoneStartDate: number | null;
  zoneDuration: number | null;
  remainingDuration: number | null;
  type: string;
}

export class RachioClient {
  constructor(private apiKey: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Rachio API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async getPersonId(): Promise<string> {
    const data = await this.request<{ id: string }>('GET', '/person/info');
    return data.id;
  }

  async getDevices(personId: string): Promise<RachioDevice[]> {
    const data = await this.request<{ id: string; devices: RachioDevice[] }>('GET', `/person/${personId}`);
    return data.devices ?? [];
  }

  async getCurrentSchedule(deviceId: string): Promise<RachioCurrentSchedule | null> {
    try {
      return await this.request<RachioCurrentSchedule>('GET', `/device/${deviceId}/current_schedule`);
    } catch {
      return null;
    }
  }

  async startZone(zoneId: string, durationSeconds: number): Promise<void> {
    await this.request('PUT', '/zone/start', { id: zoneId, duration: durationSeconds });
  }

  async stopWatering(deviceId: string): Promise<void> {
    await this.request('PUT', '/device/stop_water', { id: deviceId });
  }

  async standbyOn(deviceId: string): Promise<void> {
    await this.request('PUT', '/device/on', { id: deviceId });
  }

  async standbyOff(deviceId: string): Promise<void> {
    await this.request('PUT', '/device/off', { id: deviceId });
  }

  async rainDelay(deviceId: string, days: number): Promise<void> {
    await this.request('PUT', '/device/rain_delay', { id: deviceId, duration: days * 86400 });
  }
}
