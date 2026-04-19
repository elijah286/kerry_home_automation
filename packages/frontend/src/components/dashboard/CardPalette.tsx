'use client';

// ---------------------------------------------------------------------------
// Card palette — modal picker listing every card type the editor can add.
// Hands a freshly-constructed CardDescriptor back to the caller.
//
// Uses Radix Dialog so the overlay + escape handling come for free and match
// the rest of the chrome. The "native select forbidden" rule only applies to
// dropdowns, not full-screen pickers, which is why this is a grid.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { CARD_TYPES, type CardDescriptor, type CardType, type DeviceState } from '@ha/shared';
import { CARD_TYPE_LABELS, createCardOfType } from '@/lib/dashboard-editor/card-factory';
import { Input } from '@/components/ui/Input';
import { GhostIconButton } from '@/components/ui/Button';

interface CardPaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (card: CardDescriptor) => void;
  devices?: DeviceState[];
}

export function CardPalette({ open, onClose, onPick, devices }: CardPaletteProps) {
  const [query, setQuery] = useState('');

  // Reset the search box each time the palette opens so previous queries
  // don't persist across unrelated add-card intents.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

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

  const handlePick = (type: CardType) => {
    try {
      const card = createCardOfType(type, devices);
      onPick(card);
    } catch (err) {
      console.error('Failed to construct card', type, err);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius)] p-5 shadow-2xl focus:outline-none"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            maxHeight: 'calc(100vh - 4rem)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Dialog.Title
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              Add a card
            </Dialog.Title>
            <Dialog.Close asChild>
              <GhostIconButton icon={X} aria-label="Close palette" />
            </Dialog.Close>
          </div>

          <Input
            type="search"
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search card types…"
            className="mb-3"
            autoFocus
          />

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
            {filtered.map((t) => {
              const meta = CARD_TYPE_LABELS[t];
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => handlePick(t)}
                    className="w-full rounded-lg p-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      {meta.label}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {meta.description}
                    </div>
                    <div
                      className="mt-1 font-mono text-[10px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {t}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
