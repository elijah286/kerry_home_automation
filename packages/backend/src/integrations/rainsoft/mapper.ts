import type { WaterSoftenerState } from '@ha/shared';
import type { RainsoftSnapshot } from './rainsoft-client.js';

export function mapRainsoft(entryId: string, snap: RainsoftSnapshot, now: number): WaterSoftenerState {
  return {
    type: 'water_softener',
    id: `rainsoft.${entryId}.softener`,
    name: snap.displayName,
    displayName: snap.displayName,
    integration: 'rainsoft',
    areaId: null,
    available: true,
    lastChanged: now,
    lastUpdated: now,
    systemStatus: snap.systemStatusName,
    capacityPercent: snap.capacityRemaining,
    saltPercent: snap.saltPct,
    lastRegen: snap.lastRegenDate,
    nextRegen: snap.regenTime,
    model: snap.prettyModel,
  };
}
