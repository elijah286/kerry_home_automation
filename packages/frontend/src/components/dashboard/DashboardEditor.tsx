'use client';

// ---------------------------------------------------------------------------
// DashboardEditor (Phase 2) — single-column live-preview editor.
//
// Layout:
//   - Thin toolbar: dirty indicator, Save, Settings (gear → DashboardMetaDialog)
//   - <EditablePreview> fills the rest. Clicking a card opens a floating
//     <EditableCard> popover; clicking a section title opens a similar
//     popover. Every keystroke in the popover mutates the draft, so the
//     preview underneath updates in real time.
//
// Mutation is still held in local state + flushed on Save via PUT with the
// original revision (optimistic concurrency). On 200, the server response
// replaces the draft so subsequent saves keep advancing the revision.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { Settings } from 'lucide-react';
import type { CardDescriptor, DashboardDoc } from '@ha/shared';
import { CardPalette } from './CardPalette';
import { EditablePreview, type SelectedCard, type SelectedSection } from './editor/EditablePreview';
import { DashboardMetaDialog } from './editor/DashboardMetaDialog';
import { updateDashboard } from '@/lib/api-dashboards';
import { PrimaryButton, GhostIconButton } from '@/components/ui/Button';

interface DashboardEditorProps {
  initialDoc: DashboardDoc;
  onSaved?: (doc: DashboardDoc) => void;
}

export function DashboardEditor({ initialDoc, onSaved }: DashboardEditorProps) {
  const [doc, setDoc] = useState<DashboardDoc>(initialDoc);
  const [paletteTarget, setPaletteTarget] = useState<{ sectionIndex: number | null } | null>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [selectedSection, setSelectedSection] = useState<SelectedSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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
    setSelectedSection((s) => (s?.sectionIndex === index ? null : s));
    setSelectedCard((c) => (c?.sectionIndex === index ? null : c));
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
    setSelectedCard(null);
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
    // Preserve selection if the moved card was selected.
    setSelectedCard((s) => {
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

  // Dialog-level metadata/YAML replace the entire doc except server-owned
  // fields, which DashboardMetaDialog already preserves.
  const replaceDocFromDialog = (next: DashboardDoc) => {
    patchDoc(() => next);
  };

  return (
    <div className="flex flex-col">
      <div
        className="sticky top-0 z-30 flex items-center gap-2 border-b px-4 py-2 lg:px-6"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        <DashboardMetaDialog
          doc={doc}
          onChange={replaceDocFromDialog}
          trigger={
            <GhostIconButton
              icon={Settings}
              aria-label="Dashboard settings"
              title="Dashboard settings"
            />
          }
        />
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
              Unsaved changes
            </span>
          )}
          <PrimaryButton onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div
          className="m-4 rounded-[var(--radius)] p-3 text-sm"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-danger)',
            border: '1px solid var(--color-border)',
          }}
        >
          {error}
        </div>
      )}

      <EditablePreview
        doc={doc}
        selectedCard={selectedCard}
        selectedSection={selectedSection}
        onSelectCard={setSelectedCard}
        onSelectSection={setSelectedSection}
        onUpdateCard={updateCard}
        onDeleteCard={removeCard}
        onReorderCard={reorderCard}
        onAddCard={(sectionIndex) => setPaletteTarget({ sectionIndex })}
        onRenameSection={renameSection}
        onDeleteSection={removeSection}
        onAddSection={addSection}
      />

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
