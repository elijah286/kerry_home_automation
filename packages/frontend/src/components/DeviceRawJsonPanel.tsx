'use client';

import { useMemo } from 'react';
import { ClipboardCopy, RefreshCw } from 'lucide-react';
import { stableStringify } from '@/lib/json-stable-stringify';
import type { DeviceState } from '@ha/shared';

export function DeviceRawJsonPanelBody({
  display,
  loading,
  error,
  onReload,
}: {
  display: DeviceState;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const text = useMemo(() => stableStringify(display), [display]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5 mb-3">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>

      {error && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}

      <pre
        className="text-[11px] leading-relaxed overflow-auto max-h-[min(75vh,800px)] p-3 rounded-md border font-mono"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        {text}
      </pre>
    </>
  );
}
