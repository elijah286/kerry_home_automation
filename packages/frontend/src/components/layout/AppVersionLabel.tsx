'use client';

import Link from 'next/link';
import { APP_VERSION_LABEL } from '@/lib/appVersion';

const VERSION_HREF = '/settings/software-update';

export function AppVersionLabel({
  variant = 'default',
  lcarsTextColor,
}: {
  variant?: 'default' | 'lcars';
  lcarsTextColor?: string;
}) {
  if (variant === 'lcars') {
    return (
      <Link
        href={VERSION_HREF}
        className="shrink-0 rounded-sm outline-none ring-offset-2 ring-offset-black transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{
          color: lcarsTextColor,
          fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.08em',
          opacity: 0.88,
        }}
        title="Software update"
      >
        {APP_VERSION_LABEL}
      </Link>
    );
  }

  return (
    <Link
      href={VERSION_HREF}
      className="shrink-0 text-[11px] tabular-nums tracking-tight text-[var(--color-text-muted)] underline-offset-2 transition-colors hover:text-[var(--color-text)] hover:underline"
      title="Software update"
    >
      {APP_VERSION_LABEL}
    </Link>
  );
}
