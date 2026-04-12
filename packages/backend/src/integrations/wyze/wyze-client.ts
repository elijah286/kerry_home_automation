// ---------------------------------------------------------------------------
// Wyze cloud API client
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';

const AUTH_URL = 'https://auth-prod.api.wyze.com/api/user/login';
const API_BASE = 'https://api.wyzecam.com/app/v2';
const TIMEOUT_MS = 5000;

export interface WyzeDeviceRaw {
  mac: string;
  nickname: string;
  product_type: string;
  product_model: string;
  device_params: Record<string, unknown>;
}

export class WyzeClient {
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private phoneId: string;

  constructor(
    private email: string,
    private password: string,
    private keyId: string,
    private apiKey: string,
  ) {
    this.phoneId = randomUUID();
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Keyid': this.keyId,
      'Apikey': this.apiKey,
      'Phone-Id': this.phoneId,
    };
    if (this.accessToken) h['Access-Token'] = this.accessToken;
    return h;
  }

  async login(): Promise<void> {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Keyid': this.keyId, 'Apikey': this.apiKey },
      body: JSON.stringify({
        email: this.email,
        password: this.password,
        key_id: this.keyId,
        api_key: this.apiKey,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Wyze auth failed: ${res.status}`);
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token) throw new Error('Wyze auth: no access_token in response');

    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? null;
    logger.info('Wyze: authenticated');
  }

  async refreshToken(): Promise<void> {
    if (!this.refreshTokenValue) {
      await this.login();
      return;
    }

    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Keyid': this.keyId, 'Apikey': this.apiKey },
      body: JSON.stringify({ refresh_token: this.refreshTokenValue }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn('Wyze: refresh failed, re-authenticating');
      await this.login();
      return;
    }

    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (data.access_token) this.accessToken = data.access_token;
    if (data.refresh_token) this.refreshTokenValue = data.refresh_token;
  }

  async getDeviceList(): Promise<WyzeDeviceRaw[]> {
    const res = await fetch(`${API_BASE}/home_page/get_object_list`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) throw Object.assign(new Error('Wyze: 401 unauthorized'), { status: 401 });
    if (!res.ok) throw new Error(`Wyze getDeviceList: ${res.status}`);

    const body = (await res.json()) as { data?: { device_list?: WyzeDeviceRaw[] } };
    return body.data?.device_list ?? [];
  }

  async getDeviceInfo(mac: string, model: string): Promise<Record<string, unknown>> {
    const url = new URL(`${API_BASE}/device/get_device_info`);
    url.searchParams.set('device_mac', mac);
    url.searchParams.set('device_model', model);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) throw Object.assign(new Error('Wyze: 401 unauthorized'), { status: 401 });
    if (!res.ok) throw new Error(`Wyze getDeviceInfo: ${res.status}`);

    const body = (await res.json()) as { data?: Record<string, unknown> };
    return body.data ?? {};
  }

  async runAction(mac: string, model: string, actionKey: string, actionParams: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API_BASE}/device/run_action`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        device_mac: mac,
        device_model: model,
        action_key: actionKey,
        action_params: actionParams,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) throw Object.assign(new Error('Wyze: 401 unauthorized'), { status: 401 });
    if (!res.ok) throw new Error(`Wyze runAction: ${res.status}`);
  }
}
