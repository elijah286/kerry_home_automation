// ---------------------------------------------------------------------------
// Notification service — façade over store + bus.
//
// Anything inside the backend (automations, integrations, the pool/vacuum
// coordinators) that wants to post a user-visible notification calls into
// `notificationService.publish(...)`. The surface side-effects (WS broadcast,
// inbox persistence) are handled here — callers stay simple.
// ---------------------------------------------------------------------------

import type {
  CreateNotificationRequest,
  Notification,
  NotificationLifecycle,
} from '@ha/shared';
import * as store from './store.js';
import { notificationBus } from './bus.js';

export interface PublishResult {
  notification: Notification;
  /** False when an existing notification was updated via dedupeKey. */
  isNew: boolean;
}

export const notificationService = {
  async list(): Promise<Notification[]> {
    return store.list();
  },

  async get(id: string): Promise<Notification | undefined> {
    return store.get(id);
  },

  async publish(req: CreateNotificationRequest): Promise<PublishResult> {
    const { notification, isNew } = await store.create(req);
    notificationBus.emit(isNew ? 'created' : 'updated', notification);
    return { notification, isNew };
  },

  async setState(id: string, state: NotificationLifecycle): Promise<Notification | null> {
    const n = await store.setState(id, state);
    if (n) notificationBus.emit('updated', n);
    return n;
  },

  async acknowledge(id: string, userId: string): Promise<Notification | null> {
    const n = await store.acknowledge(id, userId);
    if (n) notificationBus.emit('updated', n);
    return n;
  },

  async markSeen(id: string): Promise<Notification | null> {
    const n = await store.markSeen(id);
    if (n) notificationBus.emit('updated', n);
    return n;
  },

  async remove(id: string): Promise<boolean> {
    const removed = await store.remove(id);
    if (removed) notificationBus.emit('removed', id);
    return removed;
  },

  /** Called on an interval to auto-resolve expired and drop old resolved rows. */
  async sweep(): Promise<void> {
    const removed = await store.sweep();
    for (const n of removed) notificationBus.emit('removed', n.id);
  },
};

/** Start the periodic sweep. Called from main.ts. */
export function startNotificationSweeper(intervalMs = 60_000): () => void {
  const handle = setInterval(() => {
    void notificationService.sweep();
  }, intervalMs);
  // Don't block process shutdown on this timer.
  if (typeof handle.unref === 'function') handle.unref();
  return () => clearInterval(handle);
}
