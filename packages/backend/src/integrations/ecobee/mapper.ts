// ---------------------------------------------------------------------------
// Ecobee API response → ThermostatState mapper (Home Assistant parity)
// ---------------------------------------------------------------------------

import type {
  ThermostatState,
  ThermostatMode,
  ThermostatFanMode,
  ThermostatSensor,
  ThermostatHvacAction,
} from '@ha/shared';
import type { EcobeeThermostat } from './ecobee-client.js';
import {
  activeSensorNamesForPreset,
  comfortSettings,
  resolvePresetMode,
  vacationNameIfRunning,
} from './preset.js';
import { mapOutdoorWeather } from './weather.js';

const HVAC_MODE_MAP: Record<string, ThermostatMode> = {
  heat: 'heat',
  cool: 'cool',
  auto: 'auto',
  off: 'off',
  auxHeatOnly: 'auxHeatOnly',
};

/** Priority-ordered HVAC actions (HA ecobee climate hvac_action). */
const ACTION_PRIORITY: ThermostatHvacAction[] = ['heating', 'cooling', 'drying', 'fan'];

const EQUIP_TO_ACTION: Record<string, ThermostatHvacAction | null> = {
  heatPump: 'heating',
  heatPump2: 'heating',
  heatPump3: 'heating',
  compCool1: 'cooling',
  compCool2: 'cooling',
  auxHeat1: 'heating',
  auxHeat2: 'heating',
  auxHeat3: 'heating',
  fan: 'fan',
  humidifier: null,
  dehumidifier: 'drying',
  ventilator: 'fan',
  economizer: 'fan',
  compHotWater: null,
  auxHotWater: null,
  compWaterHeater: null,
};

function mapHvacAction(equipmentStatus: string): ThermostatHvacAction {
  if (!equipmentStatus.trim()) return 'idle';
  const parts = equipmentStatus.split(',').map((p) => p.trim());
  const actions = new Set<ThermostatHvacAction>();
  for (const p of parts) {
    const a = EQUIP_TO_ACTION[p];
    if (a) actions.add(a);
  }
  for (const candidate of ACTION_PRIORITY) {
    if (actions.has(candidate)) return candidate;
  }
  return 'idle';
}

/** Legacy `running` without drying */
function mapRunningLegacy(equipmentStatus: string): 'heating' | 'cooling' | 'fan' | 'idle' {
  const a = mapHvacAction(equipmentStatus);
  if (a === 'drying') return 'idle';
  return a;
}

function mapSensors(thermostat: EcobeeThermostat): ThermostatSensor[] {
  if (!thermostat.remoteSensors) return [];
  return thermostat.remoteSensors.map((sensor) => {
    const tempCap = sensor.capability.find((c) => c.type === 'temperature');
    const humCap = sensor.capability.find((c) => c.type === 'humidity');
    const occCap = sensor.capability.find((c) => c.type === 'occupancy');

    return {
      id: sensor.id,
      name: sensor.name,
      sensorType: sensor.type,
      code: sensor.code,
      temperature: tempCap && tempCap.value !== 'unknown' ? Number(tempCap.value) / 10 : null,
      humidity: humCap && humCap.value !== 'unknown' ? Number(humCap.value) : null,
      occupancy: occCap ? occCap.value === 'true' : false,
    };
  });
}

const HUMIDIFIER_MANUAL = 'manual';

export function mapThermostat(entryId: string, thermostat: EcobeeThermostat): ThermostatState {
  const rt = thermostat.runtime;
  const settings = thermostat.settings;
  const equipment = thermostat.equipmentStatus ?? '';
  const hvacAction = mapHvacAction(equipment);
  const presetMode = resolvePresetMode(thermostat);
  const climates = thermostat.program?.climates ?? [];
  const byRef = comfortSettings(climates);
  const currentClimateName = thermostat.program?.currentClimateRef
    ? byRef.get(thermostat.program.currentClimateRef) ?? null
    : null;

  const hasHumidifierControl = Boolean(settings.hasHumidifier) && settings.humidifierMode === HUMIDIFIER_MANUAL;

  const fanRunning = equipment.split(',').some((p) => p.trim() === 'fan');

  const connected = rt.connected !== false;

  return {
    type: 'thermostat',
    id: `ecobee.${entryId}.thermostat.${thermostat.identifier}`,
    name: thermostat.name,
    integration: 'ecobee',
    areaId: null,
    available: connected,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    temperature: rt.actualTemperature != null ? rt.actualTemperature / 10 : null,
    humidity: rt.actualHumidity != null ? rt.actualHumidity : null,
    hvacMode: HVAC_MODE_MAP[settings.hvacMode] ?? 'off',
    fanMode: (rt.desiredFanMode === 'on' ? 'on' : 'auto') as ThermostatFanMode,
    heatSetpoint: rt.desiredHeat / 10,
    coolSetpoint: rt.desiredCool / 10,
    running: mapRunningLegacy(equipment),
    hvacAction,
    sensors: mapSensors(thermostat),
    model: thermostat.modelNumber ?? 'Ecobee',
    ecobee: {
      equipmentRunning: equipment,
      fanRunning,
      climateMode: currentClimateName,
      presetMode,
      climates: climates.map((c) => ({ climateRef: c.climateRef, name: c.name })),
      activeSensorNames: activeSensorNamesForPreset(thermostat, presetMode),
      fanMinOnTime: settings.fanMinOnTime ?? 0,
      holdAction: settings.holdAction ?? null,
      heatCoolMinDelta: (settings.heatCoolMinDelta ?? 30) / 10,
      targetHumidity: hasHumidifierControl && rt.desiredHumidity != null ? rt.desiredHumidity : null,
      hasHumidifierControl,
      vacationName: vacationNameIfRunning(thermostat),
      outdoor: mapOutdoorWeather(thermostat.weather),
      hasHeatPump: Boolean(settings.hasHeatPump),
      ventilatorType: String(settings.ventilatorType ?? 'none'),
      ventilatorTimerOn: Boolean(settings.isVentilatorTimerOn),
      ventilatorMinOnTimeHome: Number(settings.ventilatorMinOnTimeHome ?? 0),
      ventilatorMinOnTimeAway: Number(settings.ventilatorMinOnTimeAway ?? 0),
      compressorProtectionMinTempF:
        settings.compressorProtectionMinTemp != null ? settings.compressorProtectionMinTemp / 10 : null,
      autoAwayEnabled: settings.autoAway ?? null,
      followMeEnabled: settings.followMeComfort ?? null,
      dstEnabled: thermostat.location?.isDaylightSaving ?? null,
      micEnabled: thermostat.audio?.microphoneEnabled ?? null,
      dehumidifierLevel: settings.dehumidifierLevel != null ? Number(settings.dehumidifierLevel) : null,
    },
  };
}

