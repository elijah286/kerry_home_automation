import { EventEmitter } from 'node:events';
import type {
  BusEvent,
  StateChangedEvent,
  ServiceCallEvent,
  CommandEvent,
  ModeChangedEvent,
  PresenceChangedEvent,
  LightNeedChangedEvent,
} from '@home-automation/shared';
import { logger } from '../logger.js';

type EventMap = {
  state_changed: [StateChangedEvent];
  service_call: [ServiceCallEvent];
  command: [CommandEvent];
  mode_changed: [ModeChangedEvent];
  presence_changed: [PresenceChangedEvent];
  light_need_changed: [LightNeedChangedEvent];
  '*': [BusEvent];
};

class TypedEventBus {
  private emitter = new EventEmitter();
  private eventCount = 0;

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    this.eventCount++;
    this.emitter.emit(event, ...args);
    if (event !== '*') {
      this.emitter.emit('*', ...args);
    }
  }

  get stats() {
    return {
      eventCount: this.eventCount,
      listenerCount: this.emitter.listenerCount('*'),
    };
  }
}

export const eventBus = new TypedEventBus();
export { logger };
