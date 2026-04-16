'use client';

// ---------------------------------------------------------------------------
// Toast surface — mounted once near the root. Subscribes to notificationStore
// toast events and manages the transient on-screen queue.
//
// Positioning: bottom-right on desktop, top-center on mobile (thumb-free zone
// in kiosk mode). A single stack, newest-on-top, capped at 3 visible at once.
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback } from 'react';
import type { Notification } from '@ha/shared';
import { notificationStore } from '@/lib/notifications/store';
import { useNotificationActions } from '@/hooks/useNotifications';
import { token, severityVar } from '@/lib/tokens';

interface ToastEntry {
  id: string;         // notification id
  key: string;        // unique key (id + trigger count) so re-trigger re-animates
  notification: Notification;
  expiresAt: number;  // Date.now() + ttl
}

const MAX_VISIBLE = 3;

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const { acknowledge } = useNotificationActions();

  useEffect(() => {
    const unsub = notificationStore.subscribeToasts((n) => {
      setToasts((prev) => {
        // Drop any older entry for the same id so we don't show duplicates.
        const filtered = prev.filter((t) => t.id !== n.id);
        const entry: ToastEntry = {
          id: n.id,
          key: `${n.id}-${Date.now()}`,
          notification: n,
          expiresAt: n.toastTtlMs > 0 ? Date.now() + n.toastTtlMs : Number.POSITIVE_INFINITY,
        };
        return [entry, ...filtered].slice(0, MAX_VISIBLE);
      });
    });
    return unsub;
  }, []);

  // Timed auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0) return;
    const nextExpiry = Math.min(...toasts.map((t) => t.expiresAt));
    if (!Number.isFinite(nextExpiry)) return;
    const delay = Math.max(0, nextExpiry - Date.now());
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.expiresAt > Date.now()));
    }, delay);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleAcknowledge = useCallback(async (id: string) => {
    dismiss(id);
    await acknowledge(id);
  }, [acknowledge, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 flex flex-col gap-2"
      style={{
        top: 'env(safe-area-inset-top, 0)',
        right: '1rem',
        left: 'auto',
        bottom: 'auto',
        maxWidth: 'min(400px, calc(100vw - 2rem))',
      }}
      data-toast-region
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.key}
          toast={t}
          onDismiss={() => dismiss(t.id)}
          onAcknowledge={() => handleAcknowledge(t.id)}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: () => void;
  onAcknowledge: () => void;
}

function ToastItem({ toast, onDismiss, onAcknowledge }: ToastItemProps) {
  const { notification: n } = toast;
  return (
    <div
      role="alert"
      className="pointer-events-auto flex min-w-0 gap-3 rounded-lg px-3 py-2 text-sm shadow-lg"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        borderLeft: `4px solid ${severityVar(n.severity)}`,
      }}
      data-severity={n.severity}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          {n.icon && <span aria-hidden>{n.icon}</span>}
          <span className="truncate font-medium">{n.title}</span>
        </div>
        {n.body && (
          <p className="mt-0.5 text-xs" style={{ color: token('--color-text-muted') }}>
            {n.body}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAcknowledge}
          className="rounded px-2 py-0.5 text-xs"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
          }}
        >
          OK
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded px-1 text-xs leading-none"
          style={{ color: token('--color-text-muted') }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
