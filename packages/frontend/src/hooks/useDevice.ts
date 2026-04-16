'use client';

// ---------------------------------------------------------------------------
// useDevice — fine-grained per-device subscription.
//
// Unlike `useWebSocket()` which re-renders on ANY device change, `useDevice(id)`
// re-renders only when that specific device's state reference changes. The
// DeviceStore replaces each device object in its map on every update, so React's
// default `Object.is` equality on the snapshot is enough to skip re-renders for
// unrelated devices.
//
// Use this in card components — 100 cards on a dashboard should mean 100
// independent subscriptions, not 100 re-renders per WS frame.
// ---------------------------------------------------------------------------

import { useEffect, useSyncExternalStore } from 'react';
import type { DeviceState } from '@ha/shared';
import { __deviceStore, ensureWsConnected } from './useWebSocket';

/**
 * Subscribe to a single device by id. Returns `undefined` if the device is
 * unknown (not yet loaded, removed, or the id is wrong — card code should
 * render an `EntityBoundary` warning in that case).
 */
export function useDevice(deviceId: string | undefined): DeviceState | undefined {
  useEffect(() => { ensureWsConnected(); }, []);

  return useSyncExternalStore(
    (cb) => __deviceStore.subscribe(cb),
    () => (deviceId ? __deviceStore.getDevice(deviceId) : undefined),
    () => undefined,
  );
}
