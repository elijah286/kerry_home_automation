'use client';

import { APP_VERSION_LABEL } from '@/lib/appVersion';

export function AppVersionLabel({
  variant = 'default',
  lcarsTextColor,
}: {
  variant?: 'default' | 'lcars';
  lcarsTextColor?: string;
}) {
  if (variant === 'lcars') {
    return (
      <span
        style={{
          color: lcarsTextColor,
          fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.08em',
          opacity: 0.88,
        }}
      >
        {APP_VERSION_LABEL}
      </span>
    );
  }

  return (
    <span className="shrink-0 text-[11px] tabular-nums tracking-tight text-[var(--color-text-muted)]">
      {APP_VERSION_LABEL}
    </span>
  );
}
