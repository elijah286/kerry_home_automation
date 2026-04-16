// ---------------------------------------------------------------------------
// Notification event bus — scoped emitter the WS layer listens to.
//
// Kept separate from the main state event bus so the notification service can
// be reasoned about independently (and later mocked in tests).
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import type { Notification } from '@ha/shared';

type BusEventMap = {
  created: [Notification];
  updated: [Notification];
  removed: [string];
};

class NotificationBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof BusEventMap>(event: K, listener: (...args: BusEventMap[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof BusEventMap>(event: K, ...args: BusEventMap[K]): void {
    this.emitter.emit(event, ...args);
  }
}

export const notificationBus = new NotificationBus();
