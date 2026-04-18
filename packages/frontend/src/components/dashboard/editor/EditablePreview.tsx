'use client';

// ---------------------------------------------------------------------------
// EditablePreview — the live-preview canvas of the Phase-2 dashboard editor.
//
// Each card is wrapped in <EditableCard> which owns its own Radix Popover
// anchored to the card's DOM node. Clicking selects a card and opens the
// popover; clicking a different card re-anchors. Sections expose a
// clickable title via <EditableSection> for rename/delete.
//
// Drag-and-drop reorders cards within a section (native HTML5 DnD).
// Add-card + add-section affordances sit inline.
// ---------------------------------------------------------------------------

import { Fragment, useState, type DragEvent } from 'react';
import { Plus } from 'lucide-react';
import type { CardDescriptor, DashboardDoc, DashboardSection } from '@ha/shared';
import { EditableCard } from './EditableCard';
import { EditableSection } from './EditableSection';

export interface SelectedCard {
  sectionIndex: number | null; // null = top-level (stack/panel layouts)
  cardIndex: number;
}

export interface SelectedSection {
  sectionIndex: number;
}

type Drag = { kind: 'card'; sectionIndex: number | null; from: number };

interface EditablePreviewProps {
  doc: DashboardDoc;
  selectedCard: SelectedCard | null;
  selectedSection: SelectedSection | null;
  onSelectCard: (sel: SelectedCard | null) => void;
  onSelectSection: (sel: SelectedSection | null) => void;
  onUpdateCard: (sel: SelectedCard, card: CardDescriptor) => void;
  onDeleteCard: (sel: SelectedCard) => void;
  onReorderCard: (sectionIndex: number | null, from: number, to: number) => void;
  onAddCard: (sectionIndex: number | null) => void;
  onRenameSection: (sectionIndex: number, title: string) => void;
  onDeleteSection: (sectionIndex: number) => void;
  onAddSection: () => void;
}

export function EditablePreview({
  doc,
  selectedCard,
  selectedSection,
  onSelectCard,
  onSelectSection,
  onUpdateCard,
  onDeleteCard,
  onReorderCard,
  onAddCard,
  onRenameSection,
  onDeleteSection,
  onAddSection,
}: EditablePreviewProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropHint, setDropHint] = useState<{
    sectionIndex: number | null;
    cardDropIndex: number;
  } | null>(null);

  const endDrag = () => {
    setDrag(null);
    setDropHint(null);
  };
  const startCardDrag = (sectionIndex: number | null, from: number) => {
    setDrag({ kind: 'card', sectionIndex, from });
  };
  const hoverCard = (sectionIndex: number | null, dropIndex: number) => {
    if (!drag || drag.sectionIndex !== sectionIndex) return;
    setDropHint({ sectionIndex, cardDropIndex: dropIndex });
  };
  const dropCard = (sectionIndex: number | null, dropIndex: number) => {
    const d = drag;
    endDrag();
    if (!d || d.sectionIndex !== sectionIndex) return;
    onReorderCard(sectionIndex, d.from, dropIndex);
  };

  const renderCard = (
    card: CardDescriptor,
    sectionIndex: number | null,
    ci: number,
  ) => {
    const selection: SelectedCard = { sectionIndex, cardIndex: ci };
    const isSelected =
      selectedCard?.sectionIndex === sectionIndex &&
      selectedCard?.cardIndex === ci;
    const isDragged =
      drag?.sectionIndex === sectionIndex && drag.from === ci;
    return (
      <EditableCard
        key={card.id ?? `${card.type}-${ci}`}
        card={card}
        selected={isSelected}
        dragging={isDragged}
        onSelect={() => onSelectCard(selection)}
        onDeselect={() => onSelectCard(null)}
        onChange={(next) => onUpdateCard(selection, next)}
        onDelete={() => onDeleteCard(selection)}
        onDragStart={() => startCardDrag(sectionIndex, ci)}
        onDragEnd={endDrag}
        // Treat every card as a drop target (top half = insert before it,
        // bottom half = insert after it). Without this, dropping on top of
        // a tall card like the thermostat tile was nearly impossible — you
        // had to precisely hit the 8-pixel DropZone between cards.
        onDragOverCard={(half) =>
          hoverCard(sectionIndex, half === 'top' ? ci : ci + 1)
        }
        onDropOverCard={(half) =>
          dropCard(sectionIndex, half === 'top' ? ci : ci + 1)
        }
      />
    );
  };

  const layout = doc.layout.type;

  // -- sections layout (primary path) --------------------------------------
  if (layout === 'sections') {
    const maxCols = Math.min(doc.layout.maxColumns, 6);
    return (
      <div className="min-h-full px-4 py-4 lg:px-6 lg:py-6">
        {doc.title && (
          <h1
            className="mb-4 text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {doc.title}
          </h1>
        )}
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(min(320px, 100%), ${100 / maxCols}%))`,
          }}
        >
          {doc.sections.map((section, si) => (
            <SectionColumn
              key={section.id ?? si}
              section={section}
              sectionIndex={si}
              selected={selectedSection?.sectionIndex === si}
              onSelect={() =>
                onSelectSection(
                  selectedSection?.sectionIndex === si ? null : { sectionIndex: si },
                )
              }
              onDeselect={() => onSelectSection(null)}
              onRename={(t) => onRenameSection(si, t)}
              onDelete={() => onDeleteSection(si)}
              onAddCard={() => onAddCard(si)}
              drag={drag}
              dropHint={dropHint}
              onHoverCard={hoverCard}
              onDropCard={dropCard}
              renderCard={(card, ci) => renderCard(card, si, ci)}
            />
          ))}
          <button
            type="button"
            onClick={onAddSection}
            className="inline-flex min-h-[120px] items-center justify-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add section
          </button>
        </div>
      </div>
    );
  }

  // -- stack / panel layouts (no sections) ---------------------------------
  return (
    <div className="min-h-full px-4 py-4 lg:px-6 lg:py-6">
      {doc.title && (
        <h1
          className="mb-4 text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {doc.title}
        </h1>
      )}
      <div className="flex flex-col gap-1">
        <DropZone
          active={drag?.sectionIndex === null}
          highlighted={
            dropHint?.sectionIndex === null && dropHint.cardDropIndex === 0
          }
          onHover={() => hoverCard(null, 0)}
          onDrop={() => dropCard(null, 0)}
        />
        {doc.cards.map((card, ci) => (
          <Fragment key={card.id ?? `${card.type}-${ci}`}>
            {renderCard(card, null, ci)}
            <DropZone
              active={drag?.sectionIndex === null}
              highlighted={
                dropHint?.sectionIndex === null &&
                dropHint.cardDropIndex === ci + 1
              }
              onHover={() => hoverCard(null, ci + 1)}
              onDrop={() => dropCard(null, ci + 1)}
            />
          </Fragment>
        ))}
        <AddCardButton onClick={() => onAddCard(null)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section column — title popover + draggable card list
// ---------------------------------------------------------------------------

function SectionColumn({
  section,
  sectionIndex,
  selected,
  onSelect,
  onDeselect,
  onRename,
  onDelete,
  onAddCard,
  drag,
  dropHint,
  onHoverCard,
  onDropCard,
  renderCard,
}: {
  section: DashboardSection;
  sectionIndex: number;
  selected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddCard: () => void;
  drag: Drag | null;
  dropHint: { sectionIndex: number | null; cardDropIndex: number } | null;
  onHoverCard: (sectionIndex: number | null, dropIndex: number) => void;
  onDropCard: (sectionIndex: number | null, dropIndex: number) => void;
  renderCard: (card: CardDescriptor, ci: number) => React.ReactNode;
}) {
  const dragActive = drag?.sectionIndex === sectionIndex;
  return (
    <EditableSection
      section={section}
      selected={selected}
      onSelect={onSelect}
      onDeselect={onDeselect}
      onRename={onRename}
      onDelete={onDelete}
    >
      <div className="flex flex-col gap-1" role="list">
        <DropZone
          active={dragActive}
          highlighted={
            dropHint?.sectionIndex === sectionIndex &&
            dropHint.cardDropIndex === 0
          }
          onHover={() => onHoverCard(sectionIndex, 0)}
          onDrop={() => onDropCard(sectionIndex, 0)}
        />
        {section.cards.map((card, ci) => (
          <Fragment key={card.id ?? `${card.type}-${ci}`}>
            {renderCard(card, ci)}
            <DropZone
              active={dragActive}
              highlighted={
                dropHint?.sectionIndex === sectionIndex &&
                dropHint.cardDropIndex === ci + 1
              }
              onHover={() => onHoverCard(sectionIndex, ci + 1)}
              onDrop={() => onDropCard(sectionIndex, ci + 1)}
            />
          </Fragment>
        ))}
      </div>
      <AddCardButton onClick={onAddCard} />
    </EditableSection>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function DropZone({
  active,
  highlighted,
  onHover,
  onDrop,
}: {
  active: boolean;
  highlighted: boolean;
  onHover: () => void;
  onDrop: () => void;
}) {
  const onDragOver = (e: DragEvent) => {
    if (!active) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onHover();
  };
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (!active) return;
        e.preventDefault();
        onDrop();
      }}
      aria-hidden
      style={{
        height: active ? 8 : 2,
        margin: '2px 0',
        borderRadius: 2,
        background: highlighted ? 'var(--color-accent)' : 'transparent',
        transition: 'background 120ms, height 120ms',
      }}
    />
  );
}

function AddCardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 self-stretch rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
      style={{
        background: 'transparent',
        color: 'var(--color-text-muted)',
        border: '1px dashed var(--color-border)',
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      Add card
    </button>
  );
}
