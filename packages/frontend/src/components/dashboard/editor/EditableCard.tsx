'use client';

import { useEffect, useState, type DragEvent } from 'react';
import { GripVertical, Trash2, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import type { CardDescriptor } from '@ha/shared';
import { CardRenderer } from '@/components/cards';
import { CARD_TYPE_LABELS } from '@/lib/dashboard-editor/card-factory';
import { CardForm } from '../card-forms';
import { GhostIconButton } from '@/components/ui/Button';

interface EditableCardProps {
  card: CardDescriptor;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onChange: (card: CardDescriptor) => void;
  onDelete: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOverCard?: (half: 'top' | 'bottom') => void;
  onDropOverCard?: (half: 'top' | 'bottom') => void;
}

export function EditableCard({
  card,
  selected,
  dragging,
  onSelect,
  onDeselect,
  onChange,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOverCard,
}: EditableCardProps) {
  const [draft, setDraft] = useState<CardDescriptor>(card);

  // Reset draft to the committed card each time the dialog opens.
  // Intentionally excludes `card` from deps — we only want to reset on open,
  // not on every external card update while the dialog is already showing.
  useEffect(() => {
    if (selected) setDraft(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleSave = () => {
    onChange(draft);
    onDeselect();
  };

  const halfFromDragEvent = (e: DragEvent<HTMLDivElement>): 'top' | 'bottom' => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom';
  };

  const typeLabel = CARD_TYPE_LABELS[card.type]?.label ?? card.type;

  return (
    <>
      <div
        className="group relative rounded-[var(--radius)] transition-all"
        style={{
          outline: selected ? '2px solid var(--color-accent)' : '2px solid transparent',
          outlineOffset: 2,
          opacity: dragging ? 0.4 : 1,
        }}
        data-card-id={card.id ?? card.type}
        onDragOver={(e) => {
          if (!onDragOverCard) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOverCard(halfFromDragEvent(e));
        }}
        onDrop={(e) => {
          if (!onDropOverCard) return;
          e.preventDefault();
          onDropOverCard(halfFromDragEvent(e));
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit ${card.type} card`}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
          }}
          className="absolute inset-0 z-10 rounded-[var(--radius)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(e); }}
          onDragEnd={onDragEnd}
          style={{ cursor: 'grab' }}
        />

        <div
          className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ opacity: selected ? 1 : undefined }}
        >
          <div
            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
              border: '1px solid var(--color-border)',
            }}
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} aria-hidden />
          </div>
        </div>

        <div className="pointer-events-none">
          <CardRenderer card={card} />
        </div>
      </div>

      <Dialog.Root
        open={selected}
        onOpenChange={(open) => { if (!open) onDeselect(); }}
        modal={false}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-40 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.35)' }}
          />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest('[data-card-id]')) e.preventDefault();
            }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(calc(100vh-4rem),720px)] w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius)] shadow-2xl focus:outline-none"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between gap-2 px-5 py-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Dialog.Title className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                  Edit {typeLabel.toLowerCase()} card
                </Dialog.Title>
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
                <GhostIconButton icon={Trash2} tone="danger" aria-label="Delete card" onClick={onDelete} />
                <GhostIconButton icon={X} aria-label="Cancel" onClick={onDeselect} />
              </div>
            </div>

            {/* Body: form left, live preview right */}
            <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
              <div className="min-h-0 overflow-y-auto p-5">
                <CardForm card={draft} onChange={setDraft} />
              </div>
              <div
                className="hidden min-h-0 overflow-y-auto p-5 md:block"
                style={{
                  borderLeft: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                }}
              >
                <div
                  className="mb-2 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Preview
                </div>
                <div className="pointer-events-none">
                  <CardRenderer card={draft} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <button
                type="button"
                onClick={onDeselect}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
