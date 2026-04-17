'use client';

// ---------------------------------------------------------------------------
// StatisticCard — aggregated value over a rolling period.
//
// Fetches history once per mount / period change, computes the aggregate
// client-side, then falls back to the live value for `last`. The backend
// /api/devices/:id/history already clamps at a sensible row cap so
// month-periods won't spike response times on embedded bridges.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import type { StatisticCard as StatisticCardDescriptor, DeviceState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { token } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';
import { fetchDeviceHistoryRange } from '@/lib/api';

const PERIOD_MS: Record<StatisticCardDescriptor['period'], number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export function StatisticCard({ card }: { card: StatisticCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => <StatisticBody card={card} device={d} />, {
    title: card.name,
  });
}

function StatisticBody({ card, device }: { card: StatisticCardDescriptor; device: DeviceState }) {
  const label = card.name ?? device.displayName ?? device.name;
  const [series, setSeries] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - PERIOD_MS[card.period]);
    void fetchDeviceHistoryRange(device.id, from, to)
      .then((r) => {
        if (cancelled) return;
        const nums = r.history
          .map((h) => extractNumeric(h.state))
          .filter((n): n is number => typeof n === 'number');
        setSeries(nums);
      })
      .catch(() => setSeries([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [device.id, card.period]);

  const value = useMemo(() => {
    if (card.stat === 'last') return extractNumeric(device as unknown as Record<string, unknown>);
    if (series.length === 0) return null;
    switch (card.stat) {
      case 'mean':   return series.reduce((a, b) => a + b, 0) / series.length;
      case 'min':    return Math.min(...series);
      case 'max':    return Math.max(...series);
      case 'sum':    return series.reduce((a, b) => a + b, 0);
      case 'change': return series[series.length - 1] - series[0];
      default:       return null;
    }
  }, [card.stat, series, device]);

  const precision = card.precision ?? 1;
  const display = value == null
    ? (loading ? '…' : '—')
    : value.toFixed(precision);

  return (
    <div
      className="flex flex-col rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="statistic"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-xs font-medium uppercase tracking-wide"
          style={{ color: token('--color-text-muted') }}
        >
          {label}
        </span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: token('--color-bg-hover'),
            color: token('--color-text-secondary'),
          }}
        >
          {card.stat} · {card.period}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{display}</span>
        {card.unit && (
          <span className="text-sm" style={{ color: token('--color-text-muted') }}>
            {card.unit}
          </span>
        )}
      </div>
    </div>
  );
}

function extractNumeric(state: Record<string, unknown>): number | null {
  const candidates = ['value', 'state', 'temperature', 'humidity', 'watts', 'power', 'battery', 'level', 'position', 'brightness', 'volume'];
  for (const key of candidates) {
    const v = state[key];
    if (typeof v === 'number') return v;
  }
  return null;
}
