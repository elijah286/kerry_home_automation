'use client';

import Link from 'next/link';
import type { BreadcrumbItem } from '@/lib/appBreadcrumbs';
import { useAlert } from './LCARSAlertOverlay';

/**
 * Segmented LCARS breadcrumb trail — each crumb is its own color block (image 3 reference).
 */
export function LCARSBreadcrumbBlocks({
  items,
  navColors,
  textColor = '#000',
  barHeight = 28,
}: {
  items: BreadcrumbItem[];
  navColors: string[];
  textColor?: string;
  /** Matches LCARS primary header row height */
  barHeight?: number;
}) {
  const { alertLevel } = useAlert();
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="lcars-breadcrumb-blocks lcars-chrome-row flex min-w-0 flex-1 items-stretch"
      style={{ gap: 3, height: '100%', minHeight: barHeight, alignSelf: 'stretch' }}
    >
      {items.map((item, i) => {
        const bg =
          alertLevel === 'red' && i === 0
            ? '#ffffff'
            : navColors[i % navColors.length];
        const block = (
          <span
            className="lcars-breadcrumb-segment lcars-chrome-item box-border flex min-w-0 max-w-[min(220px,42vw)] flex-col items-end justify-end px-2.5 pb-1 text-[10px] font-bold uppercase leading-tight tracking-[0.12em]"
            style={{
              height: barHeight,
              minHeight: barHeight,
              background: bg,
              color: textColor,
              fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              borderRadius: 0,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
              ...(alertLevel === 'red' ? { animationDelay: `${i * 0.05}s` } : {}),
            }}
          >
            <span className="max-w-full truncate text-right">{item.label}</span>
          </span>
        );

        return (
          <div
            key={`${item.href}-${i}`}
            className="flex min-w-0 shrink items-stretch self-stretch"
            style={{ height: '100%', minHeight: barHeight }}
          >
            {item.current ? (
              block
            ) : (
              <Link
                href={item.href}
                className="flex min-w-0 shrink items-stretch self-stretch no-underline hover:brightness-110"
                style={{ color: 'inherit', height: '100%' }}
              >
                {block}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
