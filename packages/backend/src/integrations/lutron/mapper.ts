// ---------------------------------------------------------------------------
// Lutron LEAP response → typed DeviceState
// ---------------------------------------------------------------------------

import type { LightState, CoverState, FanState, SwitchState, FanSpeed } from '@ha/shared';

export type LutronDeviceType = 'light' | 'cover' | 'fan' | 'switch';

/** Map LEAP DeviceType string to our device type */
export function leapDeviceTypeToType(deviceType: string): LutronDeviceType {
  const dt = deviceType.toLowerCase();
  if (dt.includes('fan')) return 'fan';
  if (dt.includes('shade') || dt.includes('blind')) return 'cover';
  if (dt.includes('dimmer') || dt.includes('plugin')) return 'light';
  if (dt.includes('switch')) return 'switch';
  return 'light';
}

/** Extract zone ID from a LEAP href like "/zone/123" */
export function extractZoneId(href: string): string | null {
  const m = /\/zone\/(\d+)/i.exec(href);
  return m ? m[1] : null;
}

interface ZoneMeta {
  entryId: string;
  zoneId: string;
  name: string;
  areaId: string | null;
  deviceType: LutronDeviceType;
}

export function makeLightState(meta: ZoneMeta, level: number): LightState {
  return {
    type: 'light',
    id: `lutron.${meta.entryId}.zone.${meta.zoneId}`,
    name: meta.name,
    integration: 'lutron',
    areaId: meta.areaId,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    on: level > 0,
    brightness: level,
  };
}

export function makeSwitchState(meta: ZoneMeta, level: number): SwitchState {
  return {
    type: 'switch',
    id: `lutron.${meta.entryId}.zone.${meta.zoneId}`,
    name: meta.name,
    integration: 'lutron',
    areaId: meta.areaId,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    on: level > 0,
  };
}

export function makeCoverState(meta: ZoneMeta, position: number): CoverState {
  return {
    type: 'cover',
    id: `lutron.${meta.entryId}.zone.${meta.zoneId}`,
    name: meta.name,
    integration: 'lutron',
    areaId: meta.areaId,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    position,
    moving: 'stopped',
  };
}

const FAN_SPEED_MAP: Record<string, FanSpeed> = {
  off: 'off',
  low: 'low',
  medium: 'medium',
  mediumhigh: 'medium-high',
  high: 'high',
};

export function makeFanState(meta: ZoneMeta, fanSpeedStr: string): FanState {
  const speed = FAN_SPEED_MAP[fanSpeedStr.toLowerCase()] ?? 'medium';
  return {
    type: 'fan',
    id: `lutron.${meta.entryId}.zone.${meta.zoneId}`,
    name: meta.name,
    integration: 'lutron',
    areaId: meta.areaId,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    on: speed !== 'off',
    speed,
  };
}
