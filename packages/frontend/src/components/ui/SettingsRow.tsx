'use client';

// ---------------------------------------------------------------------------
// Chrome-consistent drill-down row. Pattern matches settings/page.tsx:
//
//   [icon-chip]  Label                          [extras]  [chevron]
//                Description
//
// Rows compose inside a `rounded-[var(--radius)] border overflow-hidden`
// container; separators are drawn inline by SettingsRowGroup below.
// ---------------------------------------------------------------------------

import { createElement, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface SettingsRowProps {
  icon?: React.ElementType;
  label: string;
  description?: string;
  /** Right-aligned controls rendered *before* the chevron (e.g. toggle, badge). */
  extras?: ReactNode;
  /** Click handler for the row. When omitted, the row is non-interactive and hides the chevron. */
  onClick?: () => void;
  /** Suppress the right-side chevron even if onClick is set. */
  hideChevron?: boolean;
  /** Optional right-side href for Link-based navigation; prefer onClick with router.push. */
  ariaLabel?: string;
}

export function SettingsRow({
  icon,
  label,
  description,
  extras,
  onClick,
  hideChevron,
  ariaLabel,
}: SettingsRowProps) {
  const interactive = !!onClick;
  const Root = interactive ? 'button' : 'div';
  return (
    <Root
      {...(interactive ? { type: 'button' as const, onClick, 'aria-label': ariaLabel ?? label } : {})}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${interactive ? 'hover:bg-[var(--color-bg-hover)]' : ''}`}
    >
      {icon && (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          {createElement(icon, {
            className: 'h-3.5 w-3.5',
            style: { color: 'var(--color-accent)' },
          })}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {label}
        </p>
        {description && (
          <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {extras && <div className="flex shrink-0 items-center gap-1">{extras}</div>}
      {interactive && !hideChevron && (
        <ChevronRight
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
          aria-hidden
        />
      )}
    </Root>
  );
}

/** Container that wraps rows in the chrome card + draws inter-row separators. */
export function SettingsRowGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {title && (
        <p
          className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {title}
        </p>
      )}
      <div
        className="divide-y overflow-hidden rounded-[var(--radius)] border"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        {children}
      </div>
    </div>
  );
}
