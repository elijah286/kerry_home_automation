'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { getBreadcrumbItems, type BreadcrumbItem } from '@/lib/appBreadcrumbs';
import { AppVersionLabel } from './AppVersionLabel';
import { AssistantHeaderButton } from '../ChatBot';

function Separator({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={clsx('h-3.5 w-3.5 shrink-0 opacity-45', className)}
      aria-hidden
    />
  );
}

export function BreadcrumbTrail({
  items,
  variant = 'default',
  lcarsTextColor,
}: {
  items: BreadcrumbItem[];
  variant?: 'default' | 'lcars';
  /** LCARS header: pass `colors.text` for consistent chrome */
  lcarsTextColor?: string;
}) {
  const isLcars = variant === 'lcars';

  return (
    <nav aria-label="Breadcrumb" className={clsx('min-w-0', isLcars && 'lcars-breadcrumb-nav')}>
      <ol
        className={clsx(
          'flex list-none flex-wrap items-center gap-x-1 gap-y-0.5 m-0 p-0 text-sm',
          isLcars && 'uppercase tracking-[0.1em]',
        )}
        style={
          isLcars
            ? {
                color: lcarsTextColor,
                fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
                fontWeight: 700,
                fontSize: 14,
              }
            : undefined
        }
      >
        {items.map((item, i) => (
          <li key={`${item.href}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <Separator
                className={isLcars ? 'opacity-55' : 'text-[var(--color-text-muted)]'}
              />
            )}
            {item.current ? (
              <span
                className={clsx(
                  'min-w-0 truncate',
                  !isLcars && 'font-medium text-[var(--color-text)]',
                )}
                aria-current="page"
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={clsx(
                  'min-w-0 truncate transition-colors',
                  isLcars
                    ? 'hover:opacity-90'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]',
                )}
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Sticky top bar with route breadcrumbs (non-LCARS shell). LCARS uses the same
 * trail inside `LCARSFrame` so themes can style `.lcars-breadcrumb-nav`.
 */
export function AppHeaderBar() {
  const pathname = usePathname();
  const items = getBreadcrumbItems(pathname ?? '/');

  return (
    <header
      className="app-header-bar sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4 md:px-5"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      <BreadcrumbTrail items={items} variant="default" />
      <div className="flex shrink-0 items-center gap-2">
        <AssistantHeaderButton variant="default" />
        <AppVersionLabel />
      </div>
    </header>
  );
}
