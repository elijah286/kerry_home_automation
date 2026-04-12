// ---------------------------------------------------------------------------
// Vizio SmartCast local API client
// Talks to Vizio TV via local HTTPS API on port 7345 (self-signed cert)
// ---------------------------------------------------------------------------

import { Agent } from 'node:https';
import { logger } from '../../logger.js';

const PORT = 7345;
const TIMEOUT_MS = 5000;

// Vizio TVs use self-signed certificates — ignore TLS errors for local API
const insecureAgent = new Agent({ rejectUnauthorized: false });

export interface VizioInputItem {
  name: string;
  hash: string;
}

export class SmartCastClient {
  private baseUrl: string;
  private authToken: string;

  constructor(host: string, authToken: string) {
    this.baseUrl = `https://${host}:${PORT}`;
    this.authToken = authToken;
  }

  // ---------------------------------------------------------------------------
  // Low-level request helper
  // ---------------------------------------------------------------------------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        AUTH: this.authToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // @ts-expect-error — Node fetch supports dispatcher/agent for HTTPS
      dispatcher: insecureAgent,
    });
    if (!res.ok) throw new Error(`Vizio API ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** Returns 0 (off) or 1 (on) */
  async getPowerState(): Promise<number> {
    const data = await this.request<{ ITEMS: { VALUE: number }[] }>(
      'GET',
      '/state/device/power_mode',
    );
    return data.ITEMS?.[0]?.VALUE ?? 0;
  }

  async getVolume(): Promise<{ value: number; hashval: number }> {
    const data = await this.request<{
      ITEMS: { VALUE: number; HASHVAL: number }[];
    }>('GET', '/menu_native/dynamic/tv_settings/audio/volume');
    const item = data.ITEMS?.[0];
    return { value: item?.VALUE ?? 0, hashval: item?.HASHVAL ?? 0 };
  }

  async getCurrentInput(): Promise<string> {
    const data = await this.request<{
      ITEMS: { VALUE: string; HASHVAL: number }[];
    }>('GET', '/menu_native/dynamic/tv_settings/devices/current_input');
    return data.ITEMS?.[0]?.VALUE ?? '';
  }

  async getInputList(): Promise<VizioInputItem[]> {
    const data = await this.request<{
      ITEMS: { NAME: string; VALUE: string; HASHVAL: string }[];
    }>('GET', '/menu_native/dynamic/tv_settings/devices/name_input');
    return (
      data.ITEMS?.map((item) => ({
        name: item.NAME ?? item.VALUE,
        hash: item.HASHVAL,
      })) ?? []
    );
  }

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  async setPower(on: boolean): Promise<void> {
    await this.request('PUT', '/key_command/', {
      KEYLIST: [{ CODESET: 11, CODE: on ? 1 : 0, ACTION: 'KEYPRESS' }],
    });
  }

  async setVolume(volume: number): Promise<void> {
    // Need the current hash value to modify
    const { hashval } = await this.getVolume();
    await this.request('PUT', '/menu_native/dynamic/tv_settings/audio/volume', {
      REQUEST: 'MODIFY',
      VALUE: volume,
      HASHVAL: hashval,
    });
  }

  async setInput(name: string): Promise<void> {
    // Get input list to find the hash for the desired input
    const inputs = await this.getInputList();
    const input = inputs.find((i) => i.name === name);
    const hashval = input?.hash ?? 0;
    await this.request('PUT', '/menu_native/dynamic/tv_settings/devices/current_input', {
      REQUEST: 'MODIFY',
      VALUE: name,
      HASHVAL: hashval,
    });
  }

  async sendKey(codeset: number, code: number): Promise<void> {
    await this.request('PUT', '/key_command/', {
      KEYLIST: [{ CODESET: codeset, CODE: code, ACTION: 'KEYPRESS' }],
    });
  }

  // Convenience: mute toggle (codeset 5, code 0)
  async toggleMute(): Promise<void> {
    await this.sendKey(5, 0);
  }

  // Convenience: volume up (codeset 5, code 1)
  async volumeUp(): Promise<void> {
    await this.sendKey(5, 1);
  }

  // Convenience: volume down (codeset 5, code 2)
  async volumeDown(): Promise<void> {
    await this.sendKey(5, 2);
  }
}
