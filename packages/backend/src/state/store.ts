// ---------------------------------------------------------------------------
// StateStore: in-memory device state with Redis persistence
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId } from '@ha/shared';
import { eventBus } from './event-bus.js';
import { logger } from '../logger.js';

function deepEqual(a: DeviceState, b: DeviceState): boolean {
  // Fast path: check commonly-changing fields first
  if (a.type !== b.type) return false;
  if (a.lastUpdated !== b.lastUpdated) return false;
  if (a.available !== b.available) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

class StateStore {
  private devices = new Map<string, DeviceState>();

  update(device: DeviceState): void {
    const prev = this.devices.get(device.id);
    // Preserve user-set fields that integrations don't know about
    if (prev) {
      if (prev.displayName && !device.displayName) device.displayName = prev.displayName;
      if (prev.userAreaId && !device.userAreaId) device.userAreaId = prev.userAreaId;
    }
    this.devices.set(device.id, device);
    if (!prev || !deepEqual(prev, device)) {
      eventBus.emit('device_updated', { prev, current: device });
    }
  }

  remove(deviceId: string): void {
    if (this.devices.delete(deviceId)) {
      eventBus.emit('device_removed', { deviceId });
    }
  }

  get(id: string): DeviceState | undefined {
    return this.devices.get(id);
  }

  getAll(): DeviceState[] {
    return [...this.devices.values()];
  }

  getByType<T extends DeviceState['type']>(type: T): Extract<DeviceState, { type: T }>[] {
    return this.getAll().filter((d): d is Extract<DeviceState, { type: T }> => d.type === type);
  }

  getByIntegration(id: IntegrationId): DeviceState[] {
    return this.getAll().filter((d) => d.integration === id);
  }

  /** Serialize all state to a JSON blob for Redis persistence */
  serialize(): string {
    return JSON.stringify(this.getAll());
  }

  /** Restore state from a serialized JSON blob */
  restore(json: string): void {
    try {
      const devices = JSON.parse(json) as DeviceState[];
      for (const d of devices) {
        this.devices.set(d.id, d);
      }
      logger.info({ count: devices.length }, 'State restored');
    } catch (err) {
      logger.error({ err }, 'Failed to restore state from JSON');
    }
  }
}

export const stateStore = new StateStore();
