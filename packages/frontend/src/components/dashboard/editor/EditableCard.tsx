'use client';

// ---------------------------------------------------------------------------
// EditableCard — one card in the editor preview.
//
// Owns:
//   - the click-to-select / drag-to-reorder overlay
//   - the selected/hovered visual affordances (ring, drag handle)
//   - a Radix Dialog hosting the CardForm (center-stage, ~900px) — big enough
//     to surface the per-type option sets (size, controls, presets…) that
//     Home Assistant exposes for each card. The earlier ~380px Popover was
//     too cramped to edit anything beyond name/entity.
//
// The dialog is `modal={false}` so the live preview underneath still updates
// visibly as the user edits; Escape and outside-clicks route through
// `onOpenChange(false)` which clears the selection in the parent.
// ---------------------------------------------------------------------------

import { type DragEvent } from 'react';
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
  /**
   * Called while another card is hovering over this one. The `half` tells
   * the caller whether the pointer is in the top or bottom half, so it can
   * compute a drop-index (insert before = top, insert after = bottom).
   *
   * Without this, only the tiny 2–8px DropZones between cards could accept
   * drops. That's easy to miss on tall cards (e.g. the thermostat tile),
   * which is why some card types felt undraggable.
   */
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
  // Decide whether the pointer is in the top or bottom half of the card,
  // from a drag event. Used to pick between "insert before" / "insert after"
  // when hovering a tall target card.
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
        {/* Click overlay — captures selection before interactive controls
            inside the card fire. In editor mode the live card controls are
            purely presentational (pointer-events disabled below), so this
            is the sole click target. */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit ${card.type} card`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          className="absolute inset-0 z-10 rounded-[var(--radius)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(e);
          }}
          onDragEnd={onDragEnd}
          style={{ cursor: 'grab' }}
        />

        {/* Hover chrome: drag handle. Grows on hover, stays on when selected. */}
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
            <GripVertical
              className="h-3.5 w-3.5"
              style={{ color: 'var(--color-text-muted)' }}
              aria-hidden
            />
          </div>
        </div>

        {/* The actual rendered card. Pointer-events off so the editor's
            click overlay (above) is what handles mouse events. */}
        <div className="pointer-events-none">
          <CardRenderer card={card} />
        </div>
      </div>

      {/* Edit Dialog — large, center-stage, non-modal so the live preview
          underneath keeps updating as the user edits. */}
      <Dialog.Root
        open={selected}
        onOpenChange={(open) => {
          if (!open) onDeselect();
        }}
        modal={false}
      >
        <Dialog.Portal>
          {/* Dimmed backdrop. pointer-events disabled so clicks on other
              cards in the preview still re-anchor selection without closing
              first — that was the original Popover behaviour we want to keep. */}
          <Dialog.Overlay
            className="fixed inset-0 z-40 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.35)' }}
          />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Clicking another card should re-anchor, not close-then-reopen.
              // The parent will flip selection; we just don't fight it here.
              const target = e.target as HTMLElement | null;
              if (target?.closest('[data-card-id]')) e.preventDefault();
            }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(calc(100vh-4rem),720px)] w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius)] shadow-2xl focus:outline-none"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="flex items-center justify-between gap-2 px-5 py-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Dialog.Title
                  className="text-base font-semibold"
                  style={{ color: 'var(--color-text)' }}
                >
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
                <GhostIconButton
                  icon={Trash2}
                  tone="danger"
                  aria-label="Delete card"
                  onClick={onDelete}
                />
                <Dialog.Close asChild>
                  <GhostIconButton icon={X} aria-label="Close editor" />
                </Dialog.Close>
              </div>
            </div>

            {/* Two-pane body: form on the left, live preview on the right.
                On narrow widths we stack the preview below. */}
            <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
              <div className="min-h-0 overflow-y-auto p-5">
                <CardForm card={card} onChange={onChange} />
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
                  <CardRenderer card={card} />
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
