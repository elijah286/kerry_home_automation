'use client';

// ---------------------------------------------------------------------------
// Collapsible — tiny accordion-style section used on the device detail page.
//
// Matches the visual rhythm of <Card> (same border, same radius) so a pair
// of collapsed sections underneath the default card panel read as siblings
// rather than nested boxes. Uses a CSS grid template-rows trick for a smooth
// open/close animation that respects prefers-reduced-motion.
// ---------------------------------------------------------------------------

import { type ReactNode, useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional controls rendered at the right side of the header row. */
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Collapsible({
  title,
  subtitle,
  action,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div
      className="rounded-[var(--radius)]"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform"
            style={{
              color: 'var(--color-text-muted)',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                className="text-xs mt-0.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="px-4 pb-4 pt-1"
            style={{ borderTop: open ? '1px solid var(--color-border)' : 'none' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
