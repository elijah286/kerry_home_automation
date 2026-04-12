// ---------------------------------------------------------------------------
// Meross local HTTP API client
// Communicates with Meross devices on LAN via signed HTTP requests
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { logger } from '../../logger.js';

interface MerossPayload {
  header: {
    messageId: string;
    method: string;
    from: string;
    namespace: string;
    timestamp: number;
    sign: string;
    payloadVersion: number;
  };
  payload: Record<string, unknown>;
}

export interface MerossGarageState {
  open: boolean;
  opening: boolean;
  closing: boolean;
}

export interface MerossSensorData {
  temperature: number | null;
  humidity: number | null;
  lastMotion: number | null;
}

export class MerossClient {
  constructor(
    private host: string,
    private key: string,
  ) {}

  private sign(messageId: string, timestamp: number): string {
    const signStr = messageId + this.key + String(timestamp);
    return createHash('md5').update(signStr).digest('hex');
  }

  private buildPayload(method: string, namespace: string, payload: Record<string, unknown> = {}): MerossPayload {
    const messageId = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      header: {
        messageId,
        method,
        from: `http://${this.host}/config`,
        namespace,
        timestamp,
        sign: this.sign(messageId, timestamp),
        payloadVersion: 1,
      },
      payload,
    };
  }

  private async request(method: string, namespace: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const body = this.buildPayload(method, namespace, payload);
    const res = await fetch(`http://${this.host}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Meross ${res.status}: ${res.statusText}`);
    const data = (await res.json()) as MerossPayload;
    return data.payload;
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
    return this.request('GET', 'Appliance.System.All');
  }

  async getGarageState(): Promise<MerossGarageState> {
    try {
      const payload = await this.request('GET', 'Appliance.GarageDoor.State');
      const state = (payload as { state?: { open?: number; channel?: number }[] })?.state?.[0];
      return {
        open: state?.open === 1,
        opening: false,
        closing: false,
      };
    } catch {
      return { open: false, opening: false, closing: false };
    }
  }

  async toggleGarage(open: boolean): Promise<void> {
    await this.request('SET', 'Appliance.GarageDoor.State', {
      state: { channel: 0, open: open ? 1 : 0, uuid: '' },
    });
  }

  async getSensorData(): Promise<MerossSensorData> {
    try {
      const payload = await this.request('GET', 'Appliance.System.All');
      const digest = (payload as { all?: { digest?: { triggerx?: { lmTime?: number }[]; sensor?: { temperature?: { currentTemperature?: number }; humidity?: { currentHumidity?: number } } } } })?.all?.digest;
      return {
        temperature: digest?.sensor?.temperature?.currentTemperature ?? null,
        humidity: digest?.sensor?.humidity?.currentHumidity ?? null,
        lastMotion: digest?.triggerx?.[0]?.lmTime ?? null,
      };
    } catch {
      return { temperature: null, humidity: null, lastMotion: null };
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.getSystemInfo();
      return true;
    } catch {
      return false;
    }
  }
}
