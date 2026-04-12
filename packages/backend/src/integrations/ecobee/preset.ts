// ---------------------------------------------------------------------------
// Ecobee preset / comfort resolution (Home Assistant ecobee climate parity)
// ---------------------------------------------------------------------------

import { ecobeeSelectablePresetKeys } from '@ha/shared';
import type { EcobeeProgram, EcobeeProgramClimate, EcobeeThermostat } from './ecobee-client.js';

export const PRESET_AWAY_INDEFINITELY = 'away_indefinitely';
export const PRESET_TEMPERATURE = 'temp';
export const PRESET_VACATION = 'vacation';
export const PRESET_HOLD_NEXT_TRANSITION = 'next_transition';
export const PRESET_HOLD_INDEFINITE = 'indefinite';

/** Ecobee comfort name → HA-style preset id */
const ECOBEE_NAME_TO_HASS: Record<string, string> = {
  Away: 'away',
  Home: 'home',
  Sleep: 'sleep',
};

export function comfortSettings(climates: EcobeeProgramClimate[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of climates) {
    m.set(c.climateRef, c.name);
  }
  return m;
}

function isIndefiniteHold(startDate: string | undefined, endDate: string | undefined): boolean {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffDays = (end.getTime() - start.getTime()) / (86400 * 1000);
  return diffDays > 365;
}

export function resolvePresetMode(thermostat: EcobeeThermostat): string | null {
  const events = thermostat.events ?? [];
  const program = thermostat.program;
  const climates = program?.climates ?? [];
  const byRef = comfortSettings(climates);

  for (const event of events) {
    if (!event.running) continue;

    if (event.type === 'hold') {
      if (event.holdClimateRef === 'away' && isIndefiniteHold(event.startDate, event.endDate)) {
        return PRESET_AWAY_INDEFINITELY;
      }
      if (event.holdClimateRef) {
        const comfortName = byRef.get(event.holdClimateRef);
        if (comfortName) {
          return ECOBEE_NAME_TO_HASS[comfortName] ?? comfortName;
        }
      }
      return PRESET_TEMPERATURE;
    }

    if (event.type.startsWith('auto')) {
      return event.type.slice(4).toLowerCase();
    }

    if (event.type === 'vacation' && event.name) {
      return PRESET_VACATION;
    }
  }

  if (program?.currentClimateRef) {
    const name = byRef.get(program.currentClimateRef);
    if (name) return ECOBEE_NAME_TO_HASS[name] ?? name;
  }

  return null;
}

export function vacationNameIfRunning(thermostat: EcobeeThermostat): string | null {
  for (const event of thermostat.events ?? []) {
    if (event.running && event.type === 'vacation' && event.name) {
      return event.name;
    }
  }
  return null;
}

/** Preset mode keys + custom comfort names (for UI), aligned with HA preset_modes list. */
export function listSelectablePresets(climates: EcobeeProgramClimate[]): string[] {
  return ecobeeSelectablePresetKeys(climates);
}

function climateNameForSensorParticipation(
  presetMode: string | null,
  climates: EcobeeProgramClimate[],
): string {
  const refToName = Object.fromEntries(climates.map((c) => [c.climateRef, c.name])) as Record<string, string>;
  const homeName = refToName.home ?? climates.find((c) => c.climateRef === 'home')?.name ?? 'Home';

  if (!presetMode) return homeName;
  if (presetMode === PRESET_TEMPERATURE || presetMode === PRESET_VACATION) return homeName;
  if (presetMode === PRESET_AWAY_INDEFINITELY) {
    return refToName.away ?? climates.find((c) => c.climateRef === 'away')?.name ?? 'Away';
  }
  if (refToName[presetMode]) return refToName[presetMode];
  if (climates.some((c) => c.name === presetMode)) return presetMode;
  const byHass = climates.find((c) => ECOBEE_NAME_TO_HASS[c.name] === presetMode);
  if (byHass) return byHass.name;
  return homeName;
}

export function activeSensorNamesForPreset(thermostat: EcobeeThermostat, presetMode: string | null): string[] {
  const climates = thermostat.program?.climates;
  if (!climates?.length) return [];
  const modeName = climateNameForSensorParticipation(presetMode, climates);
  const climate = climates.find((c) => c.name === modeName);
  if (!climate?.sensors?.length) return [];
  return climate.sensors.map((s) => {
    const full = thermostat.remoteSensors?.find((rs) => rs.id === s.id || `${rs.id}:1` === s.id || s.id.startsWith(rs.id));
    return full?.name ?? s.name ?? s.id;
  });
}
