'use client';

// ---------------------------------------------------------------------------
// DeviceDefaultCardPanel — the "front door" of a device detail page.
//
// Renders the user's effective card for this device (override → default
// mapping → generic fallback) via `useDeviceCard`. When an override is
// present, a small "Reset" control reverts to the class default.
//
// Admins (incl. PIN-elevated users) get a "Customize" button in the header
// that opens a live-preview editor dialog. The editor reuses the same
// `CardForm` the dashboard uses, so every per-type option surface (size,
// controls, presets…) is available here too. Saving persists via the same
// override endpoint `useDeviceCard` reads from.
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react';
import { Sparkles, RotateCcw, Loader2, Pencil, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import type { CardDescriptor } from '@ha/shared';
import { useDeviceCard } from '@/hooks/useDeviceCard';
import { useAuth } from '@/providers/AuthProvider';
import { CardRenderer } from '@/components/cards/CardRenderer';
import { Card } from '@/components/ui/Card';
import { CardForm } from '@/components/dashboard/card-forms';
import { GhostIconButton } from '@/components/ui/Button';

interface DeviceDefaultCardPanelProps {
  deviceId: string;
}

export function DeviceDefaultCardPanel({ deviceId }: DeviceDefaultCardPanelProps) {
  const { card, isOverridden, isLoading, error, setOverride, clearOverride } = useDeviceCard(deviceId);
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CardDescriptor | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the draft each time the editor opens so we edit a copy, not the
  // live descriptor (otherwise a cancel still leaks mutations back).
  useEffect(() => {
    if (editing && card) setDraft(structuredClone(card));
  }, [editing, card]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await setOverride(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {isOverridden ? 'Your custom controls' : 'Quick controls'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          )}
          {isAdmin && card && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Customize this card (admins only)"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <Pencil className="h-3 w-3" /> Customize
            </button>
          )}
          {isOverridden && (
            <button
              type="button"
              onClick={() => void clearOverride()}
              title="Revert to the default card for this device type"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-2 text-xs" style={{ color: 'var(--color-danger)' }}>
          {error.message}
        </p>
      )}

      {card ? (
        <CardRenderer card={card} />
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Device not available.
        </p>
      )}

      {/* Admin customize dialog — same CardForm + live-preview layout as
          the dashboard editor's EditableCard, so the shape is familiar. */}
      <Dialog.Root open={editing} onOpenChange={(o) => { if (!o) setEditing(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)' }}
          />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
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
              <Dialog.Title
                className="text-base font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Customize device card
              </Dialog.Title>
              <Dialog.Close asChild>
                <GhostIconButton icon={X} aria-label="Close" />
              </Dialog.Close>
            </div>

            <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
              <div className="min-h-0 overflow-y-auto p-5">
                {draft && <CardForm card={draft} onChange={setDraft} />}
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
                  {draft && <CardRenderer card={draft} />}
                </div>
              </div>
            </div>

            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !draft}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  );
}
