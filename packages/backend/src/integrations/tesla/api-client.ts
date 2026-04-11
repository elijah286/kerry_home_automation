// ---------------------------------------------------------------------------
// Tesla API client — uses Owner API with third-party refresh tokens
// (Same approach as Home Assistant Tesla Custom Integration / teslajsonpy)
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const AUTH_DOMAIN = 'https://auth.tesla.com';
const API_URL = 'https://owner-api.teslamotors.com';
const CLIENT_ID = 'ownerapi';

const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

export interface TeslaVehicleListItem {
  id: number;
  vehicle_id: number;
  vin: string;
  display_name: string;
  state: 'online' | 'asleep' | 'offline';
}

export interface TeslaVehicleData {
  vin: string;
  display_name: string;
  state: string;
  charge_state: {
    battery_level: number;
    battery_range: number;
    charge_limit_soc: number;
    charging_state: string;
    charge_rate: number;
  };
  climate_state: {
    inside_temp: number | null;
    outside_temp: number | null;
    is_climate_on: boolean;
    driver_temp_setting: number;
    passenger_temp_setting: number;
  };
  vehicle_state: {
    locked: boolean;
    rt: number;
    ft: number;
    sentry_mode: boolean;
    odometer: number;
    car_version: string;
  };
}

export interface TeslaEnergySiteListItem {
  energy_site_id: string;
  site_name: string;
  resource_type: string;
}

export interface TeslaEnergySiteLive {
  solar_power: number;
  battery_power: number;
  grid_power: number;
  load_power: number;
  percentage_charged: number;
  backup_reserve_percent: number;
  default_real_mode: string;
  storm_mode_active: boolean;
  grid_status: string;
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface TeslaApiClientOptions {
  entryId: string;
  refreshToken: string;
  /** Called when the refresh token rotates (single-use tokens) */
  onTokenRotated: (entryId: string, newRefreshToken: string) => Promise<void>;
}

export class TeslaApiClient {
  private tokens: Tokens | null = null;
  private refreshing: Promise<void> | null = null;
  private readonly log = logger.child({ module: 'tesla-api' });

  constructor(private readonly opts: TeslaApiClientOptions) {}

  // ---- Authentication -----------------------------------------------------

  async authenticate(): Promise<void> {
    await this.refreshAccessToken(this.opts.refreshToken);
  }

  private async ensureToken(): Promise<string> {
    if (this.tokens && Date.now() < this.tokens.expiresAt - 60_000) {
      return this.tokens.accessToken;
    }
    if (!this.refreshing) {
      this.refreshing = this.refreshAccessToken(
        this.tokens?.refreshToken ?? this.opts.refreshToken,
      ).finally(() => { this.refreshing = null; });
    }
    await this.refreshing;
    return this.tokens!.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<void> {
    // Same flow as teslajsonpy: POST to auth.tesla.com with client_id=ownerapi
    const res = await fetch(`${AUTH_DOMAIN}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        scope: 'openid email offline_access',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Tesla auth failed (${res.status}): ${body}`);
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    // Persist rotated refresh token (single-use)
    try {
      await this.opts.onTokenRotated(this.opts.entryId, data.refresh_token);
    } catch (err) {
      this.log.error({ err }, 'Failed to persist rotated refresh token');
    }

    this.log.info({ entryId: this.opts.entryId }, 'Tesla access token refreshed');
  }

  // ---- Generic request (Owner API) ----------------------------------------

  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Tesla API ${method} ${path} failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { response: T };
    return json.response;
  }

  // ---- Product list (returns both vehicles and energy sites) --------------

  /** Get all products — same as teslajsonpy PRODUCT_LIST endpoint */
  async getProducts(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/1/products');
  }

  /** Filter products to vehicles only */
  async getVehicles(): Promise<TeslaVehicleListItem[]> {
    const products = await this.getProducts();
    return products.filter((p: any) => 'vehicle_id' in p) as TeslaVehicleListItem[];
  }

  /** Filter products to energy sites only */
  async getEnergySites(): Promise<TeslaEnergySiteListItem[]> {
    const products = await this.getProducts();
    return products.filter((p: any) => 'energy_site_id' in p) as TeslaEnergySiteListItem[];
  }

  // ---- Vehicle endpoints --------------------------------------------------

  async getVehicleData(idOrVin: string | number): Promise<TeslaVehicleData | null> {
    try {
      return await this.request<TeslaVehicleData>(
        'GET',
        `/api/1/vehicles/${idOrVin}/vehicle_data?endpoints=${encodeURIComponent(
          'charge_state;climate_state;drive_state;vehicle_state;vehicle_config',
        )}`,
      );
    } catch (err) {
      this.log.warn({ err, idOrVin }, 'Failed to fetch vehicle data (vehicle may be asleep)');
      return null;
    }
  }

  async sendVehicleCommand(idOrVin: string | number, command: string, body?: object): Promise<void> {
    await this.request('POST', `/api/1/vehicles/${idOrVin}/command/${command}`, body);
  }

  // ---- Energy site endpoints ----------------------------------------------

  async getEnergySiteLiveStatus(siteId: string): Promise<TeslaEnergySiteLive | null> {
    try {
      return await this.request<TeslaEnergySiteLive>(
        'GET',
        `/api/1/energy_sites/${siteId}/live_status`,
      );
    } catch (err) {
      this.log.warn({ err, siteId }, 'Failed to fetch energy site live status');
      return null;
    }
  }

  async sendEnergySiteCommand(siteId: string, endpoint: string, body: object): Promise<void> {
    await this.request('POST', `/api/1/energy_sites/${siteId}/${endpoint}`, body);
  }
}
