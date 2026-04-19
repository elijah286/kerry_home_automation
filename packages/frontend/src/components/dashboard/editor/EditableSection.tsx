'use client';

// ---------------------------------------------------------------------------
// EditableSection — renders a section column with always-visible controls
// for renaming (inline input) and deleting the section.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import type { DashboardSection } from '@ha/shared';
import { Input } from '@/components/ui/Input';
import { GhostIconButton } from '@/components/ui/Button';

interface EditableSectionProps {
  section: DashboardSection;
  onRename: (title: string) => void;
  onDelete: () => void;
  children: ReactNode;
}

export function EditableSection({
  section,
  onRename,
  onDelete,
  children,
}: EditableSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync when section title changes externally (e.g. undo)
  useEffect(() => {
    if (!editing) setDraft(section.title ?? '');
  }, [section.title, editing]);

  const startEdit = () => {
    setDraft(section.title ?? '');
    setEditing(true);
    // Focus on next tick after the input mounts
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(section.title ?? '');
    setEditing(false);
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius)] p-4"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
      data-section-id={section.id}
    >
      {/* Section header with inline rename + delete */}
      <div className="flex min-w-0 items-center gap-1">
        {editing ? (
          <>
            <Input
              ref={inputRef}
              type="text"
              size="sm"
              value={draft}
              placeholder="Section title"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
              }}
              className="flex-1 text-xs font-medium uppercase tracking-wider"
            />
            <GhostIconButton icon={Check} aria-label="Confirm rename" onClick={commitEdit} />
            <GhostIconButton icon={X} aria-label="Cancel rename" onClick={cancelEdit} />
          </>
        ) : (
          <>
            <span
              className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {section.title || 'Untitled section'}
            </span>
            <GhostIconButton
              icon={Pencil}
              aria-label="Rename section"
              onClick={startEdit}
            />
            <GhostIconButton
              icon={Trash2}
              tone="danger"
              aria-label="Delete section"
              onClick={onDelete}
            />
          </>
        )}
      </div>

      {children}
    </div>
  );
}
