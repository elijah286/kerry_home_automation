'use client';

// ---------------------------------------------------------------------------
// GaugeCard — radial gauge for a numeric entity with optional severity bands.
//
// Matches Lovelace's gauge: a 270° arc from `min` → `max`, a needle/fill at
// the current value, and optional severity-colored bands. An optional
// sparkline below the gauge shows the trailing 1-hour trend; the data comes
// from the same history endpoint the statistic card uses.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type { GaugeCard as GaugeCardDescriptor, DeviceState, SeverityLevel } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';
import { fetchDeviceHistory } from '@/lib/api';

const ARC_START = 135; // degrees; a 270° sweep centred at 270 (straight up)
const ARC_SWEEP = 270;
const RADIUS = 46;

export function GaugeCard({ card }: { card: GaugeCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => <GaugeBody card={card} device={d} />, {
    title: card.name,
  });
}

function GaugeBody({ card, device }: { card: GaugeCardDescriptor; device: DeviceState }) {
  const value = extractNumeric(device);
  const label = card.name ?? device.displayName ?? device.name;
  const level = pickSeverity(value, card.severity);
  const color = level ? severityVar(level) : token('--color-accent');

  const clamped = value == null ? null : Math.max(card.min, Math.min(card.max, value));
  const frac = clamped == null ? 0 : (clamped - card.min) / (card.max - card.min);

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="gauge"
    >
      <span
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: token('--color-text-muted') }}
      >
        {label}
      </span>
      <svg viewBox="0 0 120 80" className="w-full max-w-[200px]" role="img" aria-label={`${label} gauge`}>
        {/* Track */}
        <path
          d={arcPath(60, 60, RADIUS, ARC_START, ARC_START + ARC_SWEEP)}
          fill="none"
          stroke={token('--color-bg-hover')}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value fill */}
        {clamped != null && (
          <path
            d={arcPath(60, 60, RADIUS, ARC_START, ARC_START + ARC_SWEEP * frac)}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          className="fill-current text-lg font-semibold tabular-nums"
          style={{ fontSize: 16 }}
        >
          {value == null ? '—' : Math.round(value)}
        </text>
        {card.unit && (
          <text
            x="60"
            y="72"
            textAnchor="middle"
            className="fill-current"
            style={{ fontSize: 8, fill: token('--color-text-muted') }}
          >
            {card.unit}
          </text>
        )}
      </svg>
      {card.showSparkline && <Sparkline deviceId={device.id} color={color} />}
    </div>
  );
}

// Tiny 1-hour sparkline. Uses the same history endpoint as StatisticCard —
// both cards polling the same entity within a dashboard dedupe at the network
// layer (HTTP cache) but a proper per-entity memo is on a follow-up ticket.
function Sparkline({ deviceId, color }: { deviceId: string; color: string }) {
  const [points, setPoints] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchDeviceHistory(deviceId, 60)
      .then((r) => {
        if (cancelled) return;
        const nums = r.history
          .map((h) => extractNumericFromState(h.state))
          .filter((n): n is number => typeof n === 'number');
        setPoints(nums);
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [deviceId]);

  if (points.length < 2) {
    return (
      <div className="h-6 w-full" style={{ color: token('--color-text-muted') }}>
        <span className="text-[10px]">no recent data</span>
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 24;
  const step = w / (points.length - 1);
  const path = points.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractNumeric(device: DeviceState): number | null {
  const d = device as unknown as Record<string, unknown>;
  const candidates = ['value', 'state', 'temperature', 'humidity', 'watts', 'power', 'battery', 'level', 'position', 'brightness', 'volume'];
  for (const key of candidates) {
    const v = d[key];
    if (typeof v === 'number') return v;
  }
  return null;
}

function extractNumericFromState(state: Record<string, unknown>): number | null {
  const candidates = ['value', 'state', 'temperature', 'humidity', 'watts', 'power', 'battery', 'level', 'position', 'brightness', 'volume'];
  for (const key of candidates) {
    const v = state[key];
    if (typeof v === 'number') return v;
  }
  return null;
}

function pickSeverity(
  value: number | null,
  bands: GaugeCardDescriptor['severity'],
): SeverityLevel | null {
  if (value == null || !bands || bands.length === 0) return null;
  // Schema doc says "sorted low→high by `from`"; don't trust the author.
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  let chosen: SeverityLevel | null = null;
  for (const band of sorted) {
    if (value >= band.from) chosen = band.level;
  }
  return chosen;
}

// SVG arc path: cx/cy centre, r radius, start/end in degrees (0° = 3 o'clock,
// CW positive — matches the browser's coordinate system).
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const startRad = (start * Math.PI) / 180;
  const endRad = (end * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
