// ---------------------------------------------------------------------------
// Tesla API response → DeviceState mappers
// ---------------------------------------------------------------------------

import type { VehicleState, EnergySiteState, VehicleSleepState, EnergySiteOperationMode } from '@ha/shared';
import type { TeslaVehicleData, TeslaVehicleListItem, TeslaEnergySiteLive } from './api-client.js';

const now = () => Date.now();

/** Build a VehicleState from full vehicle_data response */
export function mapVehicleData(
  entryId: string,
  vehicle: TeslaVehicleListItem,
  data: TeslaVehicleData,
): VehicleState {
  const cs = data.charge_state;
  const cl = data.climate_state;
  const vs = data.vehicle_state;
  const ds = data.drive_state;

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
    latitude: ds.latitude ?? null,
    longitude: ds.longitude ?? null,
    insideTemp: cl.inside_temp,
    outsideTemp: cl.outside_temp,
    climateOn: cl.is_climate_on,
    driverTempSetting: cl.driver_temp_setting,
    passengerTempSetting: cl.passenger_temp_setting,
    batteryLevel: cs.battery_level,
    batteryRange: Math.round(cs.battery_range),
    chargeLimitSoc: cs.charge_limit_soc,
    chargeState: mapChargeState(cs.charging_state),
    chargeRate: cs.charge_rate,
    trunkOpen: vs.rt !== 0,
    frunkOpen: vs.ft !== 0,
    sentryMode: vs.sentry_mode,
    odometer: Math.round(vs.odometer),
    softwareVersion: vs.car_version ?? '',
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
    trunkOpen: false,
    frunkOpen: false,
    sentryMode: false,
    odometer: 0,
    softwareVersion: '',
  };

  return {
    ...base,
    sleepState: vehicle.state as VehicleSleepState,
    available: true,
    lastUpdated: now(),
  };
}

/** Build an EnergySiteState from live_status */
export function mapEnergySiteLive(
  entryId: string,
  siteId: string,
  siteName: string,
  data: TeslaEnergySiteLive,
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
    solarPower: Math.round(data.solar_power),
    batteryPower: Math.round(data.battery_power),
    gridPower: Math.round(data.grid_power),
    loadPower: Math.round(data.load_power),
    batteryPercentage: Math.round(data.percentage_charged),
    backupReservePercent: data.backup_reserve_percent,
    operationMode: mapOperationMode(data.default_real_mode),
    stormModeEnabled: data.storm_mode_active,
    gridStatus: data.grid_status === 'Active' ? 'connected' : 'islanded',
  };
}

// ---- Helpers ----------------------------------------------------------------

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
