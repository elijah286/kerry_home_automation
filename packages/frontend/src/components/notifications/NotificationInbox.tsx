'use client';

// ---------------------------------------------------------------------------
// Inbox list — scrollable, grouped by severity then recency. Reused by the
// notification-inbox card and by the header popover.
// ---------------------------------------------------------------------------

import type { Notification, SeverityLevel } from '@ha/shared';
import { useNotifications, useNotificationActions, type NotificationFilter } from '@/hooks/useNotifications';
import { token, severityVar } from '@/lib/tokens';

interface NotificationInboxProps {
  title?: string;
  filter?: NotificationFilter;
  maxRows?: number;
}

export function NotificationInbox({ title, filter, maxRows }: NotificationInboxProps) {
  const notifications = useNotifications(filter);
  const capped = maxRows ? notifications.slice(0, maxRows) : notifications;
  const { acknowledge } = useNotificationActions();

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-component="notification-inbox"
    >
      {title && (
        <h3 className="text-sm font-semibold" style={{ color: token('--color-text') }}>
          {title}
        </h3>
      )}
      {capped.length === 0 ? (
        <p className="text-xs" style={{ color: token('--color-text-muted') }}>
          No notifications.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" role="list">
          {capped.map((n) => (
            <InboxRow key={n.id} n={n} onAcknowledge={() => acknowledge(n.id)} />
          ))}
        </ul>
      )}
      {maxRows && notifications.length > maxRows && (
        <p className="text-xs" style={{ color: token('--color-text-muted') }}>
          +{notifications.length - maxRows} more…
        </p>
      )}
    </div>
  );
}

function InboxRow({ n, onAcknowledge }: { n: Notification; onAcknowledge: () => void }) {
  const dim = n.state === 'resolved' || n.state === 'acknowledged';
  return (
    <li
      className="flex items-start gap-2 rounded px-2 py-1.5 text-sm"
      style={{
        background: token('--color-bg-secondary'),
        borderLeft: `3px solid ${severityVar(n.severity)}`,
        opacity: dim ? 0.6 : 1,
      }}
      data-state={n.state}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {n.icon && <span aria-hidden>{n.icon}</span>}
          <span className="truncate font-medium" style={{ color: token('--color-text') }}>
            {n.title}
          </span>
          <span
            className="ml-auto shrink-0 text-[10px] uppercase tracking-wider"
            style={{ color: severityVar(n.severity) }}
          >
            {n.severity}
          </span>
        </div>
        {n.body && (
          <p className="mt-0.5 text-xs" style={{ color: token('--color-text-muted') }}>
            {n.body}
          </p>
        )}
        <p className="mt-0.5 text-[10px]" style={{ color: token('--color-text-muted') }}>
          {formatRelative(n.createdAt)}
        </p>
      </div>
      {!dim && (
        <button
          type="button"
          onClick={onAcknowledge}
          className="shrink-0 rounded px-2 py-0.5 text-xs"
          style={{
            background: token('--color-bg-card'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          Ack
        </button>
      )}
    </li>
  );
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// Re-export SeverityLevel so card consumers don't need a second import.
export type { SeverityLevel };
