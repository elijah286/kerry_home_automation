'use client';

// ---------------------------------------------------------------------------
// Notification count badge. Default is a pip with the active count; pass
// `showZero` to render a blank pill instead of nothing when there's no
// activity (useful for the header bell).
// ---------------------------------------------------------------------------

import type { SeverityLevel } from '@ha/shared';
import { useNotificationCount } from '@/hooks/useNotifications';
import { token, severityVar } from '@/lib/tokens';

interface NotificationBadgeProps {
  minSeverity?: SeverityLevel;
  showZero?: boolean;
  /** Max count before showing `99+`. */
  maxCount?: number;
}

export function NotificationBadge({
  minSeverity = 'info',
  showZero = false,
  maxCount = 99,
}: NotificationBadgeProps) {
  const count = useNotificationCount(minSeverity);
  if (count === 0 && !showZero) return null;

  const display = count > maxCount ? `${maxCount}+` : String(count);

  return (
    <span
      className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        background: count > 0 ? severityVar(minSeverity) : token('--color-bg-secondary'),
        color: count > 0 ? token('--color-bg') : token('--color-text-muted'),
      }}
      aria-label={`${count} notifications`}
      data-count={count}
    >
      {display}
    </span>
  );
}
