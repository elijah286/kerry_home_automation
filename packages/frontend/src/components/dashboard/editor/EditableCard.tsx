'use client';

// ---------------------------------------------------------------------------
// EditableCard — one card in the editor preview.
//
// Owns:
//   - the Radix Popover.Root anchored to the card, hosting the CardForm
//   - the click-to-select / drag-to-reorder overlay
//   - the selected/hovered visual affordances (ring, drag handle, delete)
//
// The popover is `modal={false}`, so clicking a different EditableCard
// dismisses this one and re-opens the other in the next tick via the
// editor's selection state. Escape + outside-click route through
// `onOpenChange(false)` which clears the selection.
//
// Live-preview semantics: every change inside the CardForm fires
// `onChange(card)` immediately, which the editor applies to its draft.
// Because the same card is rendered underneath the popover, the user sees
// their edits reflected in the preview with one render tick of latency.
// ---------------------------------------------------------------------------

import { type DragEvent } from 'react';
import { GripVertical, Trash2, X } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import type { CardDescriptor } from '@ha/shared';
import { CardRenderer } from '@/components/cards';
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
}: EditableCardProps) {
  return (
    <Popover.Root
      open={selected}
      onOpenChange={(open) => {
        if (!open) onDeselect();
      }}
      modal={false}
    >
      <Popover.Anchor asChild>
        <div
          className="group relative rounded-[var(--radius)] transition-all"
          style={{
            outline: selected ? '2px solid var(--color-accent)' : '2px solid transparent',
            outlineOffset: 2,
            opacity: dragging ? 0.4 : 1,
          }}
          data-card-id={card.id ?? card.type}
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
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          avoidCollisions
          // Don't yank focus on open — keeps clicks on other cards from
          // being swallowed during an anchor-switch.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-[var(--radius)] p-4 shadow-lg focus:outline-none"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            maxHeight: 'calc(100vh - 4rem)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
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
                aria-label="Close editor"
                onClick={onDeselect}
              />
            </div>
          </div>

          <CardForm card={card} onChange={onChange} />

          <Popover.Arrow className="fill-[var(--color-border)]" width={12} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
