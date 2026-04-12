'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
/* eslint-disable react-hooks/exhaustive-deps */
import { fetchDeviceHistoryRange } from '@/lib/api';
import { Settings } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateTimelineItem {
  deviceId: string;
  field: string;
  label: string;
  /** Optional explicit color map: stateValue → CSS color */
  colorMap?: Record<string, string>;
}

interface StateTimelineProps {
  items: StateTimelineItem[];
  from?: Date;
  to?: Date;
  height?: number;
  className?: string;
}

interface Segment {
  value: string;
  from: number; // epoch ms
  to: number;   // epoch ms
  color: string;
}

// ---------------------------------------------------------------------------
// Color palette for auto-assignment
// ---------------------------------------------------------------------------

const STATE_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#f97316', '#6366f1', '#14b8a6',
];

const BOOLEAN_COLORS: Record<string, string> = {
  true: '#22c55e',
  false: '#64748b',
  on: '#22c55e',
  off: '#64748b',
  'Turned on': '#22c55e',
  'Turned off': '#64748b',
};

function assignColor(value: string, index: number, colorMap?: Record<string, string>): string {
  if (colorMap?.[value]) return colorMap[value];
  if (BOOLEAN_COLORS[value]) return BOOLEAN_COLORS[value];
  return STATE_PALETTE[index % STATE_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Time range presets
// ---------------------------------------------------------------------------

const RANGE_PRESETS = [
  { label: '1h', ms: 3_600_000 },
  { label: '6h', ms: 21_600_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '3d', ms: 259_200_000 },
  { label: '7d', ms: 604_800_000 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StateTimeline({ items, from, to, height = 40, className }: StateTimelineProps) {
  const [loading, setLoading] = useState(true);
  const [itemSegments, setItemSegments] = useState<Segment[][]>([]);
  const [rangeMs, setRangeMs] = useState(from ? 0 : 86_400_000);
  const [showControls, setShowControls] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<{ itemIdx: number; seg: Segment; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [fetchKey] = useState(0);
  const effectiveFromMs = rangeMs > 0 ? Date.now() - rangeMs : (from ?? new Date(Date.now() - 86_400_000)).getTime();
  const effectiveToMs = rangeMs > 0 ? Date.now() : (to ?? new Date()).getTime();

  // Stable item key
  const itemKey = useMemo(
    () => items.map((i) => `${i.deviceId}:${i.field}`).join(','),
    [items],
  );

  // Memoized date objects from stable ms values (only recalculated on actual changes)
  const effectiveFrom = useMemo(() => new Date(effectiveFromMs), [effectiveFromMs]);
  const effectiveTo = useMemo(() => new Date(effectiveToMs), [effectiveToMs]);
  const totalMs = effectiveToMs - effectiveFromMs;

  useEffect(() => {
    setLoading(true);
    const fromDate = new Date(effectiveFromMs);
    const toDate = new Date(effectiveToMs);
    Promise.all(
      items.map((item) =>
        fetchDeviceHistoryRange(item.deviceId, fromDate, toDate)
          .then((r) => r.history)
          .catch(() => []),
      ),
    ).then((histories) => {
      const allSegments: Segment[][] = histories.map((history, itemIdx) => {
        const item = items[itemIdx];
        if (history.length === 0) return [];

        // Track unique values for color assignment
        const uniqueValues: string[] = [];
        const segments: Segment[] = [];

        for (let i = 0; i < history.length; i++) {
          const entry = history[i];
          const rawValue = entry.state[item.field];
          const value = String(rawValue ?? 'unknown');
          const ts = new Date(entry.changedAt).getTime();
          const nextTs = i < history.length - 1
            ? new Date(history[i + 1].changedAt).getTime()
            : effectiveTo.getTime();

          if (!uniqueValues.includes(value)) uniqueValues.push(value);
          const colorIdx = uniqueValues.indexOf(value);

          segments.push({
            value,
            from: ts,
            to: nextTs,
            color: assignColor(value, colorIdx, item.colorMap),
          });
        }
        return segments;
      });
      setItemSegments(allSegments);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, rangeMs]);

  // Build time axis labels
  const timeLabels = useMemo(() => {
    const labels: { pos: number; text: string }[] = [];
    const count = 6;
    for (let i = 0; i <= count; i++) {
      const t = effectiveFrom.getTime() + (totalMs * i) / count;
      const d = new Date(t);
      labels.push({
        pos: (i / count) * 100,
        text: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      });
    }
    return labels;
  }, [effectiveFrom.getTime(), totalMs]);

  const barHeight = height;

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Toolbar toggle */}
      <button
        onClick={() => setShowControls((p) => !p)}
        className="absolute top-1 right-1 z-10 p-1.5 rounded-md transition-colors"
        style={{
          backgroundColor: showControls ? 'var(--color-bg-hover)' : 'transparent',
          color: 'var(--color-text-muted)',
        }}
        title="Timeline controls"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {/* Controls */}
      {showControls && (
        <div
          className="absolute top-8 right-1 z-20 rounded-lg p-3 min-w-[180px]"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Time Range</div>
          <div className="flex flex-wrap gap-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setRangeMs(p.ms)}
                className="px-2 py-0.5 text-xs rounded-md transition-colors border"
                style={{
                  backgroundColor: rangeMs === p.ms ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: rangeMs === p.ms ? '#fff' : 'var(--color-text-secondary)',
                  borderColor: rangeMs === p.ms ? 'var(--color-accent)' : 'var(--color-border)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="h-5 w-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-accent)' }} />
        </div>
      )}

      {!loading && (
        <div ref={containerRef} className="space-y-1">
          {items.map((item, itemIdx) => {
            const segments = itemSegments[itemIdx] ?? [];
            return (
              <div key={`${item.deviceId}-${item.field}`}>
                <div className="text-xs mb-0.5" style={{ color: 'var(--color-text-muted)' }}>{item.label}</div>
                <div
                  className="relative w-full rounded overflow-hidden"
                  style={{ height: barHeight, backgroundColor: 'var(--color-bg-secondary)' }}
                >
                  {segments.map((seg, si) => {
                    const left = ((seg.from - effectiveFrom.getTime()) / totalMs) * 100;
                    const width = ((seg.to - seg.from) / totalMs) * 100;
                    return (
                      <div
                        key={si}
                        className="absolute top-0 bottom-0 transition-opacity hover:opacity-80 cursor-default"
                        style={{
                          left: `${Math.max(0, left)}%`,
                          width: `${Math.min(100 - Math.max(0, left), width)}%`,
                          backgroundColor: seg.color,
                        }}
                        onMouseEnter={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          setHoveredSegment({
                            itemIdx,
                            seg,
                            x: e.clientX - (rect?.left ?? 0),
                            y: e.clientY - (rect?.top ?? 0),
                          });
                        }}
                        onMouseLeave={() => setHoveredSegment(null)}
                      />
                    );
                  })}
                </div>
                {/* Inline legend for this item */}
                {segments.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {[...new Map(segments.map((s) => [s.value, s.color]))].map(([value, color]) => (
                      <span key={value} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                        {value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Shared time axis */}
          <div className="relative h-4 mt-1">
            {timeLabels.map((l, i) => (
              <span
                key={i}
                className="absolute text-[10px] -translate-x-1/2"
                style={{ left: `${l.pos}%`, color: 'var(--color-text-muted)' }}
              >
                {l.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredSegment && containerRef.current && (
        <div
          className="absolute z-30 rounded-md px-2.5 py-1.5 text-xs pointer-events-none"
          style={{
            left: hoveredSegment.x + 12,
            top: hoveredSegment.y - 40,
            backgroundColor: 'var(--color-chart-tooltip-bg)',
            border: '1px solid var(--color-chart-tooltip-border)',
            color: 'var(--color-text)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <div className="font-medium">{hoveredSegment.seg.value}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>
            {new Date(hoveredSegment.seg.from).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {' \u2013 '}
            {new Date(hoveredSegment.seg.to).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  );
}
