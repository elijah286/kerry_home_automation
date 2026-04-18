'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { getApiBase, apiFetch } from '@/lib/api-base';

// uPlot is dynamically imported to avoid SSR issues (it touches `document`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UPlotInstance = any;

export type SystemMetric = 'cpu' | 'memory' | 'disk';

interface Sample {
  ts: number;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
}

export const SYSTEM_STATS_RANGE_PRESETS = [
  { label: '1h',  ms: 3_600_000 },
  { label: '6h',  ms: 21_600_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '7d',  ms: 604_800_000 },
] as const;

const RANGE_PRESETS = SYSTEM_STATS_RANGE_PRESETS;

const METRIC_LABEL: Record<SystemMetric, string> = {
  cpu:    'CPU',
  memory: 'Memory',
  disk:   'Disk',
};

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function valueForMetric(s: Sample, metric: SystemMetric): number {
  if (metric === 'cpu')    return s.cpuPercent;
  if (metric === 'memory') return s.memoryPercent;
  return s.diskPercent;
}

export function SystemStatsGraph({
  metric,
  height = 180,
  controlledRangeMs,
  hideRangePicker,
}: {
  metric: SystemMetric;
  height?: number;
  /** When provided, the caller controls the time window and the internal picker is hidden. */
  controlledRangeMs?: number;
  /** Hide the internal range-preset buttons (e.g. when a parent renders its own). */
  hideRangePicker?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<UPlotInstance | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uPlotCtorRef = useRef<any>(null);

  const [internalRangeMs, setRangeMs] = useState<number>(RANGE_PRESETS[2].ms);
  const rangeMs = controlledRangeMs ?? internalRangeMs;
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Fetch history whenever the range changes, and then every 10s so the
  // graph keeps pace with live samples without hammering the backend.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const now = Date.now();
      const from = new Date(now - rangeMs).toISOString();
      const to   = new Date(now).toISOString();
      void apiFetch(`${getApiBase()}/api/system/stats/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as { samples: Sample[] };
          if (cancelled) return;
          setSamples(data.samples);
          setError(null);
        })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    };
    load();
    const id = window.setInterval(load, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [rangeMs]);

  // uPlot data arrays: [timestamps_in_seconds, values_0_to_100]
  const plotData = useMemo<[Float64Array, Float64Array] | null>(() => {
    if (!samples || samples.length === 0) return null;
    const ts = new Float64Array(samples.length);
    const vs = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      ts[i] = samples[i].ts / 1000;
      vs[i] = valueForMetric(samples[i], metric);
    }
    return [ts, vs];
  }, [samples, metric]);

  // Build / rebuild the uPlot instance whenever the data changes.
  useEffect(() => {
    if (!containerRef.current || !plotData) return;
    let cancelled = false;

    (async () => {
      if (!uPlotCtorRef.current) {
        const [mod] = await Promise.all([
          import('uplot'),
          // @ts-expect-error CSS import has no types
          import('uplot/dist/uPlot.min.css'),
        ]);
        uPlotCtorRef.current = mod.default;
      }
      if (cancelled) return;
      const UPlot = uPlotCtorRef.current;
      const container = containerRef.current;
      if (!container) return;

      const gridColor = getCssVar('--color-chart-grid',    '#2a2f3a');
      const textColor = getCssVar('--color-chart-text',    '#94a3b8');
      const lineColor = getCssVar('--color-accent',        '#60a5fa');
      const dangerCol = getCssVar('--color-danger',        '#ef4444');
      const warningCol = getCssVar('--color-warning',      '#f59e0b');

      // Current value decides the line color — danger above 85%, warning 65-85%.
      const last = plotData[1][plotData[1].length - 1];
      const color = last > 85 ? dangerCol : last > 65 ? warningCol : lineColor;

      if (plotRef.current) {
        try { plotRef.current.destroy(); } catch { /* noop */ }
        plotRef.current = null;
      }

      plotRef.current = new UPlot(
        {
          width: container.clientWidth,
          height,
          scales: { y: { range: [0, 100] } },
          axes: [
            { stroke: textColor, grid: { stroke: gridColor, width: 1 } },
            {
              stroke: textColor,
              grid: { stroke: gridColor, width: 1 },
              values: (_u: unknown, ticks: number[]) => ticks.map((t) => `${t}%`),
            },
          ],
          series: [
            {},
            {
              label: METRIC_LABEL[metric],
              stroke: color,
              width: 1.5,
              fill: `color-mix(in srgb, ${color} 12%, transparent)`,
              points: { show: false },
            },
          ],
          cursor: { points: { size: 6 } },
          legend: { show: false },
        },
        plotData,
        container,
      );

      // Resize on container changes
      const ro = new ResizeObserver(() => {
        if (!plotRef.current || !container) return;
        plotRef.current.setSize({ width: container.clientWidth, height });
      });
      ro.observe(container);
    })();

    return () => {
      cancelled = true;
      if (plotRef.current) {
        try { plotRef.current.destroy(); } catch { /* noop */ }
        plotRef.current = null;
      }
    };
  }, [plotData, metric, height]);

  const showPicker = !hideRangePicker && controlledRangeMs === undefined;

  return (
    <div className="mt-3">
      {showPicker && (
        <div className="mb-2 flex items-center gap-1 text-[11px]">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeMs(r.ms)}
              className="rounded border px-2 py-0.5 transition-colors"
              style={{
                borderColor: rangeMs === r.ms ? 'var(--color-accent)' : 'var(--color-border)',
                backgroundColor: rangeMs === r.ms
                  ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                  : 'transparent',
                color: 'var(--color-text-secondary)',
              }}
            >
              {r.label}
            </button>
          ))}
          {samples && (
            <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {samples.length} samples
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded border px-2 py-1.5 text-[11px]"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {!error && samples && samples.length === 0 && (
        <div className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>
          No samples yet — the system monitor writes one every 30 seconds.
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', minHeight: height }} />
    </div>
  );
}
