'use client';

// ---------------------------------------------------------------------------
// DoorWindowCard — contact-sensor visual (door / window / garage / gate).
//
// We pick a different animated glyph for each shape: a hinged door that swings
// on state change, a window with sliding sash, a garage roll-up, a swing
// gate. `visual: 'auto'` infers from sensor class when available, else door.
// Read-only — tapping navigates to the device detail page via the default
// dashboard nav handler (not triggered here so this component stays a pure
// view).
// ---------------------------------------------------------------------------

import type { DoorWindowCard as DoorWindowCardDescriptor, DeviceState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

export function DoorWindowCard({ card }: { card: DoorWindowCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => <DoorWindowBody card={card} device={d} />,
    { title: card.name },
  );
}

function DoorWindowBody({ card, device }: { card: DoorWindowCardDescriptor; device: DeviceState }) {
  const label = card.name ?? device.displayName ?? device.name;
  const open = isOpen(device);
  const lastChanged = extractLastChanged(device);
  const visual = card.visual === 'auto' ? inferVisual(device) : card.visual;
  const padding = card.size === 'hero' ? 'p-6' : card.size === 'compact' ? 'p-2' : 'p-3';

  const color = open ? severityVar('warning') : severityVar('success');
  const stateLabel = open ? 'Open' : 'Closed';

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg ${padding}`}
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="door-window"
      data-open={open}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
          style={{ background: color, color: '#fff' }}
        >
          {stateLabel}
        </span>
      </div>

      <div className="flex items-center justify-center" style={{ minHeight: card.size === 'hero' ? 140 : 72 }}>
        <VisualSvg visual={visual} open={open} color={color} size={card.size} />
      </div>

      {card.showLastChanged && lastChanged && (
        <div className="text-xs" style={{ color: token('--color-text-muted') }}>
          Last change: {formatRelative(lastChanged)}
        </div>
      )}
    </div>
  );
}

function VisualSvg({
  visual,
  open,
  color,
  size,
}: {
  visual: 'door' | 'window' | 'garage' | 'gate';
  open: boolean;
  color: string;
  size: 'compact' | 'default' | 'hero';
}) {
  const px = size === 'hero' ? 120 : size === 'compact' ? 48 : 72;
  const outline = token('--color-border');
  const fill = token('--color-bg-hover');
  const style: React.CSSProperties = { transition: 'transform 0.35s ease' };

  if (visual === 'window') {
    return (
      <svg width={px} height={px} viewBox="0 0 100 100" aria-label={open ? 'Window open' : 'Window closed'}>
        <rect x="12" y="12" width="76" height="76" rx="3" fill={fill} stroke={outline} strokeWidth="3" />
        <g style={style} transform={open ? 'translate(18 0)' : 'translate(0 0)'}>
          <rect x="12" y="12" width="38" height="76" fill={open ? color : fill} fillOpacity={open ? 0.35 : 1} stroke={outline} strokeWidth="2" />
          <line x1="31" y1="12" x2="31" y2="88" stroke={outline} strokeWidth="1.5" />
          <line x1="12" y1="50" x2="50" y2="50" stroke={outline} strokeWidth="1.5" />
        </g>
        <g>
          <rect x="50" y="12" width="38" height="76" fill={fill} stroke={outline} strokeWidth="2" />
          <line x1="69" y1="12" x2="69" y2="88" stroke={outline} strokeWidth="1.5" />
          <line x1="50" y1="50" x2="88" y2="50" stroke={outline} strokeWidth="1.5" />
        </g>
      </svg>
    );
  }

  if (visual === 'garage') {
    // Roll-up garage: slats slide up when open, revealing a dark interior.
    const slatCount = 6;
    return (
      <svg width={px} height={px} viewBox="0 0 100 100" aria-label={open ? 'Garage open' : 'Garage closed'}>
        <rect x="8" y="14" width="84" height="72" fill={token('--color-bg')} stroke={outline} strokeWidth="2" />
        <g style={style} transform={open ? 'translate(0 -52)' : 'translate(0 0)'}>
          {Array.from({ length: slatCount }).map((_, i) => (
            <rect
              key={i}
              x="10"
              y={16 + i * 11}
              width="80"
              height="10"
              fill={fill}
              stroke={outline}
              strokeWidth="1"
            />
          ))}
        </g>
      </svg>
    );
  }

  if (visual === 'gate') {
    return (
      <svg width={px} height={px} viewBox="0 0 100 100" aria-label={open ? 'Gate open' : 'Gate closed'}>
        <line x1="6" y1="20" x2="6" y2="90" stroke={outline} strokeWidth="3" />
        <line x1="94" y1="20" x2="94" y2="90" stroke={outline} strokeWidth="3" />
        <g style={style} transform={open ? 'rotate(-55 6 90)' : 'rotate(0 6 90)'}>
          <rect x="8" y="30" width="38" height="60" fill={fill} stroke={outline} strokeWidth="2" />
          <line x1="8" y1="45" x2="46" y2="45" stroke={outline} strokeWidth="1.5" />
          <line x1="8" y1="75" x2="46" y2="75" stroke={outline} strokeWidth="1.5" />
        </g>
        <g style={style} transform={open ? 'rotate(55 94 90)' : 'rotate(0 94 90)'}>
          <rect x="54" y="30" width="38" height="60" fill={fill} stroke={outline} strokeWidth="2" />
          <line x1="54" y1="45" x2="92" y2="45" stroke={outline} strokeWidth="1.5" />
          <line x1="54" y1="75" x2="92" y2="75" stroke={outline} strokeWidth="1.5" />
        </g>
      </svg>
    );
  }

  // Door (default). Hinged on the left, swings open 35deg.
  return (
    <svg width={px} height={px} viewBox="0 0 100 100" aria-label={open ? 'Door open' : 'Door closed'}>
      <rect x="12" y="10" width="76" height="82" fill={token('--color-bg')} stroke={outline} strokeWidth="2" />
      <g style={{ ...style, transformOrigin: '12px 50px' }} transform={open ? 'rotate(-35)' : 'rotate(0)'}>
        <rect x="12" y="10" width="76" height="82" fill={fill} stroke={outline} strokeWidth="2" />
        <circle cx="78" cy="52" r="3" fill={color} />
      </g>
    </svg>
  );
}

// --- helpers ---------------------------------------------------------------

function isOpen(device: DeviceState): boolean {
  const d = device as unknown as Record<string, unknown>;
  if (typeof d.open === 'boolean') return d.open;
  if (typeof d.opened === 'boolean') return d.opened;
  if (d.type === 'sensor' && d.sensorType === 'contact' && typeof d.value === 'boolean') return d.value;
  if (typeof d.state === 'string') {
    const s = (d.state as string).toLowerCase();
    return s === 'open' || s === 'on';
  }
  return false;
}

function inferVisual(device: DeviceState): 'door' | 'window' | 'garage' | 'gate' {
  const d = device as unknown as Record<string, unknown>;
  if (d.type === 'garage_door') return 'garage';
  const cls = typeof d.deviceClass === 'string' ? (d.deviceClass as string).toLowerCase() : '';
  if (cls.includes('garage')) return 'garage';
  if (cls.includes('window')) return 'window';
  if (cls.includes('gate')) return 'gate';
  return 'door';
}

function extractLastChanged(device: DeviceState): number | null {
  const d = device as unknown as Record<string, unknown>;
  const v = d.lastChanged ?? d.lastUpdated ?? d.updatedAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const ts = Date.parse(v);
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}
