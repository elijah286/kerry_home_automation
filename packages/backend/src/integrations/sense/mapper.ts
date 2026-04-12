import type { EnergyMonitorState } from '@ha/shared';
import type { SenseRealtime } from './sense-client.js';

export function mapSense(entryId: string, rt: SenseRealtime, now: number): EnergyMonitorState {
  return {
    type: 'energy_monitor',
    id: `sense.${entryId}.monitor`,
    name: 'Sense',
    integration: 'sense',
    areaId: null,
    available: true,
    lastChanged: now,
    lastUpdated: now,
    powerW: rt.powerW,
    solarW: rt.solarW,
    frequencyHz: rt.frequencyHz,
    voltage: rt.voltage,
  };
}
