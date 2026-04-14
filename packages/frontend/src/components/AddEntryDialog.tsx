'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Save, MapPin } from 'lucide-react';
import type { ConfigField, IntegrationEntry } from '@ha/shared';
import { RoborockCloudConnect, filterRoborockConfigFields } from '@/components/RoborockCloudConnect';
import { getApiBase } from '@/lib/api-base';

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
  const [saveError, setSaveError] = useState<string | null>(null);

  const configFields =
    integrationId === 'roborock' ? filterRoborockConfigFields(fields, values) : fields;

  // Initialize form when dialog opens or entry changes
  useEffect(() => {
    if (open) {
      setSaveError(null);
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

  const parseSaveResponse = (
    res: Response,
    text: string,
  ): { ok: true; data: { id?: string } } | { ok: false; message: string } => {
    let data: { id?: string; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as { id?: string; error?: string }) : {};
    } catch {
      return { ok: false, message: res.ok ? 'Invalid response from server' : `Request failed (${res.status})` };
    }
    if (!res.ok) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : res.status === 403
            ? 'Admin access required — sign in as an admin or use PIN elevation.'
            : res.status === 401
              ? 'Session expired — sign in again.'
              : `Could not save (${res.status})`;
      return { ok: false, message: msg };
    }
    return { ok: true, data };
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      if (entry) {
        const res = await fetch(`${getApiBase()}/api/integrations/${integrationId}/entries/${entry.id}`, {
          credentials: 'include',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, config: values }),
        });
        const parsed = parseSaveResponse(res, await res.text());
        if (!parsed.ok) {
          setSaveError(parsed.message);
          return;
        }
        onSaved({ kind: 'updated', entryId: entry.id });
        onClose();
      } else {
        const res = await fetch(`${getApiBase()}/api/integrations/${integrationId}/entries`, {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, config: values }),
        });
        const parsed = parseSaveResponse(res, await res.text());
        if (!parsed.ok) {
          setSaveError(parsed.message);
          return;
        }
        if (!parsed.data.id) {
          setSaveError('Invalid response from server');
          return;
        }
        onSaved({ kind: 'created', entryId: parsed.data.id });
        onClose();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error — is the backend running on port 3000?');
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
              <button type="button" className="rounded-md p-1 hover:bg-[var(--color-bg-hover)] transition-colors">
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
                    const res = await fetch(`${getApiBase()}/api/settings`, { credentials: 'include' });
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

          {saveError ? (
            <p className="mx-5 text-xs rounded-lg border px-3 py-2" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>
              {saveError}
            </p>
          ) : null}

          {/* Footer */}
          <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={() => void handleSave()}
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
