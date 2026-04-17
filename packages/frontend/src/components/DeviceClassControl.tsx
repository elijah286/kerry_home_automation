'use client';

// ---------------------------------------------------------------------------
// Per-device device_class control.
//
// A labelled <Select> of the full taxonomy, grouped by category for scanability,
// plus a "Suggest" button that calls the LLM inference endpoint to propose a
// class. Accepting the suggestion saves it with source='llm'.
//
// Admin-only at the route level — this component doesn't gate itself because
// the caller (device detail page) checks `useAuth().isAdmin` before mounting.
//
// Source badge: the taxonomy has three possible origins — bridge (integration
// told us), admin (human set it), llm (AI guess). We surface the source next
// to the control so the admin can tell what they're overriding.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { DEVICE_CLASS_GROUPS, deviceClassLabel } from '@ha/shared';
import type { DeviceState } from '@ha/shared';
import { inferDeviceClass, setDeviceClass } from '@/lib/api-device-cards';
import { Select } from './ui/Select';

interface DeviceClassControlProps {
  device: DeviceState;
  /** Called after a save succeeds so the caller can refresh local state. */
  onChange?: (deviceClass: string | null, source: 'admin' | 'llm' | null) => void;
}

interface Suggestion {
  device_class: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

// Build flat options list from the grouped taxonomy. We prefix each option
// label with its group name so the user sees `Environment · Temperature`
// rather than bare `Temperature` — disambiguates classes that appear in
// multiple contexts (e.g. `light`, `gas`).
const CLASS_OPTIONS = DEVICE_CLASS_GROUPS.flatMap((group) =>
  group.classes.map((cls) => ({
    value: cls,
    label: `${group.label} · ${deviceClassLabel(cls)}`,
  })),
).concat([{ value: 'unknown', label: 'Unknown' }]);

const OPTIONS_WITH_NONE = [
  { value: '__none__', label: '(not set)' },
  ...CLASS_OPTIONS,
];

export function DeviceClassControl({ device, onChange }: DeviceClassControlProps) {
  const [currentClass, setCurrentClass] = useState<string | null>(device.device_class ?? null);
  const [currentSource, setCurrentSource] = useState<'bridge' | 'admin' | 'llm' | null>(
    device.device_class_source ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string | null, source: 'admin' | 'llm') => {
    setSaving(true);
    setError(null);
    const prev = currentClass;
    const prevSource = currentSource;
    setCurrentClass(next);
    setCurrentSource(next ? source : null);
    try {
      await setDeviceClass(device.id, next, source);
      onChange?.(next, next ? source : null);
    } catch (err: unknown) {
      setCurrentClass(prev);
      setCurrentSource(prevSource);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const result = await inferDeviceClass(device.id);
      setSuggestion(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    void save(suggestion.device_class, 'llm');
    setSuggestion(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Device class:
        </span>
        {currentSource && (
          <span
            className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
            title={`Set by ${currentSource}`}
          >
            {currentSource}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={currentClass ?? '__none__'}
          onValueChange={(v) => void save(v === '__none__' ? null : v, 'admin')}
          options={OPTIONS_WITH_NONE}
          className="flex-1"
          disabled={saving}
        />
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting || saving}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
          title="Ask the LLM to classify this device"
        >
          {suggesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Suggest
        </button>
      </div>

      {suggestion && (
        <div
          className="flex items-start gap-2 rounded-md border p-2 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <div className="flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span style={{ color: 'var(--color-text)' }}>
                Suggested: <strong>{deviceClassLabel(suggestion.device_class)}</strong>
              </span>
              <span
                className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  borderColor:
                    suggestion.confidence === 'high'
                      ? 'var(--color-success)'
                      : suggestion.confidence === 'medium'
                        ? 'var(--color-warning)'
                        : 'var(--color-border)',
                  color:
                    suggestion.confidence === 'high'
                      ? 'var(--color-success)'
                      : suggestion.confidence === 'medium'
                        ? 'var(--color-warning)'
                        : 'var(--color-text-muted)',
                }}
              >
                {suggestion.confidence}
              </span>
            </div>
            <p style={{ color: 'var(--color-text-muted)' }}>{suggestion.rationale}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={acceptSuggestion}
              className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]"
              title="Accept"
            >
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
