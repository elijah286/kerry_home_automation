'use client';

import { useMemo } from 'react';
import { TimeSeriesGraph } from '@/components/viz/TimeSeriesGraph';
import { StateTimeline } from '@/components/viz/StateTimeline';
import { formatFieldPath } from '@/lib/object-path';
import { getFieldUnit } from '@/components/viz/units';

function classify(
  value: unknown,
): 'number' | 'boolean' | 'string' | 'null' | 'other' {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'string') return 'string';
  return 'other';
}

export function DeviceFieldHistoryContent({
  deviceId,
  path,
  liveValue,
}: {
  deviceId: string;
  path: string[];
  liveValue: unknown;
}) {
  const label = formatFieldPath(path);
  const leafKey = path[path.length - 1] ?? path[0] ?? 'value';
  const kind = classify(liveValue);

  const graphSignal = useMemo(
    () => ({
      deviceId,
      field: leafKey,
      fieldPath: path,
      label,
      unit: getFieldUnit(leafKey, undefined) ?? undefined,
    }),
    [deviceId, path, leafKey, label],
  );

  const timelineItem = useMemo(
    () => ({
      deviceId,
      field: leafKey,
      fieldPath: path,
      label,
    }),
    [deviceId, path, leafKey, label],
  );

  if (kind === 'other' || kind === 'null') {
    return (
      <div className="space-y-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <p>
          Historical charts work for numeric, boolean, and string fields. Objects and arrays are not
          aggregated here — use <strong>Raw JSON</strong> to inspect nested snapshots.
        </p>
        <p className="text-xs font-mono break-all" style={{ color: 'var(--color-text-muted)' }}>
          Current: {liveValue === undefined ? 'undefined' : JSON.stringify(liveValue)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Current value
        </div>
        <div className="mt-1 font-mono text-sm break-all" style={{ color: 'var(--color-text)' }}>
          {kind === 'boolean' ? (liveValue ? 'true' : 'false') : String(liveValue)}
        </div>
      </div>

      {kind === 'number' && (
        <TimeSeriesGraph signals={[graphSignal]} height={260} />
      )}

      {(kind === 'boolean' || kind === 'string') && (
        <StateTimeline items={[timelineItem]} height={48} />
      )}
    </div>
  );
}
