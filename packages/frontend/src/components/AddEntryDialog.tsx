'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Save, MapPin } from 'lucide-react';
import type { ConfigField, IntegrationEntry } from '@ha/shared';
import { RoborockCloudConnect, filterRoborockConfigFields } from '@/components/RoborockCloudConnect';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

export type EntrySaveDetail =
  | { kind: 'created'; entryId: string }
  | { kind: 'updated'; entryId: string };

interface Props {
  open: boolean;
  onClose: () => void;
  integrationId: string;
  integrationName: string;
  fields: ConfigField[];
  /** If provided, we're editing an existing entry */
  entry?: IntegrationEntry | null;
  /** Called after a successful save. For new instances, includes the new entry id. */
  onSaved: (detail?: EntrySaveDetail) => void;
}

export function AddEntryDialog({ open, onClose, integrationId, integrationName, fields, entry, onSaved }: Props) {
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const configFields =
    integrationId === 'roborock' ? filterRoborockConfigFields(fields, values) : fields;

  // Initialize form when dialog opens or entry changes
  useEffect(() => {
    if (open) {
      if (entry) {
        setLabel(entry.label);
        setValues(entry.config);
      } else {
        setLabel('');
        const defaults: Record<string, string> = {};
        for (const f of fields) {
          if (f.defaultValue) defaults[f.key] = f.defaultValue;
        }
        setValues(defaults);
      }
    }
  }, [open, entry, fields]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (entry) {
        const res = await fetch(`${API_BASE}/api/integrations/${integrationId}/entries/${entry.id}`, {
          credentials: 'include',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, config: values }),
        });
        if (!res.ok) return;
        onSaved({ kind: 'updated', entryId: entry.id });
        onClose();
      } else {
        const res = await fetch(`${API_BASE}/api/integrations/${integrationId}/entries`, {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, config: values }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string };
        if (!data.id) return;
        onSaved({ kind: 'created', entryId: data.id });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-xl"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
            <Dialog.Title className="text-sm font-semibold">
              {entry ? 'Edit Entry' : `${integrationName} - Configuration`}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-[var(--color-bg-hover)] transition-colors">
                <X className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="space-y-4 px-5 py-4">
            {integrationId === 'tesla' && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Use &apos;Auth App for Tesla&apos; on iOS or &apos;Tesla Tokens&apos; on Android
                to create a refresh token and enter it below.
              </p>
            )}

            {(integrationId === 'weather' || integrationId === 'sun') && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/api/settings`, { credentials: 'include' });
                    const data = await res.json();
                    const s = data.settings as Record<string, unknown>;
                    if (typeof s.home_latitude === 'number' && typeof s.home_longitude === 'number') {
                      setValues((v) => ({
                        ...v,
                        latitude: String(s.home_latitude),
                        longitude: String(s.home_longitude),
                        ...(!(v.label ?? '').trim() && typeof s.home_address === 'string'
                          ? { label: s.home_address as string }
                          : {}),
                      }));
                      if (!label && typeof s.home_address === 'string') {
                        setLabel(s.home_address as string);
                      }
                    }
                  } catch {}
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border w-full justify-center"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <MapPin className="h-3.5 w-3.5" />
                Use Home Location
              </button>
            )}

            {configFields.map((field) => (
              <div key={field.key} className="space-y-1">
                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2.5 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={values[field.key] === 'true'}
                      onChange={(e) => setValues({ ...values, [field.key]: String(e.target.checked) })}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    <span className="text-sm">{field.label}</span>
                  </label>
                ) : (
                  <>
                    <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      {field.label}{field.required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
                    </label>
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                      className="w-full rounded-md border px-2.5 py-1.5 text-sm"
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </>
                )}
              </div>
            ))}

            {integrationId === 'roborock' && values.local_miio !== 'true' && (
              <RoborockCloudConnect
                email={values.email ?? ''}
                onSessionReady={(sessionB64) =>
                  setValues((v) => ({ ...v, cloud_session: sessionB64, local_miio: 'false' }))
                }
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {entry ? 'Update' : 'Submit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
