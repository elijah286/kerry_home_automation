'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
// uPlot is dynamically imported to avoid SSR issues (it accesses DOM)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type uPlotInstance = any;
import { fetchDeviceHistoryRange } from '@/lib/api';
import { getValueAtSegments } from '@/lib/object-path';
import { getFieldUnit, findUnitFamily, convertToBase, bestDisplayUnit, areUnitsCompatible } from './units';
import { Settings, Eye, EyeOff, RotateCcw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Signal {
  deviceId: string;
  field: string;
  /** When set, read nested values (e.g. ecobee fields); otherwise `field` is a top-level key */
  fieldPath?: string[];
  label: string;
  color?: string;
  unit?: string;
}

interface TimeSeriesGraphProps {
  signals: Signal[];
  from?: Date;
  to?: Date;
  height?: number;
  className?: string;
}

interface ResolvedSignal extends Signal {
  resolvedUnit: string | null;
  compatible: boolean;
  colorFinal: string;
}

// ---------------------------------------------------------------------------
// CSS-var reader
// ---------------------------------------------------------------------------

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const CHART_COLORS = Array.from({ length: 8 }, (_, i) => `--color-chart-${i + 1}`);

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

export function TimeSeriesGraph({ signals, from, to, height = 280, className }: TimeSeriesGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlotInstance | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uPlotRef = useRef<any>(null);

  // State
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any[] | null>(null);
  const [resolvedSignals, setResolvedSignals] = useState<ResolvedSignal[]>([]);
  const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
  const [showControls, setShowControls] = useState(false);
  const [rangeMs, setRangeMs] = useState(from ? 0 : 86_400_000); // default 24h if no from given
  const [customFrom, setCustomFrom] = useState(from ?? new Date(Date.now() - 86_400_000));
  const [customTo, setCustomTo] = useState(to ?? new Date());
  const [fetchKey, setFetchKey] = useState(0); // manual trigger for re-fetch

  // Stable memoized date values (avoid new Date() on every render)
  const effectiveFromMs = rangeMs > 0 ? Date.now() - rangeMs : customFrom.getTime();
  const effectiveToMs = rangeMs > 0 ? Date.now() : customTo.getTime();

  // Stable signal key for memoization
  const signalKey = useMemo(
    () => signals.map((s) => `${s.deviceId}:${s.field}:${s.fieldPath?.join('/') ?? ''}`).join(','),
    [signals],
  );

  // Resolve signals: assign colors, determine units, compatibility
  const resolved = useMemo(() => {
    let primaryUnit: string | null = null;
    return signals.map((s, i): ResolvedSignal => {
      const unitKey = s.fieldPath?.length ? s.fieldPath[s.fieldPath.length - 1]! : s.field;
      const resolvedUnit = getFieldUnit(unitKey, s.unit);
      let compatible = true;
      if (resolvedUnit) {
        if (!primaryUnit) {
          primaryUnit = resolvedUnit;
        } else {
          compatible = areUnitsCompatible(primaryUnit, resolvedUnit);
        }
      }
      return {
        ...s,
        resolvedUnit,
        compatible,
        colorFinal: s.color ?? (getCssVar(CHART_COLORS[i % CHART_COLORS.length]) || `hsl(${i * 47}, 70%, 55%)`),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalKey]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const fromDate = new Date(effectiveFromMs);
    const toDate = new Date(effectiveToMs);
    try {
      const compatibleSignals = resolved.filter((s) => s.compatible);
      if (compatibleSignals.length === 0) {
        setData(null);
        setResolvedSignals(resolved);
        setLoading(false);
        return;
      }

      // Determine the primary unit family for conversion
      const primaryUnit = compatibleSignals[0].resolvedUnit;
      const family = primaryUnit ? findUnitFamily(primaryUnit) : null;

      // Fetch history for each signal
      const histories = await Promise.all(
        compatibleSignals.map((s) =>
          fetchDeviceHistoryRange(s.deviceId, fromDate, toDate)
            .then((r) => r.history)
            .catch(() => []),
        ),
      );

      // Build unified timestamp array and aligned value arrays
      // Collect all unique timestamps
      const tsSet = new Set<number>();
      const signalMaps: Map<number, number>[] = compatibleSignals.map(() => new Map());

      histories.forEach((h, si) => {
        h.forEach((entry) => {
          const ts = Math.floor(new Date(entry.changedAt).getTime() / 1000); // uPlot uses seconds
          tsSet.add(ts);
          const sig = compatibleSignals[si];
          const st = entry.state as Record<string, unknown>;
          const raw =
            sig.fieldPath && sig.fieldPath.length > 0
              ? getValueAtSegments(st, sig.fieldPath)
              : st[sig.field];
          if (typeof raw === 'number') {
            let val = raw;
            const sigUnit = compatibleSignals[si].resolvedUnit;
            if (sigUnit && family) {
              val = convertToBase(val, sigUnit, family);
            }
            signalMaps[si].set(ts, val);
          }
        });
      });

      const timestamps = Array.from(tsSet).sort((a, b) => a - b);

      if (timestamps.length === 0) {
        setData(null);
        setResolvedSignals(resolved);
        setLoading(false);
        return;
      }

      // Build aligned data: [timestamps, ...values]
      // Use step interpolation (carry forward last known value)
      const alignedData: (Float64Array)[] = [
        new Float64Array(timestamps),
        ...compatibleSignals.map((_, si) => {
          const arr = new Float64Array(timestamps.length);
          let lastVal = NaN;
          for (let i = 0; i < timestamps.length; i++) {
            const v = signalMaps[si].get(timestamps[i]);
            if (v !== undefined) {
              lastVal = v;
            }
            arr[i] = lastVal;
          }
          return arr;
        }),
      ];

      // Determine best display unit
      if (family) {
        const allVals = alignedData.slice(1).flatMap((a) => Array.from(a as Float64Array).filter((v) => !isNaN(v)));
        const { unit: dispUnit, divisor } = bestDisplayUnit(allVals, family);
        if (divisor !== 1) {
          // Rescale values
          for (let si = 1; si < alignedData.length; si++) {
            const arr = alignedData[si] as Float64Array;
            for (let i = 0; i < arr.length; i++) {
              if (!isNaN(arr[i])) arr[i] /= divisor;
            }
          }
          // Update resolved signals to show display unit
          compatibleSignals.forEach((s) => { s.resolvedUnit = dispUnit; });
        }
      }

      setData(alignedData);
      setResolvedSignals(resolved);
    } catch {
      setData(null);
      setResolvedSignals(resolved);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalKey, rangeMs, fetchKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build/rebuild uPlot (dynamic import to avoid SSR)
  useEffect(() => {
    if (!containerRef.current || !data || data[0].length === 0) return;

    let cancelled = false;

    (async () => {
      // Dynamic import — only runs client-side
      if (!uPlotRef.current) {
        const [mod] = await Promise.all([
          import('uplot'),
          // @ts-expect-error CSS import
          import('uplot/dist/uPlot.min.css'),
        ]);
        uPlotRef.current = mod.default;
      }
      if (cancelled) return;
      const uPlot = uPlotRef.current;

      const container = containerRef.current;
      if (!container) return;

      const compatibleSignals = resolvedSignals.filter((s) => s.compatible);

      const gridColor = getCssVar('--color-chart-grid') || '#e2e8f0';
      const textColor = getCssVar('--color-chart-text') || '#64748b';
      const tooltipBg = getCssVar('--color-chart-tooltip-bg') || '#fff';
      const tooltipBorder = getCssVar('--color-chart-tooltip-border') || '#e2e8f0';

      const displayUnit = compatibleSignals[0]?.resolvedUnit ?? '';

      // Tooltip plugin
      const tooltipEl = document.createElement('div');
      tooltipEl.style.cssText = `
        position: absolute; pointer-events: none; z-index: 50;
        padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5;
        background: ${tooltipBg}; border: 1px solid ${tooltipBorder};
        color: ${textColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        display: none; white-space: nowrap;
      `;

      const tooltipPlugin = {
        hooks: {
          init: (u: uPlotInstance) => {
            u.over.appendChild(tooltipEl);
          },
          setCursor: (u: uPlotInstance) => {
            const idx = u.cursor.idx;
            if (idx == null) {
              tooltipEl.style.display = 'none';
              return;
            }
            const ts = (data[0] as Float64Array)[idx];
            const date = new Date(ts * 1000);
            let html = `<div style="font-weight:600;margin-bottom:4px">${date.toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
            })}</div>`;
            compatibleSignals.forEach((s, si) => {
              if (hiddenSeries.has(si)) return;
              const val = (data[si + 1] as Float64Array)[idx];
              if (isNaN(val)) return;
              html += `<div style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${s.colorFinal};flex-shrink:0"></span>
                <span>${s.label}: <strong>${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${displayUnit}</strong></span>
              </div>`;
            });
            tooltipEl.innerHTML = html;
            tooltipEl.style.display = 'block';

            const { left, top } = u.cursor;
            const overRect = u.over.getBoundingClientRect();
            const ttRect = tooltipEl.getBoundingClientRect();
            const x = (left ?? 0) + 12;
            const y = (top ?? 0) - ttRect.height / 2;
            tooltipEl.style.left = `${x + ttRect.width > overRect.width ? (left ?? 0) - ttRect.width - 12 : x}px`;
            tooltipEl.style.top = `${Math.max(0, Math.min(y, overRect.height - ttRect.height))}px`;
          },
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [
        {}, // time axis
        ...compatibleSignals.map((s, si) => ({
          label: s.label,
          stroke: s.colorFinal,
          width: 2,
          show: !hiddenSeries.has(si),
          spanGaps: true,
          points: { show: false },
          paths: uPlot.paths.stepped!({ align: 1 }),
        })),
      ];

      const opts = {
        width: container.clientWidth,
        height,
        cursor: {
          drag: { x: true, y: false, setScale: true },
          focus: { prox: 30 },
          points: { show: false },
        },
        scales: {
          x: { time: true },
          y: { auto: true },
        },
        axes: [
          {
            stroke: textColor,
            grid: { stroke: gridColor, width: 1 },
            ticks: { stroke: gridColor, width: 1 },
            font: '11px system-ui',
          },
          {
            stroke: textColor,
            grid: { stroke: gridColor, width: 1 },
            ticks: { stroke: gridColor, width: 1 },
            font: '11px system-ui',
            label: displayUnit,
            labelFont: '12px system-ui',
            size: 60,
          },
        ],
        series,
        plugins: [tooltipPlugin],
        legend: { show: false },
      };

      plotRef.current?.destroy();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plotRef.current = new uPlot(opts as any, data, container);
    })();

    return () => {
      cancelled = true;
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [data, resolvedSignals, hiddenSeries, height]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  const toggleSeries = (idx: number) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const incompatible = resolvedSignals.filter((s) => !s.compatible);
  const compatible = resolvedSignals.filter((s) => s.compatible);

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
        title="Graph controls"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {/* Floating toolbar */}
      {showControls && (
        <div
          className="absolute top-8 right-1 z-20 rounded-lg p-3 space-y-3 min-w-[200px]"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {/* Time range */}
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Time Range
            </div>
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

          {/* Legend / signal toggle */}
          {compatible.length > 1 && (
            <div>
              <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Signals
              </div>
              <div className="space-y-1">
                {compatible.map((s, i) => (
                  <button
                    key={`${s.deviceId}-${s.field}`}
                    onClick={() => toggleSeries(i)}
                    className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: s.colorFinal,
                        opacity: hiddenSeries.has(i) ? 0.3 : 1,
                      }}
                    />
                    <span
                      style={{
                        color: hiddenSeries.has(i) ? 'var(--color-text-muted)' : 'var(--color-text)',
                        textDecoration: hiddenSeries.has(i) ? 'line-through' : 'none',
                      }}
                    >
                      {s.label}
                    </span>
                    {hiddenSeries.has(i) ? (
                      <EyeOff className="h-3 w-3 ml-auto" style={{ color: 'var(--color-text-muted)' }} />
                    ) : (
                      <Eye className="h-3 w-3 ml-auto" style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset zoom */}
          <button
            onClick={() => {
              if (plotRef.current) {
                plotRef.current.setScale('x', {
                  min: (data?.[0] as Float64Array)?.[0] ?? 0,
                  max: (data?.[0] as Float64Array)?.[(data?.[0]?.length ?? 1) - 1] ?? 0,
                });
              }
            }}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors w-full"
            style={{ color: 'var(--color-accent)' }}
          >
            <RotateCcw className="h-3 w-3" /> Reset zoom
          </button>
        </div>
      )}

      {/* Incompatible units warning */}
      {incompatible.length > 0 && (
        <div className="text-xs px-2 py-1 rounded mb-1" style={{ color: 'var(--color-warning)', backgroundColor: 'var(--color-bg-secondary)' }}>
          Signals with incompatible units hidden: {incompatible.map((s) => s.label).join(', ')}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="h-5 w-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-accent)' }} />
        </div>
      )}

      {/* No data */}
      {!loading && (!data || data[0].length === 0) && (
        <div className="flex items-center justify-center text-sm" style={{ height, color: 'var(--color-text-muted)' }}>
          No history data for this time range
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} className="w-full" style={{ display: loading || !data || data[0].length === 0 ? 'none' : 'block' }} />

      {/* Inline mini legend (always visible, compact) */}
      {!loading && data && data[0].length > 0 && compatible.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
          {compatible.map((s, i) => (
            <button
              key={`${s.deviceId}-${s.field}`}
              onClick={() => toggleSeries(i)}
              className="flex items-center gap-1.5 text-xs transition-opacity"
              style={{ opacity: hiddenSeries.has(i) ? 0.4 : 1 }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.colorFinal }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
