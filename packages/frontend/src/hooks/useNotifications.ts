'use client';

// ---------------------------------------------------------------------------
// Notification hooks — fine-grained subscriptions to the NotificationStore.
//
// `useNotifications()` returns a filtered slice (severity/category/resolved).
// `useNotification(id)` watches a single row for the alert banner card.
// `useNotificationCount()` returns just the badge count (doesn't re-render on
// every body change).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Notification, SeverityLevel } from '@ha/shared';
import { notificationStore } from '@/lib/notifications/store';
import { ensureWsConnected } from '@/hooks/useWebSocket';
import {
  acknowledgeNotification,
  markNotificationSeen,
} from '@/lib/notifications/api';

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  success: 0,
  info: 1,
  warning: 2,
  critical: 3,
};

export interface NotificationFilter {
  minSeverity?: SeverityLevel;
  categories?: string[];
  includeResolved?: boolean;
}

function matchesFilter(n: Notification, f: NotificationFilter | undefined): boolean {
  if (!f) return n.state !== 'archived';
  if (!f.includeResolved && (n.state === 'resolved' || n.state === 'archived')) return false;
  if (f.minSeverity && SEVERITY_RANK[n.severity] < SEVERITY_RANK[f.minSeverity]) return false;
  if (f.categories && f.categories.length > 0 && !f.categories.includes(n.category)) return false;
  return true;
}

function sortForInbox(a: Notification, b: Notification): number {
  // Critical first, then newest first.
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function sameRefs(a: Notification[], b: Notification[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useNotifications(filter?: NotificationFilter): Notification[] {
  useEffect(() => { ensureWsConnected(); }, []);
  const filterKey = JSON.stringify(filter ?? {});
  const cacheRef = useRef<{ key: string; value: Notification[] }>({ key: '', value: [] });

  return useSyncExternalStore(
    (cb) => notificationStore.subscribe(cb),
    () => {
      const all = notificationStore.getAll();
      const filtered = all.filter((n) => matchesFilter(n, filter)).sort(sortForInbox);
      // Preserve reference identity across calls when the set is unchanged —
      // prevents downstream memo busts.
      if (cacheRef.current.key === filterKey && sameRefs(cacheRef.current.value, filtered)) {
        return cacheRef.current.value;
      }
      cacheRef.current = { key: filterKey, value: filtered };
      return filtered;
    },
    () => [] as Notification[],
  );
}

export function useNotification(id: string | undefined): Notification | undefined {
  useEffect(() => { ensureWsConnected(); }, []);
  return useSyncExternalStore(
    (cb) => notificationStore.subscribe(cb),
    () => (id ? notificationStore.get(id) : undefined),
    () => undefined,
  );
}

/** Active (non-resolved, non-archived) count at or above a severity floor. */
export function useNotificationCount(minSeverity: SeverityLevel = 'info'): number {
  useEffect(() => { ensureWsConnected(); }, []);
  return useSyncExternalStore(
    (cb) => notificationStore.subscribe(cb),
    () => {
      const all = notificationStore.getAll();
      let count = 0;
      for (const n of all) {
        if (n.state === 'resolved' || n.state === 'archived') continue;
        if (SEVERITY_RANK[n.severity] < SEVERITY_RANK[minSeverity]) continue;
        count++;
      }
      return count;
    },
    () => 0,
  );
}

export function useNotificationActions() {
  return useMemo(
    () => ({
      acknowledge: async (id: string) => {
        // Optimistic: patch locally so the inbox collapses the row right away.
        notificationStore.patch(id, { state: 'acknowledged' });
        try {
          await acknowledgeNotification(id);
        } catch (err) {
          // WS will ship the authoritative state anyway; just log.
          console.warn('Failed to acknowledge notification', id, err);
        }
      },
      markSeen: async (id: string) => {
        try { await markNotificationSeen(id); } catch { /* soft op */ }
      },
    }),
    [],
  );
}
