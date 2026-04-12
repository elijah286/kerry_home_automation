// ---------------------------------------------------------------------------
// Rachio API data → SprinklerState
// ---------------------------------------------------------------------------

import type { SprinklerState, SprinklerZone } from '@ha/shared';
import type { RachioDevice, RachioCurrentSchedule } from './api-client.js';

export function mapSprinklerState(
  entryId: string,
  device: RachioDevice,
  schedule: RachioCurrentSchedule | null,
): SprinklerState {
  const isRunning = schedule?.status === 'PROCESSING';
  const zones: SprinklerZone[] = device.zones
    .sort((a, b) => a.zoneNumber - b.zoneNumber)
    .map((z) => ({
      id: z.id,
      name: z.name,
      enabled: z.enabled,
      running: isRunning && schedule?.zoneId === z.id,
    }));

  return {
    type: 'sprinkler',
    id: `rachio.${entryId}.${device.id}`,
    name: device.name,
    integration: 'rachio',
    areaId: null,
    available: device.status === 'ONLINE',
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    running: isRunning,
    currentZone: isRunning ? (schedule?.zoneName ?? null) : null,
    timeRemaining: isRunning ? (schedule?.remainingDuration ?? null) : null,
    zones,
    standby: !device.on,
    rainDelay: false,
  };
}
