'use client';

// ---------------------------------------------------------------------------
// Per-card inspector. Structured forms per card type live in `card-forms/`;
// this component is just the header/delete/close chrome around the dispatcher.
// Unsupported card types fall back to a YAML editor automatically (see
// `card-forms/index.tsx`).
// ---------------------------------------------------------------------------

import type { CardDescriptor } from '@ha/shared';
import { Trash2, X } from 'lucide-react';
import { GhostIconButton } from '@/components/ui/Button';
import { CardForm } from './card-forms';

interface CardInspectorProps {
  card: CardDescriptor;
  onChange: (next: CardDescriptor) => void;
  onClose: () => void;
  onDelete: () => void;
}

export function CardInspector({ card, onChange, onClose, onDelete }: CardInspectorProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius)] p-4"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            Edit card
          </span>
          <span
            className="rounded-md px-2 py-0.5 font-mono text-[11px]"
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {card.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <GhostIconButton
            icon={Trash2}
            tone="danger"
            aria-label="Delete card"
            onClick={onDelete}
          />
          <GhostIconButton
            icon={X}
            aria-label="Close inspector"
            onClick={onClose}
          />
        </div>
      </div>

      <CardForm card={card} onChange={onChange} />
    </div>
  );
}
