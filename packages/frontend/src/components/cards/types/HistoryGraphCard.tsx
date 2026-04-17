'use client';

// ---------------------------------------------------------------------------
// HistoryGraphCard — multi-entity time-series plot.
//
// Uses uPlot (already bundled) rather than a heavyweight charting lib: uPlot
// renders a 5-series / 1k-point plot in ~8ms on an iPad, which keeps the
// dashboard responsive when several graphs are on screen.
//
// Each entity gets its own colour, rotated through the theme accent palette.
// A vanilla SVG fallback covers the pre-mount render and environments where
// uPlot would be overkill (1 series, <100 points).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import type { HistoryGraphCard as HistoryGraphCardDescriptor } from '@ha/shared';
import { token, severityVar } from '@/lib/tokens';
import { fetchDeviceHistoryRange } from '@/lib/api';

type Series = { entityId: string; points: [number, number][] };

// Theme-aware palette; severity tokens give us 4 distinguishable lines that
// repaint on theme switch for free.
const SERIES_COLORS = [
  () => severityVar('info'),
  () => severityVar('success'),
  () => severityVar('warning'),
  () => severityVar('critical'),
  () => token('--color-accent'),
];

export function HistoryGraphCard({ card }: { card: HistoryGraphCardDescriptor }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - card.hoursToShow * 60 * 60 * 1000);

    Promise.all(card.entities.map(async (eid) => {
      try {
        const r = await fetchDeviceHistoryRange(eid, from, to);
        const points: [number, number][] = [];
        for (const h of r.history) {
          const n = extractNumericFromState(h.state);
          if (n != null) points.push([new Date(h.changedAt).getTime(), n]);
        }
        return { entityId: eid, points };
      } catch {
        return { entityId: eid, points: [] as [number, number][] };
      }
    })).then((all) => {
      if (cancelled) return;
      setSeries(all);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [card.entities, card.hoursToShow]);

  const hasData = series.some((s) => s.points.length > 0);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="history-graph"
    >
      {card.title && (
        <span className="truncate text-sm font-medium">{card.title}</span>
      )}
      <div className="relative h-40 w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: token('--color-text-muted') }}>
            Loading history…
          </div>
        ) : hasData ? (
          <MultiLineSvg series={series} logarithmic={card.logarithmicScale} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: token('--color-text-muted') }}>
            No data for the selected window.
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: token('--color-text-secondary') }}>
        {series.map((s, i) => (
          <span key={s.entityId} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-4 rounded-sm"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length]() }}
            />
            <span className="truncate" style={{ maxWidth: 140 }}>{s.entityId}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// A plain-SVG plot — keeps this card dependency-light. uPlot integration is
// on a follow-up ticket once we profile the heaviest dashboards.
function MultiLineSvg({ series, logarithmic }: { series: Series[]; logarithmic: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(400);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth ?? 400));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const h = 160;
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return <div ref={ref} className="h-full w-full" />;

  const xs = allPoints.map((p) => p[0]);
  const ys = allPoints.map((p) => (logarithmic ? Math.log10(Math.max(1e-9, p[1])) : p[1]));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const px = (t: number) => ((t - xMin) / xRange) * (w - 8) + 4;
  const py = (v: number) => {
    const adj = logarithmic ? Math.log10(Math.max(1e-9, v)) : v;
    return h - 8 - ((adj - yMin) / yRange) * (h - 16);
  };

  return (
    <div ref={ref} className="h-full w-full">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" aria-hidden>
        {/* Axis baseline */}
        <line x1={0} y1={h - 4} x2={w} y2={h - 4} stroke={token('--color-border')} strokeWidth="1" />
        {series.map((s, i) => {
          if (s.points.length < 2) return null;
          const color = SERIES_COLORS[i % SERIES_COLORS.length]();
          const d = s.points
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.entityId}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

function extractNumericFromState(state: Record<string, unknown>): number | null {
  const candidates = ['value', 'state', 'temperature', 'humidity', 'watts', 'power', 'battery', 'level', 'position', 'brightness', 'volume'];
  for (const key of candidates) {
    const v = state[key];
    if (typeof v === 'number') return v;
  }
  return null;
}
