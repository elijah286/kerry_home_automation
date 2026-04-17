'use client';

// ---------------------------------------------------------------------------
// Settings → Device classes
//
// Admin overview of the device_class taxonomy. Two jobs:
//   1. At-a-glance counts: how many devices are unclassified, how many got
//      their class from a bridge, admin, or the LLM.
//   2. Two bulk actions:
//        - "Infer missing" — safe, only classifies devices where device_class
//          is currently null.
//        - "Regenerate all" — nuclear, re-classifies every device, overwriting
//          admin and bridge values. Confirm dialog required.
//
// Both run server-side via SSE so the admin sees live progress — important
// for installs with 500+ devices, where the whole run can take minutes.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Wand2, Loader2, Check } from 'lucide-react';
import type { DeviceState } from '@ha/shared';
import { deviceClassLabel } from '@ha/shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { inferDeviceClassesBulk, type InferenceProgress } from '@/lib/api-device-cards';

export default function DeviceClassesSettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { devices } = useWebSocket();
  const [mode, setMode] = useState<'idle' | 'running' | 'confirming'>('idle');
  const [currentJob, setCurrentJob] = useState<'missing' | 'all' | null>(null);
  const [progress, setProgress] = useState<InferenceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // -- Roll up counts by source -------------------------------------------
  const counts = useMemo(() => {
    const result = { total: devices.length, unclassified: 0, bridge: 0, admin: 0, llm: 0 };
    for (const d of devices) {
      if (!d.device_class) result.unclassified++;
      else if (d.device_class_source === 'bridge') result.bridge++;
      else if (d.device_class_source === 'admin') result.admin++;
      else if (d.device_class_source === 'llm') result.llm++;
    }
    return result;
  }, [devices]);

  // -- Roll up counts by class --------------------------------------------
  const byClass = useMemo(() => {
    const map = new Map<string, DeviceState[]>();
    for (const d of devices) {
      const key = d.device_class ?? '__none__';
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([cls, list]) => ({ cls, list }))
      .sort((a, b) => {
        // Unclassified first (it's the thing the admin probably cares about)
        if (a.cls === '__none__') return -1;
        if (b.cls === '__none__') return 1;
        return b.list.length - a.list.length;
      });
  }, [devices]);

  const runInference = useCallback(async (jobMode: 'missing' | 'all') => {
    setCurrentJob(jobMode);
    setMode('running');
    setProgress(null);
    setError(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      for await (const evt of inferDeviceClassesBulk(jobMode, controller.signal)) {
        setProgress(evt);
        if (evt.kind === 'done') break;
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        // Normal abort — leave progress showing the last state.
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setMode('idle');
      setAbortController(null);
    }
  }, []);

  const cancel = useCallback(() => {
    abortController?.abort();
  }, [abortController]);

  // Clean up on unmount — unterminated fetch can leak the connection.
  useEffect(() => () => abortController?.abort(), [abortController]);

  if (!authLoading && !isAdmin) {
    return (
      <div className="mx-auto max-w-2xl xl:max-w-5xl p-4 lg:p-6">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          This page is only available to admins.
        </p>
      </div>
    );
  }

  const running = mode === 'running';
  const confirming = mode === 'confirming';

  return (
    <div className="mx-auto max-w-2xl xl:max-w-5xl p-4 lg:p-6">
      <PageHeader
        icon={Sparkles}
        title="Device classes"
        subtitle="Classify devices into a controlled vocabulary so the dashboard can render the right default card for each one."
        back="/settings"
      />

      {/* Roll-up stats */}
      <div
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        role="group"
        aria-label="Device class counts by source"
      >
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Unclassified" value={counts.unclassified} tone={counts.unclassified > 0 ? 'warning' : 'default'} />
        <StatCard label="From bridge" value={counts.bridge} />
        <StatCard label="By admin / LLM" value={counts.admin + counts.llm} />
      </div>

      {/* Actions */}
      <div
        className="mb-4 rounded-[var(--radius)] border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <h2 className="mb-2 text-sm font-medium">Inference</h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The LLM reads each device's name, integration, and unit, then picks a class from the taxonomy.
          Costs ~1 API call per device. Missing-only is safe; Regenerate overwrites everything.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runInference('missing')}
            disabled={running || counts.unclassified === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {running && currentJob === 'missing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Infer {counts.unclassified > 0 ? `${counts.unclassified} missing` : 'missing'}
          </button>

          <button
            type="button"
            onClick={() => setMode('confirming')}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Regenerate all
          </button>

          {running && (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--color-text-muted)' }}>
                {progress.kind === 'done' ? (
                  <>
                    <Check className="mr-1 inline h-3 w-3" style={{ color: 'var(--color-success)' }} />
                    Done — {progress.done}/{progress.total}
                  </>
                ) : (
                  `${progress.done ?? 0}/${progress.total ?? 0}`
                )}
              </span>
              {progress.deviceId && progress.kind === 'progress' && (
                <span className="truncate font-mono text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {progress.deviceId} → {progress.device_class}
                </span>
              )}
            </div>
            <div
              className="h-1 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${
                    progress.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : 0
                  }%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
      </div>

      {/* Breakdown by class */}
      <div
        className="rounded-[var(--radius)] border"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <div
          className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wider"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          By class
        </div>
        <ul>
          {byClass.map(({ cls, list }) => (
            <li
              key={cls}
              className="flex items-center justify-between border-b px-4 py-2 text-sm last:border-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span style={{ color: cls === '__none__' ? 'var(--color-warning)' : 'var(--color-text)' }}>
                {cls === '__none__' ? '(Unclassified)' : deviceClassLabel(cls)}
              </span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {list.length}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Confirm dialog for regenerate-all */}
      {confirming && (
        <ConfirmDialog
          onCancel={() => setMode('idle')}
          onConfirm={() => {
            setMode('idle');
            void runInference('all');
          }}
          count={counts.total}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (local to this route — not worth hoisting)
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className="rounded-[var(--radius)] border px-3 py-2"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
    >
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      <p
        className="text-lg font-semibold tabular-nums"
        style={{ color: tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text)' }}
      >
        {value}
      </p>
    </div>
  );
}

function ConfirmDialog({
  onCancel,
  onConfirm,
  count,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  count: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius)] border p-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-danger)' }} />
          <div>
            <h3 className="text-sm font-semibold">Regenerate device classes for all {count} devices?</h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              This will overwrite any classes set by admins or bridges with the LLM's best guess. Values
              already produced by the LLM get re-inferred. You can't undo this without restoring from a
              backup.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: 'var(--color-danger)' }}
          >
            Regenerate all
          </button>
        </div>
      </div>
    </div>
  );
}
