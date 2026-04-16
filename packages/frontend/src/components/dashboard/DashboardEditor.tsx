'use client';

// ---------------------------------------------------------------------------
// DashboardEditor — structural editor + live preview + YAML raw mode.
//
// The editor holds a working copy of the DashboardDoc. Every structural edit
// (add/move/delete section or card) mutates this local state; nothing leaves
// the page until Save. On save we fire an optimistic-concurrency PUT using
// the revision we originally loaded, and on success swap in the server's
// response so subsequent saves keep the new revision.
//
// Rendering strategy:
//   - Left column: metadata, section list, card list with inspector
//   - Right column: live <DashboardView> mirroring the current draft
//
// Reorder UX:
//   Sections and cards use HTML5 native drag-and-drop. Card drops are
//   restricted to the owning section (moving between sections is a later
//   scope item). A drop indicator line hints at the target slot; dropping
//   into an empty section appends.
// ---------------------------------------------------------------------------

import { Fragment, useMemo, useState, type DragEvent } from 'react';
import * as yaml from 'js-yaml';
import {
  dashboardDocSchema,
  type CardDescriptor,
  type DashboardDoc,
  type DashboardSection,
} from '@ha/shared';
import { DashboardView } from './DashboardView';
import { CardPalette } from './CardPalette';
import { CardInspector } from './CardInspector';
import { updateDashboard } from '@/lib/api-dashboards';
import { token } from '@/lib/tokens';

interface DashboardEditorProps {
  initialDoc: DashboardDoc;
  onSaved?: (doc: DashboardDoc) => void;
}

type EditorMode = 'structural' | 'yaml';

interface SelectedCard {
  sectionIndex: number | null; // null = top-level (`stack`/`panel` layout)
  cardIndex: number;
}

// -- Drag payloads: kept in a ref (not state) to avoid dragging-time rerenders.
type Drag =
  | { kind: 'section'; from: number }
  | { kind: 'card'; sectionIndex: number | null; from: number };

export function DashboardEditor({ initialDoc, onSaved }: DashboardEditorProps) {
  const [doc, setDoc] = useState<DashboardDoc>(initialDoc);
  const [mode, setMode] = useState<EditorMode>('structural');
  const [paletteTarget, setPaletteTarget] = useState<{ sectionIndex: number | null } | null>(null);
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const yamlDraft = useMemo(
    () => yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false }),
    [doc],
  );
  const [yamlText, setYamlText] = useState(yamlDraft);
  const [yamlError, setYamlError] = useState<string | null>(null);

  const patchDoc = (updater: (prev: DashboardDoc) => DashboardDoc) => {
    setDoc((prev) => {
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  };

  // -- Section handlers ----------------------------------------------------

  const addSection = () => {
    patchDoc((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        { id: `section-${Date.now()}`, title: 'New section', cards: [] },
      ],
    }));
  };

  const renameSection = (index: number, title: string) => {
    patchDoc((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, title } : s)),
    }));
  };

  const removeSection = (index: number) => {
    patchDoc((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
    if (selected?.sectionIndex === index) setSelected(null);
  };

  const reorderSection = (from: number, to: number) => {
    if (from === to) return;
    patchDoc((prev) => {
      const next = prev.sections.slice();
      const [picked] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, picked);
      return { ...prev, sections: next };
    });
    // Keep inspector on the same card if one was selected in the moved section.
    setSelected((s) => {
      if (!s || s.sectionIndex === null) return s;
      if (s.sectionIndex === from) {
        return { ...s, sectionIndex: to > from ? to - 1 : to };
      }
      return s;
    });
  };

  // -- Card handlers -------------------------------------------------------

  const addCard = (card: CardDescriptor, sectionIndex: number | null) => {
    patchDoc((prev) => {
      if (sectionIndex === null) {
        return { ...prev, cards: [...prev.cards, card] };
      }
      return {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sectionIndex ? { ...s, cards: [...s.cards, card] } : s,
        ),
      };
    });
    setPaletteTarget(null);
  };

  const updateCard = (sel: SelectedCard, card: CardDescriptor) => {
    patchDoc((prev) => {
      if (sel.sectionIndex === null) {
        return {
          ...prev,
          cards: prev.cards.map((c, i) => (i === sel.cardIndex ? card : c)),
        };
      }
      return {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sel.sectionIndex
            ? { ...s, cards: s.cards.map((c, j) => (j === sel.cardIndex ? card : c)) }
            : s,
        ),
      };
    });
  };

  const removeCard = (sel: SelectedCard) => {
    patchDoc((prev) => {
      if (sel.sectionIndex === null) {
        return { ...prev, cards: prev.cards.filter((_, i) => i !== sel.cardIndex) };
      }
      return {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sel.sectionIndex
            ? { ...s, cards: s.cards.filter((_, j) => j !== sel.cardIndex) }
            : s,
        ),
      };
    });
    setSelected(null);
  };

  const reorderCard = (sectionIndex: number | null, from: number, to: number) => {
    if (from === to) return;
    patchDoc((prev) => {
      const list = (sectionIndex === null
        ? prev.cards
        : prev.sections[sectionIndex]?.cards ?? []).slice();
      const [picked] = list.splice(from, 1);
      list.splice(to > from ? to - 1 : to, 0, picked);
      if (sectionIndex === null) return { ...prev, cards: list };
      return {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sectionIndex ? { ...s, cards: list } : s,
        ),
      };
    });
    // Preserve selection if the moved card was the selected one.
    setSelected((s) => {
      if (!s || s.sectionIndex !== sectionIndex) return s;
      if (s.cardIndex !== from) return s;
      return { ...s, cardIndex: to > from ? to - 1 : to };
    });
  };

  // -- Save ----------------------------------------------------------------

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateDashboard(doc.path, {
        title: doc.title,
        icon: doc.icon,
        visibility: doc.visibility,
        layout: doc.layout,
        sections: doc.sections,
        cards: doc.cards,
        pinned: doc.pinned,
        defaultForAreaId: doc.defaultForAreaId,
        tags: doc.tags,
        expectedRevision: doc.revision,
      });
      setDoc(saved);
      setDirty(false);
      onSaved?.(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleYamlApply = () => {
    try {
      const parsed = yaml.load(yamlText);
      const next = dashboardDocSchema.parse(parsed);
      // Preserve id/path/revision/owner regardless — these are server-owned.
      setDoc({
        ...next,
        id: doc.id,
        path: doc.path,
        owner: doc.owner,
        revision: doc.revision,
      });
      setDirty(true);
      setYamlError(null);
    } catch (err) {
      setYamlError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <Toolbar
        mode={mode}
        onModeChange={(m) => {
          if (m === 'yaml') setYamlText(yamlDraft);
          setMode(m);
        }}
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
      />

      {error && (
        <div
          className="rounded p-2 text-sm"
          style={{
            background: token('--color-bg-card'),
            color: token('--color-danger'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          {error}
        </div>
      )}

      {mode === 'yaml' ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck={false}
            rows={30}
            className="w-full rounded p-3 font-mono text-xs"
            style={{
              background: token('--color-bg-card'),
              color: token('--color-text'),
              border: `1px solid ${token('--color-border')}`,
            }}
          />
          {yamlError && (
            <p className="text-xs" style={{ color: token('--color-danger') }}>
              {yamlError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setYamlText(yamlDraft); setYamlError(null); }}
              className="rounded px-3 py-1 text-sm"
              style={{ background: token('--color-bg-secondary'), color: token('--color-text') }}
            >
              Revert
            </button>
            <button
              type="button"
              onClick={handleYamlApply}
              className="rounded px-3 py-1 text-sm"
              style={{ background: token('--color-accent'), color: token('--color-bg') }}
            >
              Apply YAML
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Metadata doc={doc} onChange={patchDoc} />
            <SectionList
              doc={doc}
              onRenameSection={renameSection}
              onRemoveSection={removeSection}
              onReorderSection={reorderSection}
              onAddSection={addSection}
              onAddCard={(sectionIndex) => setPaletteTarget({ sectionIndex })}
              onReorderCard={reorderCard}
              onSelectCard={setSelected}
              selected={selected}
            />
            {selected && (
              <CardInspector
                card={cardAt(doc, selected)!}
                onChange={(c) => updateCard(selected, c)}
                onClose={() => setSelected(null)}
                onDelete={() => removeCard(selected)}
              />
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium" style={{ color: token('--color-text-muted') }}>
              Preview
            </h3>
            <div
              className="rounded"
              style={{
                background: token('--color-bg'),
                border: `1px dashed ${token('--color-border')}`,
              }}
            >
              <DashboardView doc={doc} />
            </div>
          </div>
        </div>
      )}

      <CardPalette
        open={paletteTarget !== null}
        onClose={() => setPaletteTarget(null)}
        onPick={(card) => {
          if (paletteTarget) addCard(card, paletteTarget.sectionIndex);
        }}
      />
    </div>
  );
}

function cardAt(doc: DashboardDoc, sel: SelectedCard): CardDescriptor | undefined {
  if (sel.sectionIndex === null) return doc.cards[sel.cardIndex];
  return doc.sections[sel.sectionIndex]?.cards[sel.cardIndex];
}

// -- Toolbar ----------------------------------------------------------------

function Toolbar({
  mode,
  onModeChange,
  dirty,
  saving,
  onSave,
}: {
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded p-2"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
    >
      <div className="flex rounded" style={{ background: token('--color-bg-secondary') }}>
        {(['structural', 'yaml'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className="rounded px-3 py-1 text-xs"
            style={{
              background: mode === m ? token('--color-accent') : 'transparent',
              color: mode === m ? token('--color-bg') : token('--color-text-muted'),
            }}
          >
            {m === 'structural' ? 'Structural' : 'Raw YAML'}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <span className="text-xs" style={{ color: token('--color-warning') }}>
            Unsaved changes
          </span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="rounded px-3 py-1 text-sm"
          style={{
            background: token('--color-accent'),
            color: token('--color-bg'),
            opacity: saving || !dirty ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// -- Metadata panel ---------------------------------------------------------

function Metadata({
  doc,
  onChange,
}: {
  doc: DashboardDoc;
  onChange: (u: (prev: DashboardDoc) => DashboardDoc) => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded p-3"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
    >
      <label className="text-xs" style={{ color: token('--color-text-muted') }}>
        Title
        <input
          type="text"
          value={doc.title}
          onChange={(e) => onChange((prev) => ({ ...prev, title: e.target.value }))}
          className="mt-0.5 w-full rounded px-2 py-1 text-sm"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        />
      </label>
      <label className="text-xs" style={{ color: token('--color-text-muted') }}>
        Icon (mdi:* or emoji)
        <input
          type="text"
          value={doc.icon ?? ''}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, icon: e.target.value || undefined }))
          }
          className="mt-0.5 w-full rounded px-2 py-1 text-sm"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        />
      </label>
      <div className="flex gap-3 text-xs" style={{ color: token('--color-text-muted') }}>
        <label className="flex-1">
          Layout
          <div
            className="mt-0.5 flex rounded"
            style={{ background: token('--color-bg-secondary') }}
          >
            {(['sections', 'stack', 'panel'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onChange((prev) => ({ ...prev, layout: { ...prev.layout, type } }))
                }
                className="flex-1 rounded px-2 py-1 text-xs"
                style={{
                  background:
                    doc.layout.type === type ? token('--color-accent') : 'transparent',
                  color:
                    doc.layout.type === type ? token('--color-bg') : token('--color-text-muted'),
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </label>
        {doc.layout.type === 'sections' && (
          <label className="w-24">
            Max columns
            <input
              type="number"
              min={1}
              max={6}
              value={doc.layout.maxColumns}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  layout: { ...prev.layout, maxColumns: Number(e.target.value) || 1 },
                }))
              }
              className="mt-0.5 w-full rounded px-2 py-1 text-sm"
              style={{
                background: token('--color-bg-secondary'),
                color: token('--color-text'),
                border: `1px solid ${token('--color-border')}`,
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

// -- Section + card list ---------------------------------------------------

function SectionList({
  doc,
  onRenameSection,
  onRemoveSection,
  onReorderSection,
  onAddSection,
  onAddCard,
  onReorderCard,
  onSelectCard,
  selected,
}: {
  doc: DashboardDoc;
  onRenameSection: (i: number, t: string) => void;
  onRemoveSection: (i: number) => void;
  onReorderSection: (from: number, to: number) => void;
  onAddSection: () => void;
  onAddCard: (sectionIndex: number | null) => void;
  onReorderCard: (sectionIndex: number | null, from: number, to: number) => void;
  onSelectCard: (sel: SelectedCard | null) => void;
  selected: SelectedCard | null;
}) {
  // `drag` must be state (not a ref) because drop-zone rendering depends on it.
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropHint, setDropHint] = useState<{
    sectionIndex: number | null;
    cardDropIndex?: number;
    sectionDropIndex?: number;
  } | null>(null);

  const layoutUsesSections = doc.layout.type === 'sections';

  const startCardDrag = (sectionIndex: number | null, from: number) => {
    setDrag({ kind: 'card', sectionIndex, from });
  };
  const startSectionDrag = (from: number) => {
    setDrag({ kind: 'section', from });
  };
  const endDrag = () => {
    setDrag(null);
    setDropHint(null);
  };

  const hoverCard = (sectionIndex: number | null, dropIndex: number) => {
    if (!drag || drag.kind !== 'card' || drag.sectionIndex !== sectionIndex) return;
    setDropHint({ sectionIndex, cardDropIndex: dropIndex });
  };
  const hoverSection = (dropIndex: number) => {
    if (!drag || drag.kind !== 'section') return;
    setDropHint({ sectionIndex: null, sectionDropIndex: dropIndex });
  };

  const dropCard = (sectionIndex: number | null, dropIndex: number) => {
    const d = drag;
    endDrag();
    if (!d || d.kind !== 'card' || d.sectionIndex !== sectionIndex) return;
    onReorderCard(sectionIndex, d.from, dropIndex);
  };
  const dropSection = (dropIndex: number) => {
    const d = drag;
    endDrag();
    if (!d || d.kind !== 'section') return;
    onReorderSection(d.from, dropIndex);
  };

  return (
    <div className="flex flex-col gap-2">
      {layoutUsesSections ? (
        <>
          {doc.sections.map((section, i) => (
            <SectionBlock
              key={section.id ?? i}
              section={section}
              index={i}
              onRename={(t) => onRenameSection(i, t)}
              onRemove={() => onRemoveSection(i)}
              onAddCard={() => onAddCard(i)}
              onSelectCard={onSelectCard}
              selected={selected}
              drag={drag}
              dropHint={dropHint}
              onStartCardDrag={startCardDrag}
              onStartSectionDrag={startSectionDrag}
              onHoverCard={hoverCard}
              onHoverSection={hoverSection}
              onDropCard={dropCard}
              onDropSection={dropSection}
              onEndDrag={endDrag}
            />
          ))}
          {/* Trailing section drop zone — append to end of list. */}
          <SectionDropZone
            dropIndex={doc.sections.length}
            active={drag?.kind === 'section'}
            highlighted={dropHint?.sectionDropIndex === doc.sections.length}
            onHover={hoverSection}
            onDrop={dropSection}
          />
          <button
            type="button"
            onClick={onAddSection}
            className="rounded border-dashed px-3 py-2 text-xs"
            style={{
              border: `1px dashed ${token('--color-border')}`,
              color: token('--color-text-muted'),
            }}
          >
            + Add section
          </button>
        </>
      ) : (
        <TopLevelCards
          cards={doc.cards}
          onAddCard={() => onAddCard(null)}
          onSelectCard={(idx) => onSelectCard({ sectionIndex: null, cardIndex: idx })}
          selectedIndex={selected?.sectionIndex === null ? selected.cardIndex : null}
          drag={drag}
          dropHint={dropHint}
          onStartCardDrag={startCardDrag}
          onHoverCard={hoverCard}
          onDropCard={dropCard}
          onEndDrag={endDrag}
        />
      )}
    </div>
  );
}

// -- Drop zones ------------------------------------------------------------

/** Thin drop target rendered between rows. Grows a visible line when hovered. */
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
        background: highlighted ? token('--color-accent') : 'transparent',
        transition: 'background 120ms, height 120ms',
      }}
    />
  );
}

function SectionDropZone({
  dropIndex,
  active,
  highlighted,
  onHover,
  onDrop,
}: {
  dropIndex: number;
  active: boolean;
  highlighted: boolean;
  onHover: (dropIndex: number) => void;
  onDrop: (dropIndex: number) => void;
}) {
  return (
    <DropZone
      active={active}
      highlighted={highlighted}
      onHover={() => onHover(dropIndex)}
      onDrop={() => onDrop(dropIndex)}
    />
  );
}

// -- SectionBlock ----------------------------------------------------------

type DnDProps = {
  drag: Drag | null;
  dropHint: {
    sectionIndex: number | null;
    cardDropIndex?: number;
    sectionDropIndex?: number;
  } | null;
  onStartCardDrag: (sectionIndex: number | null, from: number) => void;
  onStartSectionDrag?: (from: number) => void;
  onHoverCard: (sectionIndex: number | null, dropIndex: number) => void;
  onHoverSection?: (dropIndex: number) => void;
  onDropCard: (sectionIndex: number | null, dropIndex: number) => void;
  onDropSection?: (dropIndex: number) => void;
  onEndDrag: () => void;
};

function SectionBlock({
  section,
  index,
  onRename,
  onRemove,
  onAddCard,
  onSelectCard,
  selected,
  drag,
  dropHint,
  onStartCardDrag,
  onStartSectionDrag,
  onHoverCard,
  onHoverSection,
  onDropCard,
  onDropSection,
  onEndDrag,
}: {
  section: DashboardSection;
  index: number;
  onRename: (t: string) => void;
  onRemove: () => void;
  onAddCard: () => void;
  onSelectCard: (sel: SelectedCard | null) => void;
  selected: SelectedCard | null;
} & DnDProps) {
  const cardDragActive =
    drag?.kind === 'card' && drag.sectionIndex === index;
  const sectionDragActive = drag?.kind === 'section';
  const sectionHighlighted = dropHint?.sectionDropIndex === index;

  return (
    <>
      {/* Drop zone above this section. */}
      <SectionDropZone
        dropIndex={index}
        active={sectionDragActive}
        highlighted={sectionHighlighted}
        onHover={onHoverSection ?? (() => {})}
        onDrop={onDropSection ?? (() => {})}
      />

      <div
        className="flex flex-col gap-2 rounded p-3"
        style={{
          background: token('--color-bg-card'),
          border: `1px solid ${token('--color-border')}`,
        }}
      >
        <div
          className="flex items-center gap-2"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            onStartSectionDrag?.(index);
          }}
          onDragEnd={onEndDrag}
          title="Drag to reorder section"
          style={{ cursor: 'grab' }}
        >
          <span
            aria-hidden
            className="text-xs select-none"
            style={{ color: token('--color-text-muted') }}
          >
            ⠿
          </span>
          <input
            type="text"
            value={section.title ?? ''}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Section title"
            className="flex-1 rounded px-2 py-1 text-sm"
            style={{
              background: token('--color-bg-secondary'),
              color: token('--color-text'),
              border: `1px solid ${token('--color-border')}`,
            }}
            // Inputs are draggable by default from the parent; block it so text
            // selection works normally.
            draggable={false}
            onDragStart={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-2 py-0.5 text-xs"
            style={{ color: token('--color-danger') }}
          >
            Remove
          </button>
        </div>

        <ul className="flex flex-col gap-0.5" role="list">
          {/* Top drop zone for the first slot. */}
          <DropZone
            active={cardDragActive}
            highlighted={
              dropHint?.sectionIndex === index && dropHint.cardDropIndex === 0
            }
            onHover={() => onHoverCard(index, 0)}
            onDrop={() => onDropCard(index, 0)}
          />
          {section.cards.map((card, ci) => {
            const sel: SelectedCard = { sectionIndex: index, cardIndex: ci };
            const isSelected =
              selected?.sectionIndex === index && selected?.cardIndex === ci;
            const isDragged =
              drag?.kind === 'card' &&
              drag.sectionIndex === index &&
              drag.from === ci;
            return (
              <Fragment key={card.id ?? `${card.type}-${ci}`}>
                <li
                  className="flex items-center gap-2 rounded px-2 py-1"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    onStartCardDrag(index, ci);
                  }}
                  onDragEnd={onEndDrag}
                  style={{
                    background: isSelected ? token('--color-bg-secondary') : 'transparent',
                    border: `1px solid ${isSelected ? token('--color-accent') : 'transparent'}`,
                    opacity: isDragged ? 0.4 : 1,
                    cursor: 'grab',
                  }}
                >
                  <span
                    aria-hidden
                    className="text-xs select-none"
                    style={{ color: token('--color-text-muted') }}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectCard(isSelected ? null : sel)}
                    className="flex-1 text-left text-xs"
                    style={{ color: token('--color-text') }}
                    draggable={false}
                    onDragStart={(e) => e.stopPropagation()}
                  >
                    <span className="font-mono">{card.type}</span>
                    {renderCardSummary(card)}
                  </button>
                </li>
                <DropZone
                  active={cardDragActive}
                  highlighted={
                    dropHint?.sectionIndex === index &&
                    dropHint.cardDropIndex === ci + 1
                  }
                  onHover={() => onHoverCard(index, ci + 1)}
                  onDrop={() => onDropCard(index, ci + 1)}
                />
              </Fragment>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onAddCard}
          className="rounded border-dashed px-2 py-1 text-xs"
          style={{
            border: `1px dashed ${token('--color-border')}`,
            color: token('--color-text-muted'),
          }}
        >
          + Add card to this section
        </button>
      </div>
    </>
  );
}

function TopLevelCards({
  cards,
  onAddCard,
  onSelectCard,
  selectedIndex,
  drag,
  dropHint,
  onStartCardDrag,
  onHoverCard,
  onDropCard,
  onEndDrag,
}: {
  cards: CardDescriptor[];
  onAddCard: () => void;
  onSelectCard: (idx: number) => void;
  selectedIndex: number | null;
} & Omit<DnDProps, 'onStartSectionDrag' | 'onHoverSection' | 'onDropSection'>) {
  const cardDragActive =
    drag?.kind === 'card' && drag.sectionIndex === null;
  return (
    <div
      className="flex flex-col gap-2 rounded p-3"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
    >
      <ul className="flex flex-col gap-0.5" role="list">
        <DropZone
          active={cardDragActive}
          highlighted={
            dropHint?.sectionIndex === null && dropHint.cardDropIndex === 0
          }
          onHover={() => onHoverCard(null, 0)}
          onDrop={() => onDropCard(null, 0)}
        />
        {cards.map((card, i) => {
          const isSelected = selectedIndex === i;
          const isDragged =
            drag?.kind === 'card' &&
            drag.sectionIndex === null &&
            drag.from === i;
          return (
            <Fragment key={card.id ?? `${card.type}-${i}`}>
              <li
                className="flex items-center gap-2 rounded px-2 py-1"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  onStartCardDrag(null, i);
                }}
                onDragEnd={onEndDrag}
                style={{
                  background: isSelected ? token('--color-bg-secondary') : 'transparent',
                  border: `1px solid ${isSelected ? token('--color-accent') : 'transparent'}`,
                  opacity: isDragged ? 0.4 : 1,
                  cursor: 'grab',
                }}
              >
                <span
                  aria-hidden
                  className="text-xs select-none"
                  style={{ color: token('--color-text-muted') }}
                >
                  ⠿
                </span>
                <button
                  type="button"
                  onClick={() => onSelectCard(i)}
                  className="flex-1 text-left text-xs"
                  style={{ color: token('--color-text') }}
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                >
                  <span className="font-mono">{card.type}</span>
                  {renderCardSummary(card)}
                </button>
              </li>
              <DropZone
                active={cardDragActive}
                highlighted={
                  dropHint?.sectionIndex === null && dropHint.cardDropIndex === i + 1
                }
                onHover={() => onHoverCard(null, i + 1)}
                onDrop={() => onDropCard(null, i + 1)}
              />
            </Fragment>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onAddCard}
        className="rounded border-dashed px-2 py-1 text-xs"
        style={{
          border: `1px dashed ${token('--color-border')}`,
          color: token('--color-text-muted'),
        }}
      >
        + Add card
      </button>
    </div>
  );
}

function renderCardSummary(card: CardDescriptor): string {
  // Best-effort one-liner summary using whichever field is the most
  // identifying for this card type. Keeps the list readable without opening
  // the inspector.
  const bag = card as Record<string, unknown>;
  const entity = typeof bag.entity === 'string' ? bag.entity : undefined;
  const title = typeof bag.title === 'string' ? bag.title : undefined;
  const name = typeof bag.name === 'string' ? bag.name : undefined;
  const content = typeof bag.content === 'string' ? bag.content : undefined;
  const text = typeof bag.text === 'string' ? bag.text : undefined;
  const label = title ?? name ?? text ?? entity ?? (content ? content.slice(0, 30) : '');
  return label ? ` — ${label}` : '';
}
