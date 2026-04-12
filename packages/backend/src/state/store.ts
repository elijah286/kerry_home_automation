// ---------------------------------------------------------------------------
// StateStore: in-memory device state with Redis persistence
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId } from '@ha/shared';
import { validateDeviceHierarchy } from '@ha/shared';
import { eventBus } from './event-bus.js';
import { logger } from '../logger.js';

function deepEqual(a: DeviceState, b: DeviceState): boolean {
  // Fast path: check commonly-changing fields first
  if (a.type !== b.type) return false;
  if (a.available !== b.available) return false;
  // Exclude lastUpdated/lastChanged — they're regenerated every poll cycle
  const { lastUpdated: _a1, lastChanged: _a2, ...aRest } = a;
  const { lastUpdated: _b1, lastChanged: _b2, ...bRest } = b;
  return JSON.stringify(aRest) === JSON.stringify(bRest);
}

class StateStore {
  private devices = new Map<string, DeviceState>();

  private hierarchyValidated = false;

  update(device: DeviceState): void {
    const prev = this.devices.get(device.id);
    // Preserve user-set fields that integrations don't know about
    if (prev) {
      if (prev.displayName && !device.displayName) device.displayName = prev.displayName;
      if (prev.aliases?.length && !device.aliases?.length) device.aliases = prev.aliases;
      if (prev.userAreaId && !device.userAreaId) device.userAreaId = prev.userAreaId;
      if (prev.type === 'vacuum' && device.type === 'vacuum') {
        if (prev.mapUpdatedAt != null && device.mapUpdatedAt == null) {
          device.mapUpdatedAt = prev.mapUpdatedAt;
        }
      }
    }
    // Validate parent reference exists (if parent should already be registered)
    if (device.parentDeviceId && !this.devices.has(device.parentDeviceId)) {
      logger.warn({ deviceId: device.id, parentDeviceId: device.parentDeviceId },
        'Device references parent that is not yet registered');
    }
    this.devices.set(device.id, device);
    if (!prev || !deepEqual(prev, device)) {
      eventBus.emit('device_updated', { prev, current: device });
    }
  }

  /** Run full hierarchy validation and log any violations. Call after integrations have loaded. */
  validateHierarchy(): string[] {
    const errors = validateDeviceHierarchy(this.getAll());
    for (const err of errors) {
      logger.error({ violation: err }, 'Device hierarchy violation');
    }
    if (errors.length === 0 && !this.hierarchyValidated) {
      logger.info('Device hierarchy validation passed');
    }
    this.hierarchyValidated = true;
    return errors;
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
