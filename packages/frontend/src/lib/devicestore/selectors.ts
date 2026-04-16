// ---------------------------------------------------------------------------
// Stable device selectors for `useDevices(selector)`.
//
// Each factory returns a *stable* selector function (memoised by its input key)
// so cards can do `useDevices(byArea(areaId))` without re-creating the closure
// every render. The `useDevices` hook relies on the selector reference being
// stable to short-circuit subscription bookkeeping.
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId } from '@ha/shared';
import type { DeviceSelector } from '@/hooks/useDevices';

// -- byArea -----------------------------------------------------------------

const byAreaCache = new Map<string, DeviceSelector>();

export function byArea(areaId: string): DeviceSelector {
  let sel = byAreaCache.get(areaId);
  if (!sel) {
    sel = (devices) => devices.filter((d) => d.areaId === areaId);
    byAreaCache.set(areaId, sel);
  }
  return sel;
}

// -- byIntegration ----------------------------------------------------------

const byIntegrationCache = new Map<IntegrationId, DeviceSelector>();

export function byIntegration(id: IntegrationId): DeviceSelector {
  let sel = byIntegrationCache.get(id);
  if (!sel) {
    sel = (devices) => devices.filter((d) => d.integration === id);
    byIntegrationCache.set(id, sel);
  }
  return sel;
}

// -- byType -----------------------------------------------------------------

const byTypeCache = new Map<DeviceState['type'], DeviceSelector>();

export function byType<T extends DeviceState['type']>(type: T): DeviceSelector {
  let sel = byTypeCache.get(type);
  if (!sel) {
    sel = (devices) => devices.filter((d) => d.type === type);
    byTypeCache.set(type, sel);
  }
  return sel;
}

// -- byParent ---------------------------------------------------------------

const byParentCache = new Map<string, DeviceSelector>();

export function byParent(parentDeviceId: string): DeviceSelector {
  let sel = byParentCache.get(parentDeviceId);
  if (!sel) {
    sel = (devices) => devices.filter((d) => d.parentDeviceId === parentDeviceId);
    byParentCache.set(parentDeviceId, sel);
  }
  return sel;
}

// -- helpers ----------------------------------------------------------------

/** All helper devices (virtual toggles/counters/timers/buttons/etc.). */
export const helpers: DeviceSelector = (devices) =>
  devices.filter((d) => d.integration === 'helpers');

// -- available --------------------------------------------------------------

/** Only devices currently marked reachable by their integration. */
export const availableOnly: DeviceSelector = (devices) =>
  devices.filter((d) => d.available);
