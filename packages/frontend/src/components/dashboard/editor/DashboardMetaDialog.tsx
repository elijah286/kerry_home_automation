'use client';

// ---------------------------------------------------------------------------
// DashboardMetaDialog — Radix Dialog hosting dashboard-level settings:
//   - Title / icon
//   - Layout (sections / stack / panel) + maxColumns
//   - Raw YAML editor (fallback escape hatch)
//
// Users can flip between "Metadata" and "Raw YAML" tabs. Applying YAML parses
// the draft via the `dashboardDocSchema` and swaps in the new doc while
// preserving server-owned fields (id/path/owner/revision).
// ---------------------------------------------------------------------------

import { useMemo, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import * as yaml from 'js-yaml';
import { X } from 'lucide-react';
import { dashboardDocSchema, type DashboardDoc } from '@ha/shared';
import { Input, Textarea } from '@/components/ui/Input';
import { PrimaryButton, SecondaryButton, GhostIconButton } from '@/components/ui/Button';

interface DashboardMetaDialogProps {
  doc: DashboardDoc;
  trigger: ReactNode;
  /** Called with a patched doc whenever the user edits metadata or applies YAML. */
  onChange: (next: DashboardDoc) => void;
}

export function DashboardMetaDialog({ doc, trigger, onChange }: DashboardMetaDialogProps) {
  const [open, setOpen] = useState(false);

  // Lazily recomputed whenever the dialog opens against the latest doc.
  const yamlDraft = useMemo(
    () => yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false }),
    [doc],
  );
  const [yamlText, setYamlText] = useState(yamlDraft);
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Whenever the dialog opens, snap the YAML buffer to the current draft so
  // users don't see stale text from a previous edit.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setYamlText(yamlDraft);
      setYamlError(null);
    }
    setOpen(next);
  };

  const handleYamlApply = () => {
    try {
      const parsed = yaml.load(yamlText);
      const next = dashboardDocSchema.parse(parsed);
      // Server-owned fields are preserved regardless.
      onChange({
        ...next,
        id: doc.id,
        path: doc.path,
        owner: doc.owner,
        revision: doc.revision,
      });
      setYamlError(null);
      setOpen(false);
    } catch (err) {
      setYamlError((err as Error).message);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
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
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
              Dashboard settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <GhostIconButton icon={X} aria-label="Close dialog" />
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue="metadata" className="flex flex-col gap-3">
            <Tabs.List className="flex flex-wrap gap-1.5">
              {[
                { value: 'metadata', label: 'Metadata' },
                { value: 'yaml', label: 'Raw YAML' },
              ].map((t) => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors data-[state=active]:bg-[var(--color-accent)] data-[state=active]:text-white"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {t.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="metadata" className="flex flex-col gap-3">
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
                  value={doc.title}
                  onChange={(e) => onChange({ ...doc, title: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Icon (mdi:* or emoji)
                </span>
                <Input
                  type="text"
                  size="sm"
                  value={doc.icon ?? ''}
                  onChange={(e) =>
                    onChange({ ...doc, icon: e.target.value || undefined })
                  }
                />
              </label>

              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Layout
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['sections', 'stack', 'panel'] as const).map((type) => {
                      const selected = doc.layout.type === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...doc,
                              layout: { ...doc.layout, type },
                            })
                          }
                          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{
                            background: selected
                              ? 'var(--color-accent)'
                              : 'var(--color-bg-secondary)',
                            color: selected ? '#fff' : 'var(--color-text)',
                            border: '1px solid',
                            borderColor: selected
                              ? 'var(--color-accent)'
                              : 'var(--color-border)',
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </label>
                {doc.layout.type === 'sections' && (
                  <label className="flex w-28 flex-col gap-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Max columns
                    </span>
                    <Input
                      type="number"
                      size="sm"
                      min={1}
                      max={6}
                      value={doc.layout.maxColumns}
                      onChange={(e) =>
                        onChange({
                          ...doc,
                          layout: {
                            ...doc.layout,
                            maxColumns: Number(e.target.value) || 1,
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <PrimaryButton>Done</PrimaryButton>
                </Dialog.Close>
              </div>
            </Tabs.Content>

            <Tabs.Content value="yaml" className="flex flex-col gap-2">
              <Textarea
                value={yamlText}
                onChange={(e) => setYamlText(e.target.value)}
                spellCheck={false}
                rows={18}
                mono
              />
              {yamlError && (
                <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                  {yamlError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <SecondaryButton
                  onClick={() => {
                    setYamlText(yamlDraft);
                    setYamlError(null);
                  }}
                >
                  Revert
                </SecondaryButton>
                <PrimaryButton onClick={handleYamlApply}>Apply YAML</PrimaryButton>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
