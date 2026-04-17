'use client';

import type { SensorValueCard as SensorValueCardDescriptor, DeviceState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { token } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';
import { withEntityBoundary } from '../EntityBoundary';

export function SensorValueCard({ card }: { card: SensorValueCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => <SensorValueBody card={card} device={d} />, {
    title: card.name,
  });
}

function SensorValueBody({ card, device }: { card: SensorValueCardDescriptor; device: DeviceState }) {
  const raw = extractValue(device);
  const formatted = formatValue(raw, card.format, card.precision);
  const label = card.name ?? device.displayName ?? device.name;

  return (
    <div
      className="flex flex-col rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="sensor-value"
    >
      <div className="flex items-center gap-2">
        {card.icon && <IconGlyph name={card.icon} size={14} style={{ color: token('--color-text-muted') }} />}
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: token('--color-text-muted') }}>
          {label}
        </span>
      </div>
      <div
        className={card.style === 'big' ? 'mt-2 text-3xl font-semibold tabular-nums' : 'mt-1 text-lg tabular-nums'}
      >
        {formatted}
      </div>
    </div>
  );
}

// The DeviceState union holds type-specific numeric fields (temperature on
// climate, watts on energy, humidity on sensors). Rather than a massive switch,
// look for known numeric fields by name and fall back to "state" if the
// integration has stringly-typed it.
function extractValue(device: DeviceState): string | number | undefined {
  const d = device as unknown as Record<string, unknown>;
  const candidates = ['value', 'state', 'temperature', 'humidity', 'watts', 'power', 'battery', 'level', 'position', 'brightness'];
  for (const key of candidates) {
    const v = d[key];
    if (typeof v === 'number' || typeof v === 'string') return v;
  }
  return undefined;
}

function formatValue(v: string | number | undefined, format: SensorValueCardDescriptor['format'], precision?: number): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v;
  const p = precision ?? 1;
  switch (format) {
    case 'percent':      return `${v.toFixed(p)}%`;
    case 'temperature':  return `${v.toFixed(p)}°`;
    case 'duration':     return formatDuration(v);
    case 'bytes':        return formatBytes(v);
    case 'relative-time': return formatRelative(v);
    case 'number':
    default:
      return v.toFixed(p);
  }
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (Math.abs(diff) < 60_000) return 'just now';
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
