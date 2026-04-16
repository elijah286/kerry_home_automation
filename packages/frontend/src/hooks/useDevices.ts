'use client';

// ---------------------------------------------------------------------------
// useDevices — subscribe to a filtered slice of the device graph.
//
// Design choice: selectors are pure `(devices: DeviceState[]) => DeviceState[]`.
// The hook memoises the result by hashing the ids + device references — so a
// re-render fires only when the *selected set* actually changes, even though
// any device-map mutation pokes every listener.
//
// Common selectors live in `@/lib/devicestore/selectors`. Cards should import
// those rather than inline closures so identity is stable across renders.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { DeviceState } from '@ha/shared';
import { __deviceStore, ensureWsConnected } from './useWebSocket';

export type DeviceSelector = (devices: DeviceState[]) => DeviceState[];

/**
 * Subscribe to a filtered view of devices. Re-renders only when the selected
 * subset changes (by id presence or by per-device reference identity).
 *
 * IMPORTANT: pass a *stable* selector reference. Inline `(ds) => ds.filter(...)`
 * re-creates the selector every render and defeats the memoisation. Either
 * `useCallback` it or import a shared selector.
 */
export function useDevices(selector: DeviceSelector): DeviceState[] {
  useEffect(() => { ensureWsConnected(); }, []);

  // Cache the last computed slice + its "shape hash" so we can return a stable
  // reference when the slice hasn't changed.
  const cacheRef = useRef<{ hash: string; value: DeviceState[] } | null>(null);

  return useSyncExternalStore(
    (cb) => __deviceStore.subscribe(cb),
    () => {
      const all = __deviceStore.getAllDevices();
      const next = selector(all);
      // Hash: concatenate ids — cheap and stable across calls.
      // Reference equality on each device is implicit: if any device in the
      // slice has a new reference, the store bumped deviceRevision and we are
      // only called again because of that bump; we still need the hash to
      // detect *set membership* changes.
      const hash = hashSlice(next);
      const prev = cacheRef.current;
      if (prev && prev.hash === hash && sameRefs(prev.value, next)) {
        return prev.value;
      }
      cacheRef.current = { hash, value: next };
      return next;
    },
    () => EMPTY,
  );
}

const EMPTY: DeviceState[] = [];

function hashSlice(list: DeviceState[]): string {
  if (list.length === 0) return '';
  // Use id list as the set-membership hash. Reference identity of each device
  // is handled by sameRefs() so two consecutive calls returning the same ids
  // with the same object refs short-circuit.
  let out = '';
  for (const d of list) out += d.id + '|';
  return out;
}

function sameRefs(a: DeviceState[], b: DeviceState[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
