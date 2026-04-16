'use client';

// ---------------------------------------------------------------------------
// Card palette — modal picker listing every card type the editor can add.
// Hands a freshly-constructed CardDescriptor back to the caller.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { CARD_TYPES, type CardDescriptor, type CardType } from '@ha/shared';
import { CARD_TYPE_LABELS, createCardOfType } from '@/lib/dashboard-editor/card-factory';
import { token } from '@/lib/tokens';

interface CardPaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (card: CardDescriptor) => void;
}

export function CardPalette({ open, onClose, onPick }: CardPaletteProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CARD_TYPES;
    return CARD_TYPES.filter((t) => {
      const meta = CARD_TYPE_LABELS[t];
      return (
        t.includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q)
      );
    });
  }, [query]);

  if (!open) return null;

  const handlePick = (type: CardType) => {
    try {
      const card = createCardOfType(type);
      onPick(card);
    } catch (err) {
      console.error('Failed to construct card', type, err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-lg p-4"
        style={{
          background: token('--color-bg-card'),
          border: `1px solid ${token('--color-border')}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: token('--color-text') }}>
            Add a card
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm"
            style={{ color: token('--color-text-muted') }}
          >
            Close
          </button>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search card types…"
          className="mb-3 w-full rounded px-2 py-1 text-sm"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        />

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
          {filtered.map((t) => {
            const meta = CARD_TYPE_LABELS[t];
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => handlePick(t)}
                  className="w-full rounded p-2 text-left"
                  style={{
                    background: token('--color-bg-secondary'),
                    border: `1px solid ${token('--color-border')}`,
                  }}
                >
                  <div className="text-sm font-medium" style={{ color: token('--color-text') }}>
                    {meta.label}
                  </div>
                  <div className="text-xs" style={{ color: token('--color-text-muted') }}>
                    {meta.description}
                  </div>
                  <div
                    className="mt-1 font-mono text-[10px]"
                    style={{ color: token('--color-text-muted') }}
                  >
                    {t}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
