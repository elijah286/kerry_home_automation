// ---------------------------------------------------------------------------
// Tesla API response → DeviceState mappers
// ---------------------------------------------------------------------------

import type { VehicleState, EnergySiteState, VehicleSleepState, EnergySiteOperationMode, WallConnectorState } from '@ha/shared';
import type { TeslaVehicleData, TeslaVehicleListItem, TeslaEnergySiteLive, TeslaEnergySiteInfo } from './api-client.js';
import { parseOptionCodes } from './option-codes.js';

const now = () => Date.now();

/** Build a VehicleState from full vehicle_data response */
export function mapVehicleData(
  entryId: string,
  vehicle: TeslaVehicleListItem,
  data: TeslaVehicleData,
  /** When the API omits GPS (common while parked or on some FW paths), keep last known fix for the map. */
  previous?: VehicleState | null,
): VehicleState {
  const cs = data.charge_state;
  const cl = data.climate_state;
  const vs = data.vehicle_state;
  const ds = data.drive_state;
  const gui = data.gui_settings;
  const resolved = resolveVehicleCoords(data);
  const latitude =
    resolved.latitude ??
    (typeof previous?.latitude === 'number' && Number.isFinite(previous.latitude) ? previous.latitude : null);
  const longitude =
    resolved.longitude ??
    (typeof previous?.longitude === 'number' && Number.isFinite(previous.longitude) ? previous.longitude : null);

  return {
    type: 'vehicle',
    id: `tesla.${entryId}.vehicle.${vehicle.vin}`,
    name: vehicle.display_name || `Tesla ${vehicle.vin.slice(-4)}`,
    integration: 'tesla',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    vin: vehicle.vin,
    sleepState: 'online',
    locked: vs.locked,
    latitude,
    longitude,
    insideTemp: cl.inside_temp,
    outsideTemp: cl.outside_temp,
    climateOn: cl.is_climate_on,
    driverTempSetting: cl.driver_temp_setting,
    passengerTempSetting: cl.passenger_temp_setting,
    batteryLevel: cs.battery_level,
    usableBatteryLevel: typeof cs.usable_battery_level === 'number' ? cs.usable_battery_level : cs.battery_level,
    batteryRange: Math.round(cs.battery_range),
    chargeLimitSoc: cs.charge_limit_soc,
    chargeState: mapChargeState(cs.charging_state),
    chargeRate: cs.charge_rate,
    chargerPower: cs.charger_power ?? 0,
    chargerVoltage: cs.charger_voltage ?? null,
    chargerActualCurrent: cs.charger_actual_current ?? null,
    chargeEnergyAdded: cs.charge_energy_added ?? 0,
    timeToFullCharge: cs.time_to_full_charge ?? 0,
    chargePortOpen: cs.charge_port_door_open ?? false,
    scheduledChargingStartTime: cs.scheduled_charging_start_time
      ? new Date(cs.scheduled_charging_start_time * 1000).toISOString()
      : null,
    preconditioningEnabled: cs.preconditioning_enabled ?? false,
    trunkOpen: vs.rt !== 0,
    frunkOpen: vs.ft !== 0,
    sentryMode: vs.sentry_mode,
    isUserPresent: vs.is_user_present ?? false,
    windowsOpen: (vs.fd_window ?? 0) !== 0 || (vs.fp_window ?? 0) !== 0
      || (vs.rd_window ?? 0) !== 0 || (vs.rp_window ?? 0) !== 0,
    odometer: Math.round(vs.odometer),
    softwareVersion: vs.car_version ?? '',
    speed: ds.speed ?? null,
    power: ds.power ?? null,
    heading: ds.heading ?? null,
    shiftState: ds.shift_state ?? null,
    seatHeaterLeft: cl.seat_heater_left ?? 0,
    seatHeaterRight: cl.seat_heater_right ?? 0,
    steeringWheelHeater: cl.steering_wheel_heater ?? false,
    defrostMode: cl.defrost_mode ?? 0,
    locationUpdatedAt: driveStateTimeMs(ds),
    guiDistanceUnits: gui?.gui_distance_units ?? null,
    guiTempUnits: gui?.gui_temperature_units ?? null,
    vehicleTelemetry: buildVehicleTelemetry(data),
    ...mapCompositorConfig(vehicle.vin, data.vehicle_config),
  };
}

/** Extract compositor-friendly fields from `vehicle_config`. Returns the
 *  sparse subset of VehicleState keys that relate to rendering the car. */
function mapCompositorConfig(
  vin: string,
  config: Record<string, unknown> | undefined,
): Pick<VehicleState, 'compositorModel' | 'optionCodes' | 'paintColor' | 'wheelName' | 'trimName'> {
  const raw = config?.option_codes;
  const resolved = parseOptionCodes(raw, vin);
  // The compositor also accepts a direct `car_type` field when present —
  // prefer it over our option-code inference because Tesla sometimes lists
  // the model there explicitly.
  const carType = typeof config?.car_type === 'string'
    ? (config.car_type as string).toLowerCase().replace(/\s+/g, '')
    : null;
  const model = carType && carType.startsWith('model')
    ? carType
    : resolved.model;
  return {
    compositorModel: model,
    optionCodes: resolved.optionCodes,
    paintColor: resolved.paintColor,
    wheelName: resolved.wheelName,
    trimName: resolved.trimName,
  };
}

/**
 * Merge Owner streaming `data:update` row (TeslaPy column order) into existing vehicle state.
 * Does not replace climate/charge detail — HTTP poll still fills those; streaming updates drive/GPS live.
 */
export function applyOwnerStreamingUpdate(
  entryId: string,
  vehicle: TeslaVehicleListItem,
  existing: VehicleState | undefined,
  row: Record<string, string | number | boolean | null>,
): VehicleState | null {
  if (!existing || existing.type !== 'vehicle') return null;

  const num = (key: string): number | null => parseFiniteCoord(row[key]);

  const estLat = num('est_lat');
  const estLng = num('est_lng');
  const latitude = estLat != null ? estLat : existing.latitude;
  const longitude = estLng != null ? estLng : existing.longitude;

  const speedVal = num('speed');
  const powerVal = num('power');
  const odom = num('odometer');
  const soc = num('soc');
  const estRange = num('est_range');
  const rangeIdeal = num('range');

  const shiftRaw = row.shift_state;
  const shiftState =
    shiftRaw != null && shiftRaw !== ''
      ? String(shiftRaw)
      : existing.shiftState;

  const headingVal = num('heading');
  const estHead = num('est_heading');
  const heading =
    headingVal != null ? headingVal : (estHead != null ? estHead : existing.heading);

  const tsRaw = num('timestamp');
  const locationUpdatedAt =
    tsRaw != null
      ? (tsRaw > 1e12 ? tsRaw : Math.round(tsRaw * 1000))
      : existing.locationUpdatedAt ?? null;

  const t = now();
  return {
    ...existing,
    sleepState: 'online',
    available: true,
    latitude,
    longitude,
    speed: speedVal != null ? speedVal : existing.speed,
    power: powerVal != null ? powerVal : existing.power,
    shiftState,
    heading,
    odometer: odom != null ? Math.round(odom) : existing.odometer,
    batteryLevel: soc != null ? Math.round(soc) : existing.batteryLevel,
    batteryRange:
      estRange != null
        ? Math.round(estRange)
        : (rangeIdeal != null ? Math.round(rangeIdeal) : existing.batteryRange),
    locationUpdatedAt: locationUpdatedAt ?? existing.locationUpdatedAt ?? null,
    lastUpdated: t,
    lastChanged: t,
  };
}

/** Build a minimal VehicleState for an asleep/offline vehicle (no data fetched) */
export function mapVehicleStub(
  entryId: string,
  vehicle: TeslaVehicleListItem,
  existing?: VehicleState,
): VehicleState {
  const base: VehicleState = existing ?? {
    type: 'vehicle',
    id: `tesla.${entryId}.vehicle.${vehicle.vin}`,
    name: vehicle.display_name || `Tesla ${vehicle.vin.slice(-4)}`,
    integration: 'tesla',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    vin: vehicle.vin,
    sleepState: vehicle.state as VehicleSleepState,
    locked: true,
    latitude: null,
    longitude: null,
    insideTemp: null,
    outsideTemp: null,
    climateOn: false,
    driverTempSetting: 20,
    passengerTempSetting: 20,
    batteryLevel: 0,
    batteryRange: 0,
    chargeLimitSoc: 80,
    chargeState: 'disconnected',
    chargeRate: 0,
    chargerPower: 0,
    chargerVoltage: null,
    chargerActualCurrent: null,
    chargeEnergyAdded: 0,
    timeToFullCharge: 0,
    chargePortOpen: false,
    scheduledChargingStartTime: null,
    preconditioningEnabled: false,
    trunkOpen: false,
    frunkOpen: false,
    sentryMode: false,
    isUserPresent: false,
    windowsOpen: false,
    odometer: 0,
    softwareVersion: '',
    speed: null,
    power: null,
    heading: null,
    shiftState: null,
    seatHeaterLeft: 0,
    seatHeaterRight: 0,
    steeringWheelHeater: false,
    defrostMode: 0,
  };

  return {
    ...base,
    sleepState: vehicle.state as VehicleSleepState,
    available: true,
    lastUpdated: now(),
  };
}

/** Build an EnergySiteState from live_status, optionally enriched with site_info */
export function mapEnergySiteLive(
  entryId: string,
  siteId: string,
  siteName: string,
  data: TeslaEnergySiteLive,
  siteInfo?: TeslaEnergySiteInfo | null,
): EnergySiteState {
  return {
    type: 'energy_site',
    id: `tesla.${entryId}.site.${siteId}`,
    name: siteName || 'Home Energy Gateway',
    integration: 'tesla',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    siteId,
    solarPower: Math.round(data.solar_power ?? 0),
    batteryPower: Math.round(data.battery_power ?? 0),
    gridPower: Math.round(data.grid_power ?? 0),
    loadPower: Math.round(data.load_power ?? 0),
    gridServicesPower: Math.round(data.grid_services_power ?? 0),
    generatorPower: Math.round(data.generator_power ?? 0),
    batteryPercentage: Math.round(data.percentage_charged ?? 0),
    totalPackEnergy: Math.round(data.total_pack_energy ?? 0),
    energyLeft: Math.round(data.energy_left ?? 0),
    backupReservePercent: data.backup_reserve_percent ?? 0,
    operationMode: mapOperationMode(data.default_real_mode),
    stormModeEnabled: data.storm_mode_active ?? false,
    gridStatus: data.grid_status === 'Active' || data.grid_status === 'SystemGridConnected'
      ? 'connected' : 'islanded',
    backupCapable: data.backup_capable ?? false,
    gridServicesActive: data.grid_services_active ?? false,
    batteryCount: siteInfo?.battery_count ?? 0,
    wallConnectors: (data.wall_connectors ?? []).map(mapWallConnector),
  };
}

function mapWallConnector(wc: TeslaEnergySiteLive['wall_connectors'][number]): WallConnectorState {
  return {
    din: wc.din,
    power: Math.round(wc.wall_connector_power ?? 0),
    state: wc.wall_connector_state ?? 0,
    vin: wc.vin ?? null,
  };
}

// ---- Helpers ----------------------------------------------------------------

/** Tesla JSON occasionally returns coordinates as strings; Fleet/enterprise payloads vary. */
function parseFiniteCoord(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    if (t === '') return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coalesceCoord(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = parseFiniteCoord(v);
    if (n != null) return n;
  }
  return null;
}

function asNumber(v: unknown): number | null {
  return parseFiniteCoord(v);
}

/** Normalize lat/lng from Tesla's `location_data` blob (varies by firmware/region). */
function coordsFromLocationData(loc: Record<string, unknown> | undefined): {
  latitude: number | null;
  longitude: number | null;
} {
  if (!loc) return { latitude: null, longitude: null };
  const lat = firstNumeric(
    asNumber(loc.latitude),
    asNumber(loc.lat),
    nestedNum(loc, 'Location', 'latitude'),
    nestedNum(loc, 'location', 'latitude'),
  );
  const lng = firstNumeric(
    asNumber(loc.longitude),
    asNumber(loc.lng),
    asNumber(loc.lon),
    nestedNum(loc, 'Location', 'longitude'),
    nestedNum(loc, 'location', 'longitude'),
  );
  return { latitude: lat, longitude: lng };
}

function nestedNum(obj: Record<string, unknown>, a: string, b: string): number | null {
  const x = obj[a];
  if (!x || typeof x !== 'object') return null;
  const v = (x as Record<string, unknown>)[b];
  return parseFiniteCoord(v);
}

function firstNumeric(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = parseFiniteCoord(v);
    if (n != null) return n;
  }
  return null;
}

/**
 * Match teslajsonpy: when `native_location_supported`, prefer native_* over WGS84 in drive_state.
 * Always consider `location_data` first — required for many 2023.38+ vehicles while parked.
 */
function resolveVehicleCoords(data: TeslaVehicleData): {
  latitude: number | null;
  longitude: number | null;
} {
  const ds = data.drive_state;
  const dsX = ds as unknown as Record<string, unknown>;
  const { latitude: locLat, longitude: locLng } = coordsFromLocationData(data.location_data);
  const ns = ds.native_location_supported === 1 || ds.native_location_supported === true;
  const primaryLat = ns ? ds.native_latitude : ds.latitude;
  const primaryLng = ns ? ds.native_longitude : ds.longitude;
  const fallLat = ns ? ds.latitude : ds.native_latitude;
  const fallLng = ns ? ds.longitude : ds.native_longitude;
  return {
    latitude: coalesceCoord(
      locLat,
      primaryLat,
      fallLat,
      dsX.est_corrected_lat,
      dsX.est_lat,
    ),
    longitude: coalesceCoord(
      locLng,
      primaryLng,
      fallLng,
      dsX.est_corrected_lng,
      dsX.est_lng,
    ),
  };
}

/** Epoch ms from drive_state (handles s vs ms and gps_as_of). */
function driveStateTimeMs(ds: TeslaVehicleData['drive_state']): number | null {
  const ts = ds.timestamp;
  if (typeof ts === 'number' && ts > 0) {
    return ts > 1e12 ? ts : Math.round(ts * 1000);
  }
  const gps = ds.gps_as_of;
  if (typeof gps === 'number' && gps > 0) {
    return gps > 1e12 ? gps : Math.round(gps * 1000);
  }
  return null;
}

/** Skip only per-slice timestamps — keeps state churn lower; detail UI uses `lastUpdated` / `locationUpdatedAt`. */
const TELEMETRY_SKIP_KEYS = new Set(['timestamp']);

/**
 * Flatten fields from each vehicle_data slice for UI / diagnostics (parity with HA-style entity lists).
 * Primitives as-is; nested objects and complex arrays become JSON strings so nothing is dropped.
 */
function buildVehicleTelemetry(
  data: TeslaVehicleData,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  const addPrefix = (prefix: string, obj: Record<string, unknown> | undefined | null) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (TELEMETRY_SKIP_KEYS.has(k)) continue;
      if (v === null || v === undefined) continue;
      const key = `${prefix}.${k}`;
      if (typeof v === 'number' && !Number.isNaN(v)) {
        out[key] = v;
        continue;
      }
      if (typeof v === 'boolean') {
        out[key] = v;
        continue;
      }
      if (typeof v === 'string') {
        out[key] = v;
        continue;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) {
          out[key] = '[]';
          continue;
        }
        if (v.every((x) => typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean')) {
          out[key] = v.join(',');
          continue;
        }
        try {
          out[key] = JSON.stringify(v);
        } catch { /* skip */ }
        continue;
      }
      if (typeof v === 'object') {
        try {
          out[key] = JSON.stringify(v);
        } catch { /* skip */ }
      }
    }
  };

  addPrefix('charge', data.charge_state as unknown as Record<string, unknown>);
  addPrefix('climate', data.climate_state as unknown as Record<string, unknown>);
  addPrefix('drive', data.drive_state as unknown as Record<string, unknown>);
  addPrefix('vehicle', data.vehicle_state as unknown as Record<string, unknown>);
  addPrefix('gui', data.gui_settings as unknown as Record<string, unknown>);
  addPrefix('location', data.location_data);
  addPrefix('config', data.vehicle_config);

  return out;
}

function mapChargeState(s: string): VehicleState['chargeState'] {
  const lower = s.toLowerCase();
  if (lower === 'charging') return 'charging';
  if (lower === 'complete') return 'complete';
  if (lower === 'stopped') return 'stopped';
  return 'disconnected';
}

function mapOperationMode(s: string): EnergySiteOperationMode {
  if (s === 'backup') return 'backup';
  if (s === 'autonomous') return 'autonomous';
  return 'self_consumption';
}
