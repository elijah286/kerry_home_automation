// ---------------------------------------------------------------------------
// Ring device data → DoorbellState mappers
// ---------------------------------------------------------------------------

import type { DoorbellState } from '@ha/shared';
import type { RingDeviceRaw, RingHistoryEvent } from './ring-client.js';

function parseBattery(raw: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

function latestEventTime(events: RingHistoryEvent[], kind: string): number | null {
  const ev = events.find((e) => e.kind === kind);
  return ev ? new Date(ev.created_at).getTime() : null;
}

export function mapDoorbell(
  entryId: string,
  device: RingDeviceRaw,
  lastEvents: RingHistoryEvent[],
): DoorbellState {
  return {
    type: 'doorbell',
    id: `ring.${entryId}.doorbell.${device.id}`,
    name: device.description,
    integration: 'ring',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    battery: parseBattery(device.battery_life),
    lastMotion: latestEventTime(lastEvents, 'motion'),
    lastRing: latestEventTime(lastEvents, 'ding'),
    online: device.alerts?.connection === 'online',
    hasCamera: true,
    streamUrl: null,
  };
}

export function mapCamera(
  entryId: string,
  device: RingDeviceRaw,
): DoorbellState {
  return {
    type: 'doorbell',
    id: `ring.${entryId}.camera.${device.id}`,
    name: device.description,
    integration: 'ring',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    battery: parseBattery(device.battery_life),
    lastMotion: null,
    lastRing: null,
    online: device.alerts?.connection === 'online',
    hasCamera: true,
    streamUrl: null,
  };
}
