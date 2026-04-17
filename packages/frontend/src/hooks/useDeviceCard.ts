'use client';

// ---------------------------------------------------------------------------
// useDeviceCard — resolve the effective card for a device.
//
// Pairs `useDevice(id)` with the per-user override fetched from
// `/api/devices/:id/card`, and returns the resolved `CardDescriptor` plus
// imperative setters that update the server and local state optimistically.
//
// Resolution order (delegated to `resolveDefaultCard`):
//   1. Per-user override — if the user has customised this device's card.
//   2. `${type}:${device_class}` factory — specific default.
//   3. `${type}` factory — coarse default.
//   4. Generic sensor-value fallback.
//
// The hook owns the override fetch lifecycle. `useDevice` owns the live
// device state. Re-renders fire on either (a) a WS update that changes the
// device reference, or (b) an override change initiated here — every other
// card on screen stays still.
//
// Override state is three-valued: `undefined` = still fetching for this
// `deviceId`, `null` = fetch finished and no override, or a descriptor when
// set. That avoids flashing the software default while GET /card is in
// flight and avoids showing another device's override briefly after id churn.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import type { CardDescriptor, DeviceState } from '@ha/shared';
import { useDevice } from './useDevice';
import {
  clearDeviceCardOverride,
  getDeviceCardOverride,
  setDeviceCardOverride,
} from '@/lib/api-device-cards';
import { resolveDefaultCard } from '@/lib/device-card-map';

/** `undefined` means “initial GET not completed for this device id yet”. */
type OverrideState = CardDescriptor | null | undefined;

export interface UseDeviceCardResult {
  /** The device itself, or `undefined` while loading / on bad id. */
  device: DeviceState | undefined;
  /**
   * Resolved card — `null` when the device row is not available yet, or when
   * the override row is still loading (pair with `isLoading`).
   */
  card: CardDescriptor | null;
  /** True when the current card came from a per-user override. */
  isOverridden: boolean;
  /** True while the initial override GET is in flight for this `deviceId`. */
  isLoading: boolean;
  /** Last error from any of the API calls, or `null`. */
  error: Error | null;
  /**
   * Persist a new override. Optimistically updates local state; on server
   * failure, rolls back and surfaces the error via `error`.
   */
  setOverride: (descriptor: CardDescriptor) => Promise<void>;
  /** Remove the override and fall back to the default mapping. */
  clearOverride: () => Promise<void>;
}

/**
 * Subscribe to a device and resolve its effective card.
 *
 * Pass `undefined` for `deviceId` during guard renders (e.g., router params
 * not yet ready); the hook returns a harmless empty result.
 */
export function useDeviceCard(deviceId: string | undefined): UseDeviceCardResult {
  const device = useDevice(deviceId);
  const [override, setOverrideState] = useState<OverrideState>(undefined);
  const [error, setError] = useState<Error | null>(null);

  // Fetch the override whenever the deviceId changes. We don't depend on the
  // device object here — the override is keyed by id and is valid even while
  // the device itself hasn't streamed in yet.
  useEffect(() => {
    if (!deviceId) {
      setOverrideState(undefined);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setOverrideState(undefined);

    getDeviceCardOverride(deviceId)
      .then((res) => {
        if (cancelled) return;
        setOverrideState(res.override);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setOverrideState(null);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const setOverride = useCallback(
    async (descriptor: CardDescriptor) => {
      if (!deviceId) return;
      const prev = override;
      setOverrideState(descriptor); // optimistic
      setError(null);
      try {
        const res = await setDeviceCardOverride(deviceId, descriptor);
        setOverrideState(res.override);
      } catch (err: unknown) {
        setOverrideState(prev);
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      }
    },
    [deviceId, override],
  );

  const clearOverride = useCallback(async () => {
    if (!deviceId) return;
    const prev = override;
    setOverrideState(null); // optimistic
    setError(null);
    try {
      await clearDeviceCardOverride(deviceId);
    } catch (err: unknown) {
      setOverrideState(prev);
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    }
  }, [deviceId, override]);

  const card =
    device && override !== undefined ? resolveDefaultCard(device, override) : null;

  const isLoading = Boolean(deviceId) && override === undefined;

  return {
    device,
    card,
    isOverridden: Boolean(deviceId) && override != null,
    isLoading,
    error,
    setOverride,
    clearOverride,
  };
}
