// ---------------------------------------------------------------------------
// Frontend notification store — feeds the toast/inbox/badge surfaces.
//
// Shape mirrors DeviceStore: a singleton with subscribe/getSnapshot, owned
// references so unrelated re-renders skip via Object.is.
//
// Source of truth is the backend (WS push). REST ack calls are optimistic:
// we patch locally, then let the WS update overwrite on confirmation.
// ---------------------------------------------------------------------------

import type { Notification, NotificationSurface } from '@ha/shared';

type Listener = () => void;

class NotificationStore {
  /** Oldest-first; most-recent-at-end. */
  private byId = new Map<string, Notification>();
  private cachedArray: Notification[] | null = null;
  private listeners = new Set<Listener>();
  /** Ephemeral toast queue — transient surface, separate from inbox ordering. */
  private toastListeners = new Set<(n: Notification) => void>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to new toast events (not inbox updates). */
  subscribeToasts(listener: (n: Notification) => void): () => void {
    this.toastListeners.add(listener);
    return () => this.toastListeners.delete(listener);
  }

  private notify(): void {
    this.cachedArray = null;
    for (const fn of this.listeners) fn();
  }

  private emitToast(n: Notification): void {
    for (const fn of this.toastListeners) fn(n);
  }

  private shouldToast(prev: Notification | undefined, next: Notification): boolean {
    if (!next.surfaces.includes('toast' satisfies NotificationSurface)) return false;
    if (next.state === 'resolved' || next.state === 'archived') return false;
    // Only fire toast on first-seen for this id, or on a severity escalation.
    if (!prev) return true;
    return prev.severity !== next.severity;
  }

  getAll(): Notification[] {
    if (!this.cachedArray) this.cachedArray = [...this.byId.values()];
    return this.cachedArray;
  }

  get(id: string): Notification | undefined {
    return this.byId.get(id);
  }

  replaceAll(next: Notification[]): void {
    this.byId.clear();
    for (const n of next) this.byId.set(n.id, n);
    this.notify();
  }

  upsert(n: Notification): void {
    const prev = this.byId.get(n.id);
    this.byId.set(n.id, n);
    if (this.shouldToast(prev, n)) this.emitToast(n);
    this.notify();
  }

  remove(id: string): void {
    if (this.byId.delete(id)) this.notify();
  }

  /** Optimistic local patch — the WS update will supersede. */
  patch(id: string, patch: Partial<Notification>): void {
    const existing = this.byId.get(id);
    if (!existing) return;
    this.byId.set(id, { ...existing, ...patch });
    this.notify();
  }
}

export const notificationStore = new NotificationStore();
