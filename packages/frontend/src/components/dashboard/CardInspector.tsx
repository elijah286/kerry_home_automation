'use client';

// ---------------------------------------------------------------------------
// Per-card inspector. Structured forms per card type live in `card-forms/`;
// this component is just the header/delete/close chrome around the dispatcher.
// Unsupported card types fall back to a YAML editor automatically (see
// `card-forms/index.tsx`).
// ---------------------------------------------------------------------------

import type { CardDescriptor } from '@ha/shared';
import { token } from '@/lib/tokens';
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
      className="flex flex-col gap-3 rounded p-3"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm" style={{ color: token('--color-text') }}>
          {card.type}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: token('--color-danger') }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: token('--color-text-muted') }}
          >
            Close
          </button>
        </div>
      </div>

      <CardForm card={card} onChange={onChange} />
    </div>
  );
}
