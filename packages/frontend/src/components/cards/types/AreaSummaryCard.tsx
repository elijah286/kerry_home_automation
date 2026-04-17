'use client';

// ---------------------------------------------------------------------------
// AreaSummaryCard — one tile summarizing an area.
//
// Matches HA's area card: a hero region (icon, picture, or live camera),
// alert dots for tripped binary-sensor classes, and small stat pills for
// selected sensor classes. Tapping navigates to the per-area dashboard
// (defaults to /areas/:id — overridable via `navigationPath`).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AreaSummaryCard as AreaSummaryCardDescriptor, DeviceState } from '@ha/shared';
import { Home } from 'lucide-react';
import { useDevices } from '@/hooks/useDevices';
import { token } from '@/lib/tokens';
import { getApiBase, apiFetch } from '@/lib/api-base';

interface Area { id: string; name: string; }

export function AreaSummaryCard({ card }: { card: AreaSummaryCardDescriptor }) {
  const router = useRouter();
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`${getApiBase()}/api/areas`)
      .then((r) => r.json())
      .then((data: { areas: Area[] }) => {
        if (cancelled) return;
        setArea(data.areas.find((a) => a.id === card.areaId) ?? null);
      })
      .catch(() => { /* leave null; boundary below */ });
    return () => { cancelled = true; };
  }, [card.areaId]);

  const selector = useMemo(() => {
    const areaId = card.areaId;
    return (all: DeviceState[]) => all.filter((d) => d.areaId === areaId);
  }, [card.areaId]);
  const devices = useDevices(selector);

  const label = card.name ?? area?.name ?? card.areaId;
  const alertCount = countAlerts(devices, card.alertClasses);
  const sensorPills = collectSensorPills(devices, card.sensorClasses);

  const onTap = () => {
    router.push(card.navigationPath ?? `/areas/${card.areaId}`);
  };

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full flex-col gap-2 rounded-lg p-3 text-left"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="area-summary"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Home
            className="h-4 w-4"
            style={{ color: alertCount > 0 ? token('--color-warning') : token('--color-accent') }}
          />
          <span className="truncate text-sm font-medium">{label}</span>
        </div>
        {alertCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: token('--color-warning'), color: '#fff' }}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#fff' }} />
            {alertCount} alert{alertCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="text-xs" style={{ color: token('--color-text-muted') }}>
        {devices.length} device{devices.length === 1 ? '' : 's'}
      </div>

      {sensorPills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sensorPills.map((p) => (
            <span
              key={p.key}
              className="rounded-md px-1.5 py-0.5 text-[10px]"
              style={{
                background: token('--color-bg-hover'),
                color: token('--color-text-secondary'),
              }}
            >
              {p.label}: <span className="tabular-nums font-medium">{p.value}</span>
            </span>
          ))}
        </div>
      )}

      {card.display !== 'icon' && (
        <div className="text-[10px]" style={{ color: token('--color-text-muted') }}>
          {/* picture / camera heroes are placeholders until area media assets land. */}
          {card.display === 'picture' ? 'Area picture pending' : 'Area camera pending'}
        </div>
      )}
    </button>
  );
}

// Count devices with any alert-class binary-sensor currently tripped. We look
// at the small set of boolean-ish fields an integration might expose without
// requiring a formal device-class registry in shared/.
function countAlerts(devices: DeviceState[], classes: string[] | undefined): number {
  if (!classes || classes.length === 0) return 0;
  let n = 0;
  for (const d of devices) {
    const shape = d as unknown as Record<string, unknown>;
    for (const cls of classes) {
      const v = shape[cls];
      if (typeof v === 'boolean' && v) { n += 1; break; }
      if (typeof v === 'string' && /^(on|open|detected|alert)$/i.test(v)) { n += 1; break; }
    }
  }
  return n;
}

function collectSensorPills(devices: DeviceState[], classes: string[] | undefined):
  { key: string; label: string; value: string }[] {
  if (!classes || classes.length === 0) return [];
  const out: { key: string; label: string; value: string }[] = [];
  for (const cls of classes) {
    // Aggregate numeric values across devices (average — the common case
    // for room temp / humidity spanning multiple sensors).
    const nums: number[] = [];
    for (const d of devices) {
      const v = (d as unknown as Record<string, unknown>)[cls];
      if (typeof v === 'number') nums.push(v);
    }
    if (nums.length > 0) {
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      out.push({ key: cls, label: cls, value: avg.toFixed(1) });
    }
  }
  return out;
}
