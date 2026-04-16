'use client';

// ---------------------------------------------------------------------------
// useHelpers — convenience subscription to just the helper devices in the
// store. Helpers are first-class devices (integration === 'helpers'), so this
// is a thin wrapper around `useDevices(helpers)`.
//
// Cards and dashboards that need to render, say, "all timers" use this; the
// admin UI at /settings/helpers still manages the underlying YAML definitions
// through the existing helper routes.
// ---------------------------------------------------------------------------

import type { DeviceState } from '@ha/shared';
import { useDevices } from './useDevices';
import { useDevice } from './useDevice';
import { helpers } from '@/lib/devicestore/selectors';

export type HelperDevice = Extract<DeviceState, { integration: 'helpers' }>;

export function useHelpers(): HelperDevice[] {
  // Cast is safe: the `helpers` selector filters by `integration === 'helpers'`
  // which narrows to HelperDevice at runtime.
  return useDevices(helpers) as HelperDevice[];
}

/** Subscribe to a single helper by id. Returns undefined if it doesn't exist. */
export function useHelper(helperId: string): HelperDevice | undefined {
  // Helper device ids are always `helpers.${def.id}` — accept both the short
  // and the fully-qualified form.
  const full = helperId.startsWith('helpers.') ? helperId : `helpers.${helperId}`;
  const device = useDevice(full);
  if (!device || device.integration !== 'helpers') return undefined;
  return device as HelperDevice;
}
