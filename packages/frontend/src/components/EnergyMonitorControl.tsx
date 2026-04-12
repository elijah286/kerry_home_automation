'use client';

import type { EnergyMonitorState } from '@ha/shared';
import { Zap, Sun } from 'lucide-react';

function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
}

export function EnergyMonitorControl({ device }: { device: EnergyMonitorState }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sense</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Zap className="h-3.5 w-3.5" />
            Usage
          </div>
          <div className="text-lg font-semibold mt-1">{formatPower(device.powerW)}</div>
        </div>
        <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Sun className="h-3.5 w-3.5" />
            Solar
          </div>
          <div className="text-lg font-semibold mt-1">{formatPower(device.solarW)}</div>
        </div>
      </div>
      {(device.voltage && device.voltage.length > 0) || device.frequencyHz != null ? (
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.voltage && device.voltage.length > 0 && (
            <span>Voltage {device.voltage.map((v) => `${Math.round(v)} V`).join(' · ')}</span>
          )}
          {device.frequencyHz != null && (
            <span className={device.voltage?.length ? ' ml-2' : ''}>{Math.round(device.frequencyHz)} Hz</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
