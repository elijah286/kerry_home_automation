'use client';

// ---------------------------------------------------------------------------
// Alert banner — inline card surfacing the single most important active
// notification that matches the filter. If `notificationId` is set, binds
// to that specific row; otherwise picks the highest-severity match.
// ---------------------------------------------------------------------------

import type { AlertBannerCard as AlertBannerCardDescriptor } from '@ha/shared';
import {
  useNotification,
  useNotifications,
  useNotificationActions,
} from '@/hooks/useNotifications';
import { token, severityVar } from '@/lib/tokens';

export function AlertBannerCard({ card }: { card: AlertBannerCardDescriptor }) {
  const filter = {
    minSeverity: card.filter?.minSeverity,
    categories: card.filter?.categories,
    includeResolved: false,
  };
  const bound = useNotification(card.notificationId);
  const list = useNotifications(filter);
  const { acknowledge } = useNotificationActions();

  // Prefer the explicitly bound notification when it's still active.
  const active = card.notificationId
    ? (bound && bound.state !== 'resolved' && bound.state !== 'archived' ? bound : undefined)
    : list[0];

  if (!active) {
    if (card.hideWhenEmpty) return null;
    const severity = card.filter?.minSeverity ?? 'info';
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
        style={{
          background: token('--color-bg-card'),
          color: token('--color-text-muted'),
          borderLeft: `4px solid ${severityVar(severity)}`,
          border: `1px solid ${token('--color-border')}`,
        }}
        data-card-type="alert-banner"
        data-empty
      >
        <span aria-hidden>✓</span>
        <span className="flex-1">All clear.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        borderLeft: `4px solid ${severityVar(active.severity)}`,
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="alert-banner"
      data-severity={active.severity}
    >
      <span aria-hidden className="mt-0.5">{active.icon ?? 'ⓘ'}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{active.title}</span>
        {active.body && (
          <span className="text-xs" style={{ color: token('--color-text-muted') }}>
            {active.body}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => acknowledge(active.id)}
        className="shrink-0 rounded px-2 py-0.5 text-xs"
        style={{
          background: token('--color-bg-secondary'),
          color: token('--color-text'),
          border: `1px solid ${token('--color-border')}`,
        }}
      >
        Ack
      </button>
    </div>
  );
}
