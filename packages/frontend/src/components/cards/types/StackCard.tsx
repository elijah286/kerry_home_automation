'use client';

import type { CardDescriptor } from '@ha/shared';
import { CardRenderer } from '../CardRenderer';

type StackCardDescriptor = {
  type: 'vertical-stack' | 'horizontal-stack';
  gap?: 'none' | 'sm' | 'md' | 'lg';
  children: CardDescriptor[];
};

const GAP_CLASS: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-5',
};

export function VerticalStackCard({ card }: { card: StackCardDescriptor }) {
  return (
    <div className={`flex flex-col ${GAP_CLASS[card.gap ?? 'md']}`} data-card-type="vertical-stack">
      {card.children.map((child, i) => <CardRenderer key={cardKey(child, i)} card={child} />)}
    </div>
  );
}

export function HorizontalStackCard({ card }: { card: StackCardDescriptor }) {
  return (
    <div className={`flex flex-row ${GAP_CLASS[card.gap ?? 'md']}`} data-card-type="horizontal-stack">
      {card.children.map((child, i) => (
        <div key={cardKey(child, i)} className="flex-1 min-w-0">
          <CardRenderer card={child} />
        </div>
      ))}
    </div>
  );
}

function cardKey(child: CardDescriptor, i: number): string {
  return child.id ?? `${child.type}-${i}`;
}
