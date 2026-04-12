// ---------------------------------------------------------------------------
// Tesla API client — uses Owner API with third-party refresh tokens
// (Same approach as Home Assistant Tesla Custom Integration / teslajsonpy)
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const AUTH_DOMAIN = 'https://auth.tesla.com';
const API_URL = 'https://owner-api.teslamotors.com';
const CLIENT_ID = 'ownerapi';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sub-endpoints for `GET /api/1/vehicles/{id}/vehicle_data?endpoints=...`
 * Matches teslajsonpy `VEHICLE_DATA` so Owner/third-party tokens receive the same
 * slices as Home Assistant's Tesla integration (including `location_data` for FW 2023.38+).
 *
 * Other authenticated vehicle URLs exist but are separate HTTP calls (not merged here):
 * `GET .../service_data`, `.../nearby_charging_sites`, `.../mobile_enabled`, `.../release_notes`,
 * `.../recent_alerts`, `POST .../wake_up`, `POST .../command/*`. Fleet-only or paid endpoints
 * (e.g. `specs`) are out of scope for this refresh-token Owner API client.
 */
export const TESLA_VEHICLE_DATA_ENDPOINTS =
  'charge_state;climate_state;drive_state;gui_settings;vehicle_config;vehicle_state;location_data';

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

export interface TeslaVehicleListItem {
  id: number;
  vehicle_id: number;
  /**
   * String form of `id` from the API — required for streaming tag matching and fleet vehicles
   * where `id` exceeds JS Number safe integer precision.
   */
  id_s?: string;
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
    usable_battery_level?: number;
    battery_range: number;
    est_battery_range?: number;
    ideal_battery_range?: number;
    charge_limit_soc: number;
    charging_state: string;
    charge_rate: number;
    charger_power: number;
    charger_voltage: number;
    charger_actual_current: number;
    charge_energy_added: number;
    time_to_full_charge: number;
    charge_port_door_open: boolean;
    scheduled_charging_start_time: number | null;
    preconditioning_enabled: boolean;
    charge_current_request?: number;
    conn_charge_cable?: string;
    fast_charger_present?: boolean;
    timestamp?: number;
  };
  climate_state: {
    inside_temp: number | null;
    outside_temp: number | null;
    is_climate_on: boolean;
    driver_temp_setting: number;
    passenger_temp_setting: number;
    seat_heater_left: number;
    seat_heater_right: number;
    steering_wheel_heater: boolean;
    defrost_mode: number;
    is_preconditioning?: boolean;
    fan_status?: number;
    battery_heater?: boolean;
    climate_keeper_mode?: string;
    timestamp?: number;
  };
  gui_settings?: {
    gui_24_hour_time?: boolean;
    gui_charge_rate_units?: string;
    gui_distance_units?: string;
    gui_range_display?: string;
    gui_temperature_units?: string;
    show_range_units?: boolean;
    timestamp?: number;
  };
  vehicle_config?: Record<string, unknown>;
  /**
   * Required for FW 2023.38+ location while parked; shape may include latitude/longitude
   * or fields nested by firmware region.
   */
  location_data?: Record<string, unknown>;
  drive_state: {
    latitude?: number | null;
    longitude?: number | null;
    /** Some firmware / fleet payloads expose corrected estimates here. */
    est_corrected_lat?: number | null;
    est_corrected_lng?: number | null;
    native_latitude?: number | null;
    native_longitude?: number | null;
    /** When 1/true, teslajsonpy prefers native_* coordinates over WGS84 lat/long. */
    native_location_supported?: number | boolean;
    /** GPS fix time (seconds in some payloads, ms in others — normalized in mapper). */
    gps_as_of?: number;
    heading?: number | null;
    speed: number | null;
    power: number | null;
    shift_state: string | null;
    timestamp: number;
  };
  vehicle_state: {
    locked: boolean;
    rt: number;
    ft: number;
    sentry_mode: boolean;
    odometer: number;
    car_version: string;
    is_user_present: boolean;
    fd_window: number;
    fp_window: number;
    rd_window: number;
    rp_window: number;
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
  grid_services_power: number;
  generator_power: number;
  percentage_charged: number;
  total_pack_energy: number;
  energy_left: number;
  backup_reserve_percent: number;
  default_real_mode: string;
  storm_mode_active: boolean;
  grid_status: string;
  backup_capable: boolean;
  grid_services_active: boolean;
  island_status: string;
  wall_connectors: {
    din: string;
    wall_connector_power: number;
    wall_connector_state: number;
    vin: string | null;
  }[];
  timestamp: string;
}

export interface TeslaEnergySiteInfo {
  site_name: string;
  battery_count: number;
  nameplate_power: number;
  nameplate_energy: number;
  installation_date: string;
  components: {
    battery: boolean;
    solar: boolean;
    grid: boolean;
    load_meter: boolean;
    market_type: string;
  };
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

  /** Current access token (refreshes if expired). Used by Owner streaming WebSocket. */
  async getAccessToken(): Promise<string> {
    return this.ensureToken();
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
    return products
      .filter((p: any) => 'vehicle_id' in p)
      .map((p: any) => ({
        id: p.id as number,
        vehicle_id: p.vehicle_id as number,
        vin: String(p.vin),
        display_name: String(p.display_name ?? ''),
        state: p.state as TeslaVehicleListItem['state'],
        id_s: typeof p.id_s === 'string' ? p.id_s : undefined,
      }));
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
          TESLA_VEHICLE_DATA_ENDPOINTS,
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

  async getEnergySiteInfo(siteId: string): Promise<TeslaEnergySiteInfo | null> {
    try {
      return await this.request<TeslaEnergySiteInfo>(
        'GET',
        `/api/1/energy_sites/${siteId}/site_info`,
      );
    } catch (err) {
      this.log.warn({ err, siteId }, 'Failed to fetch energy site info');
      return null;
    }
  }

  async sendEnergySiteCommand(siteId: string, endpoint: string, body: object): Promise<void> {
    await this.request('POST', `/api/1/energy_sites/${siteId}/${endpoint}`, body);
  }
}
