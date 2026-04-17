'use client';

// ---------------------------------------------------------------------------
// GroupCard — row / column / grid layout primitive.
//
// The workhorse composition container: `vertical-stack` and `horizontal-stack`
// are conveniences over this. Renders children through the same CardRenderer
// switch, so nesting works automatically.
// ---------------------------------------------------------------------------

import type { CardDescriptor } from '@ha/shared';
import { token } from '@/lib/tokens';
import { CardRenderer } from '../CardRenderer';

type GroupCardDescriptor = {
  type: 'group';
  direction: 'row' | 'column' | 'grid';
  columns?: number;
  square?: boolean;
  gap?: 'none' | 'sm' | 'md' | 'lg';
  children: CardDescriptor[];
  title?: string;
};

const GAP_CLASS: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'gap-0',
  sm:   'gap-2',
  md:   'gap-3',
  lg:   'gap-5',
};

export function GroupCard({ card }: { card: GroupCardDescriptor }) {
  const gap = GAP_CLASS[card.gap ?? 'md'];
  const content = card.children.map((child, i) => {
    const key = child.id ?? `${child.type}-${i}`;
    if (card.direction === 'grid' && card.square) {
      return (
        <div key={key} className="aspect-square min-w-0">
          <CardRenderer card={child} />
        </div>
      );
    }
    if (card.direction === 'row') {
      return (
        <div key={key} className="min-w-0 flex-1">
          <CardRenderer card={child} />
        </div>
      );
    }
    return <CardRenderer key={key} card={child} />;
  });

  // Grid uses inline style rather than a Tailwind arbitrary value so the
  // column count is authored via schema without escape-hatching into
  // class strings the compiler can't see.
  const layoutProps = card.direction === 'grid'
    ? {
        className: `grid ${gap}`,
        style: { gridTemplateColumns: `repeat(${Math.max(1, card.columns ?? 2)}, minmax(0, 1fr))` },
      }
    : card.direction === 'row'
      ? { className: `flex flex-row ${gap}` }
      : { className: `flex flex-col ${gap}` };

  return (
    <div data-card-type="group">
      {card.title && (
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: token('--color-text-secondary') }}
        >
          {card.title}
        </div>
      )}
      <div {...layoutProps}>{content}</div>
    </div>
  );
}
