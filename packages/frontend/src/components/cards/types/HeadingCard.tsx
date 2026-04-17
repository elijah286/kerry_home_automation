'use client';

import type { HeadingCard as HeadingCardDescriptor } from '@ha/shared';
import { token } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';

const STYLE_MAP: Record<HeadingCardDescriptor['style'], { tag: 'h1' | 'h2' | 'h3'; className: string }> = {
  title:    { tag: 'h2', className: 'text-xl font-semibold' },
  subtitle: { tag: 'h3', className: 'text-base font-medium' },
  caption:  { tag: 'h3', className: 'text-xs uppercase tracking-wide' },
};

export function HeadingCard({ card }: { card: HeadingCardDescriptor }) {
  const { tag: Tag, className } = STYLE_MAP[card.style];
  return (
    <Tag
      className={className}
      style={{ color: card.style === 'caption' ? token('--color-text-muted') : token('--color-text') }}
    >
      {card.icon && (
        <IconGlyph
          name={card.icon}
          size={card.style === 'title' ? 22 : card.style === 'subtitle' ? 18 : 14}
          className="mr-2 inline-block align-text-bottom"
        />
      )}
      {card.text}
    </Tag>
  );
}
