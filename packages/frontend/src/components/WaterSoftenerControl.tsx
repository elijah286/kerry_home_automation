'use client';

import type { WaterSoftenerState } from '@ha/shared';
import { Badge } from '@/components/ui/Badge';
import { Droplets } from 'lucide-react';

function fmtWhen(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? s : d.toLocaleString();
}

export function WaterSoftenerControl({ device }: { device: WaterSoftenerState }) {
  const normal = device.systemStatus.toLowerCase() === 'normal';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm font-medium">{device.name}</span>
        </div>
        <Badge variant={normal ? 'success' : 'warning'}>{device.systemStatus}</Badge>
      </div>
      {device.model && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{device.model}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Salt</div>
          <div className="text-lg font-semibold mt-1">{Math.round(device.saltPercent)}%</div>
        </div>
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Capacity</div>
          <div className="text-lg font-semibold mt-1">{Math.round(device.capacityPercent)}%</div>
        </div>
      </div>
      {(device.lastRegen || device.nextRegen) && (
        <div className="text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
          {fmtWhen(device.lastRegen) && <div>Last regen: {fmtWhen(device.lastRegen)}</div>}
          {fmtWhen(device.nextRegen) && <div>Next regen: {fmtWhen(device.nextRegen)}</div>}
        </div>
      )}
    </div>
  );
}
