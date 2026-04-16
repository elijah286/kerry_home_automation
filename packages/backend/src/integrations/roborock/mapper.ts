// ---------------------------------------------------------------------------
// Roborock status → VacuumState + child SensorState (consumables)
// ---------------------------------------------------------------------------

import type { SensorState, VacuumRoom, VacuumState, VacuumStatus } from '@ha/shared';
import type { RoborockCleanSummary, RoborockConsumables, RoborockStatus } from './miio-client.js';
import { stateCodeToStatus, fanPowerToLabel } from './miio-client.js';

const ERROR_CODES: Record<number, string> = {
  0: '', 1: 'Laser sensor fault', 2: 'Collision sensor fault',
  3: 'Wheel floating', 4: 'Cliff sensor fault', 5: 'Main brush jammed',
  6: 'Side brush jammed', 7: 'Wheel jammed', 8: 'Device stuck',
  9: 'Dustbin missing', 10: 'Filter blocked', 11: 'Magnetic field detected',
  12: 'Low battery', 13: 'Charging fault', 14: 'Battery fault',
  15: 'Wall sensor fault', 16: 'Uneven surface', 17: 'Side brush fault',
  18: 'Suction fan fault', 19: 'Unpowered charging station',
  21: 'Laser distance sensor blocked', 22: 'Charge sensor fault',
  23: 'Dock fault', 24: 'No-go zone detected',
};

// Standard Roborock consumable lifetimes in seconds
export const CONSUMABLE_MAX_SECONDS: Record<string, number> = {
  main_brush: 300 * 3600, // 300 h
  side_brush: 200 * 3600, // 200 h
  filter: 150 * 3600, // 150 h
  sensor: 30 * 3600, // 30 h
};

const MOP_MODE_LABELS: Record<number, string> = {
  300: 'standard',
  301: 'deep',
  303: 'deep_plus',
  304: 'fast',
};

const MOP_INTENSITY_LABELS: Record<number, string> = {
  200: 'off',
  201: 'low',
  202: 'medium',
  203: 'high',
  204: 'custom',
};

export interface ExtendedVacuumInputs {
  consumables?: RoborockConsumables | null;
  cleanSummary?: RoborockCleanSummary | null;
  rooms?: VacuumRoom[] | null;
}

export function mapVacuumState(
  entryId: string,
  name: string,
  status: RoborockStatus | null,
  deviceDuid?: string,
  extended?: ExtendedVacuumInputs,
): VacuumState {
  const statusStr = status ? stateCodeToStatus(status.state) : 'idle';
  const id = vacuumDeviceId(entryId, deviceDuid);

  const mopAttached = numFlag(status?.mop_attached);
  const waterBoxAttached = numFlag(status?.water_box_status);
  const waterShortage = numFlag(status?.water_shortage_status);
  const dndEnabled = numFlag(status?.dnd_enabled);
  const childLock = numFlag(status?.lock_status);

  const mopModeNum = status?.mop_mode;
  const mopIntensityNum = status?.water_box_mode;

  return {
    type: 'vacuum',
    id,
    name,
    integration: 'roborock',
    areaId: null,
    available: status != null,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    status: statusStr as VacuumStatus,
    battery: status?.battery ?? 0,
    fanSpeed: status ? fanPowerToLabel(status.fan_power) : 'unknown',
    areaCleaned: status ? Math.round(status.clean_area / 1_000_000) : null, // mm² → m²
    cleaningTime: status ? Math.round(status.clean_time / 60) : null, // s → min
    errorMessage: status?.error_code ? (ERROR_CODES[status.error_code] ?? `Error ${status.error_code}`) : null,
    mopAttached: mopAttached ?? undefined,
    waterBoxAttached: waterBoxAttached ?? undefined,
    waterShortage: waterShortage ?? undefined,
    dockErrorCode: status?.dock_error_status ?? undefined,
    totalCleaningArea:
      extended?.cleanSummary?.clean_area != null
        ? Math.round(extended.cleanSummary.clean_area / 1_000_000)
        : undefined,
    totalCleaningTime:
      extended?.cleanSummary?.clean_time != null
        ? Math.round(extended.cleanSummary.clean_time / 60)
        : undefined,
    totalCleaningCount: extended?.cleanSummary?.clean_count ?? undefined,
    mopMode: mopModeNum != null ? (MOP_MODE_LABELS[mopModeNum] ?? String(mopModeNum)) : undefined,
    mopIntensity:
      mopIntensityNum != null ? (MOP_INTENSITY_LABELS[mopIntensityNum] ?? String(mopIntensityNum)) : undefined,
    dndEnabled: dndEnabled ?? undefined,
    childLock: childLock ?? undefined,
    rooms: extended?.rooms ?? undefined,
  };
}

function numFlag(v: number | null | undefined): boolean | null {
  if (v == null) return null;
  return v !== 0;
}

export function vacuumDeviceId(entryId: string, deviceDuid?: string): string {
  return deviceDuid && deviceDuid.length > 0
    ? `roborock.${entryId}.${deviceDuid}.vacuum`
    : `roborock.${entryId}.vacuum`;
}

/** Convert consumable seconds-used into a remaining percentage (0-100). */
export function consumableRemainingPct(usedSeconds: number | null | undefined, max: number): number | null {
  if (usedSeconds == null) return null;
  const remaining = Math.max(0, Math.min(100, Math.round(100 * (1 - usedSeconds / max))));
  return remaining;
}

/** Build SensorState child entities for each consumable, with parentDeviceId on the vacuum. */
export function mapConsumableSensors(
  entryId: string,
  vacuumId: string,
  vacuumName: string,
  consumables: RoborockConsumables | null | undefined,
  deviceDuid?: string,
): SensorState[] {
  if (!consumables) return [];
  const now = Date.now();
  const suffix = deviceDuid && deviceDuid.length > 0 ? `${entryId}.${deviceDuid}` : entryId;
  const entries: Array<{ key: string; label: string; seconds: number | null; max: number }> = [
    {
      key: 'main_brush',
      label: `${vacuumName} Main Brush`,
      seconds: consumables.main_brush_work_time,
      max: CONSUMABLE_MAX_SECONDS.main_brush,
    },
    {
      key: 'side_brush',
      label: `${vacuumName} Side Brush`,
      seconds: consumables.side_brush_work_time,
      max: CONSUMABLE_MAX_SECONDS.side_brush,
    },
    {
      key: 'filter',
      label: `${vacuumName} Filter`,
      seconds: consumables.filter_work_time,
      max: CONSUMABLE_MAX_SECONDS.filter,
    },
    {
      key: 'sensor',
      label: `${vacuumName} Sensor`,
      seconds: consumables.sensor_dirty_time,
      max: CONSUMABLE_MAX_SECONDS.sensor,
    },
  ];

  return entries
    .filter((e) => e.seconds != null)
    .map(
      (e): SensorState => ({
        type: 'sensor',
        id: `roborock.${suffix}.sensor.${e.key}`,
        name: e.label,
        integration: 'roborock',
        areaId: null,
        available: true,
        lastChanged: now,
        lastUpdated: now,
        parentDeviceId: vacuumId,
        sensorType: 'consumable',
        value: consumableRemainingPct(e.seconds, e.max),
        unit: '%',
      }),
    );
}
