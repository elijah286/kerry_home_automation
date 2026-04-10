// ---------------------------------------------------------------------------
// Typed event bus
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import type { DeviceState, IntegrationId, IntegrationHealth, DeviceCommand } from '@ha/shared';

interface DeviceUpdatedEvent {
  prev: DeviceState | undefined;
  current: DeviceState;
}

interface DeviceRemovedEvent {
  deviceId: string;
}

interface IntegrationHealthEvent {
  id: IntegrationId;
  health: IntegrationHealth;
}

type EventMap = {
  device_updated: [DeviceUpdatedEvent];
  device_removed: [DeviceRemovedEvent];
  integration_health: [IntegrationHealthEvent];
  command: [DeviceCommand];
};

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    this.emitter.emit(event, ...args);
  }
}

export const eventBus = new TypedEventBus();
