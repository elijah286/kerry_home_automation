'use client';

// ---------------------------------------------------------------------------
// EditableSection — renders a section column with a clickable title that
// opens a floating editor popover (rename / delete).
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import type { DashboardSection } from '@ha/shared';
import { Input } from '@/components/ui/Input';
import { GhostIconButton } from '@/components/ui/Button';

interface EditableSectionProps {
  section: DashboardSection;
  selected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  children: ReactNode;
}

export function EditableSection({
  section,
  selected,
  onSelect,
  onDeselect,
  onRename,
  onDelete,
  children,
}: EditableSectionProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius)] p-4"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
      data-section-id={section.id}
    >
      <Popover.Root
        open={selected}
        onOpenChange={(open) => {
          if (!open) onDeselect();
        }}
        modal={false}
      >
        <Popover.Anchor asChild>
          <button
            type="button"
            onClick={onSelect}
            className="w-full rounded-md px-2 py-1 text-left text-xs font-medium uppercase tracking-wider transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{
              color: selected ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
          >
            {section.title ?? 'Untitled section'}
          </button>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            avoidCollisions
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-[var(--radius)] p-4 shadow-lg focus:outline-none"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                Edit section
              </span>
              <div className="flex items-center gap-1">
                <GhostIconButton
                  icon={Trash2}
                  tone="danger"
                  aria-label="Delete section"
                  onClick={onDelete}
                />
                <GhostIconButton
                  icon={X}
                  aria-label="Close editor"
                  onClick={onDeselect}
                />
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Title
              </span>
              <Input
                type="text"
                size="sm"
                value={section.title ?? ''}
                placeholder="Section title"
                onChange={(e) => onRename(e.target.value)}
                autoFocus
              />
            </label>

            <Popover.Arrow className="fill-[var(--color-border)]" width={12} height={6} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {children}
    </div>
  );
}
