'use client';

// ---------------------------------------------------------------------------
// BatteryCard — dedicated battery-level display.
//
// Works against any device that exposes a numeric battery reading. We look in
// the obvious places (`batteryLevel` on vehicles, `battery` on vacuums, or
// a sensor with `sensorType === 'battery'` / unit '%'). A future pass could
// add charging state inference — for now we show the level with severity
// colouring and optional remaining-time / range.
// ---------------------------------------------------------------------------

import type { BatteryCard as BatteryCardDescriptor, DeviceState } from '@ha/shared';
import { Battery, BatteryCharging, BatteryLow, BatteryWarning } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

export function BatteryCard({ card }: { card: BatteryCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => <BatteryBody card={card} device={d} />,
    { title: card.name },
  );
}

interface Reading {
  percent: number;
  charging: boolean;
  remainingLabel: string | null;
}

function BatteryBody({ card, device }: { card: BatteryCardDescriptor; device: DeviceState }) {
  const reading = extractBattery(device);
  const label = card.name ?? device.displayName ?? device.name;

  const [warning, critical] = card.thresholds ?? [25, 10];
  const color =
    !reading ? token('--color-text-muted')
      : reading.percent <= critical ? severityVar('critical')
      : reading.percent <= warning ? severityVar('warning')
      : severityVar('success');

  const Icon =
    !reading ? Battery
      : reading.charging ? BatteryCharging
      : reading.percent <= critical ? BatteryWarning
      : reading.percent <= warning ? BatteryLow
      : Battery;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="battery"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>

      {reading ? (
        <>
          {card.style === 'radial' ? (
            <RadialGauge percent={reading.percent} color={color} />
          ) : card.style === 'chip' ? (
            <div
              className="inline-flex items-center gap-1 self-start rounded-md px-2 py-0.5 text-sm font-medium tabular-nums"
              style={{ background: color, color: '#fff' }}
            >
              {reading.percent.toFixed(0)}%
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
                  {reading.percent.toFixed(0)}%
                </span>
                {card.showRemaining && reading.remainingLabel && (
                  <span className="text-xs" style={{ color: token('--color-text-muted') }}>
                    {reading.remainingLabel}
                  </span>
                )}
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full"
                style={{ background: token('--color-bg-hover') }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, reading.percent))}%`,
                    background: color,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-xs" style={{ color: token('--color-text-muted') }}>
          No battery reading available
        </div>
      )}
    </div>
  );
}

function RadialGauge({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="flex items-center justify-center">
      <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`${percent}%`}>
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke={token('--color-bg-hover')}
          strokeWidth="6"
        />
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        <text
          x="36" y="40"
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill={token('--color-text')}
        >
          {clamped.toFixed(0)}%
        </text>
      </svg>
    </div>
  );
}

// Look in the obvious places; return null when nothing sensible is found
// rather than falsifying a zero. Keeps the card honest when the entity
// simply doesn't carry a battery.
function extractBattery(device: DeviceState): Reading | null {
  const d = device as unknown as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const v = d[key];
    return typeof v === 'number' ? v : null;
  };

  const percent = pick('batteryLevel') ?? pick('battery') ?? pick('battery_level');
  if (percent == null) {
    // SensorState edge-case: battery-type sensors carry `value` as the number.
    if (d.type === 'sensor' && d.sensorType === 'battery' && typeof d.value === 'number') {
      return { percent: d.value, charging: false, remainingLabel: null };
    }
    return null;
  }

  const charging = d.chargeState === 'charging' || d.charging === true;
  let remainingLabel: string | null = null;
  if (typeof d.batteryRange === 'number' && d.batteryRange > 0) {
    remainingLabel = `${Math.round(d.batteryRange)} mi range`;
  } else if (typeof d.timeToFullCharge === 'number' && d.timeToFullCharge > 0 && charging) {
    remainingLabel = `${d.timeToFullCharge.toFixed(1)}h to full`;
  }
  return { percent, charging, remainingLabel };
}
