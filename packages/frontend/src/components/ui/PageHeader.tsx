'use client';

// ---------------------------------------------------------------------------
// Chrome-consistent page header. Pattern matches /settings/page.tsx:
//
//   [← back] [icon chip]  Page title            [actions]
//
// Used by every settings page and dashboard page. Keeps typography, spacing,
// and the accent-tinted icon chip consistent across routes.
// ---------------------------------------------------------------------------

import { createElement, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export interface PageHeaderProps {
  /** Lucide icon component rendered inside the accent-tinted chip. */
  icon: React.ElementType;
  title: string;
  /** Optional subtitle rendered below the title in muted text. */
  subtitle?: string;
  /** href to render a back-arrow button. If omitted, no back control. */
  back?: string;
  /** Optional right-aligned actions (buttons, toggles, etc.). */
  actions?: ReactNode;
}

export function PageHeader({ icon, title, subtitle, back, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {back && (
        <Link
          href={back}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ color: 'var(--color-text-secondary, var(--color-text-muted))' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      )}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
      >
        {createElement(icon, {
          className: 'h-4 w-4',
          style: { color: 'var(--color-accent)' },
        })}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
