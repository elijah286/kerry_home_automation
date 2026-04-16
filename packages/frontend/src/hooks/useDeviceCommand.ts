'use client';

// ---------------------------------------------------------------------------
// useDeviceCommand — dispatch a card `Action` to the backend.
//
// This is the single entry point cards use to react to taps/holds. It knows how
// to translate each variant of the shared `Action` discriminated union into
// either a REST command (`sendCommand`) or a UI-side callback (navigate,
// more-info). Side-effectful variants resolve with the existing `useCommand`
// pending-state machinery so card buttons can render spinners uniformly.
//
// UI-side variants require callbacks from the caller so this hook stays router-
// and dialog-agnostic:
//
//   const dispatch = useDeviceCommand(deviceId, {
//     onNavigate: (path) => router.push(path),
//     onMoreInfo: (id) => openMoreInfo(id),
//   });
//   <button onClick={() => dispatch(card.tapAction, 'tap')} />
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import type { Action, DeviceState } from '@ha/shared';
import { useCommand } from './useCommand';
import { __deviceStore } from './useWebSocket';

export interface DeviceCommandHandlers {
  /** Called for `{ type: 'navigate', path }` actions. */
  onNavigate?: (path: string) => void;
  /** Called for `{ type: 'more-info', entity }` actions. Defaults to card's primary entity. */
  onMoreInfo?: (entityId: string) => void;
}

export interface DeviceCommandApi {
  /**
   * Dispatch an action. `key` is a short tag used for the per-key pending state
   * (e.g. `'tap'`, `'hold'`, `'brightness'`) — surface it through `isPending`
   * to disable only the relevant control.
   */
  dispatch: (action: Action | undefined, key?: string) => Promise<void>;
  isPending: (key: string) => boolean;
  anyPending: boolean;
  lastError: string | null;
  clearError: () => void;
}

/**
 * Returns a `dispatch(action)` function tied to a specific primary device.
 *
 * - `toggle` / `command` / `fire-helper` → POST /api/devices/:id/command
 * - `navigate` → handlers.onNavigate(path)
 * - `more-info` → handlers.onMoreInfo(entity ?? primaryDeviceId)
 * - `none` / undefined → no-op
 */
export function useDeviceCommand(
  primaryDeviceId: string,
  handlers: DeviceCommandHandlers = {},
): DeviceCommandApi {
  const { send, isPending, anyPending, lastError, clearError } = useCommand(primaryDeviceId);
  const { onNavigate, onMoreInfo } = handlers;

  const dispatch = useCallback(async (action: Action | undefined, key = 'tap') => {
    if (!action || action.type === 'none') return;

    switch (action.type) {
      case 'toggle': {
        const target = action.entity ?? primaryDeviceId;
        const device = __deviceStore.getDevice(target);
        const payload = toggleCommand(device);
        if (!payload) {
          console.warn('[useDeviceCommand] cannot toggle — device missing or type unsupported', target);
          return;
        }
        if (target !== primaryDeviceId) {
          console.warn('[useDeviceCommand] toggle targets a non-primary entity; pending state will not track', target);
        }
        await send(key, payload);
        return;
      }

      case 'command': {
        const device = __deviceStore.getDevice(action.deviceId);
        if (action.deviceId !== primaryDeviceId) {
          console.warn('[useDeviceCommand] command targets a non-primary device; pending state will not track', action.deviceId);
        }
        await send(key, {
          type: device?.type,
          action: action.command,
          ...(action.params ?? {}),
        });
        return;
      }

      case 'fire-helper': {
        const op = action.op ?? 'press';
        if (action.helperId !== primaryDeviceId) {
          console.warn('[useDeviceCommand] fire-helper targets a different device; pending state will not track', action.helperId);
        }
        await send(key, { type: 'helper', action: op });
        return;
      }

      case 'navigate':
        onNavigate?.(action.path);
        return;

      case 'more-info':
        onMoreInfo?.(action.entity ?? primaryDeviceId);
        return;
    }
  }, [primaryDeviceId, send, onNavigate, onMoreInfo]);

  return { dispatch, isPending, anyPending, lastError, clearError };
}

// ---------------------------------------------------------------------------
// Toggle translator: map a `DeviceState` to the integration-specific "flip"
// command the backend expects. Each device class uses
// `{ type: <deviceType>, action: <verb>, ... }`. Returning `null` means "no
// sensible toggle for this class" (sensors, sun, weather, etc.).
// ---------------------------------------------------------------------------
function toggleCommand(device: DeviceState | undefined): Record<string, unknown> | null {
  if (!device) return null;
  switch (device.type) {
    case 'light':
      return { type: 'light', action: device.on ? 'turn_off' : 'turn_on' };
    case 'switch':
      return { type: 'switch', action: device.on ? 'turn_off' : 'turn_on' };
    case 'fan':
      return { type: 'fan', action: device.on ? 'turn_off' : 'turn_on' };
    case 'cover':
      return {
        type: 'cover',
        action: device.position > 0 ? 'close' : 'open',
      };
    default:
      return null;
  }
}
