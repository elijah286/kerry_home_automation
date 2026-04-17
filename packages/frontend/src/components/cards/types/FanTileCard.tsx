'use client';

// ---------------------------------------------------------------------------
// FanTileCard — compact tile for Lutron fans (and any device whose state
// shape is {on, speed}). Matches Lovelace's fan tile: tap body to toggle,
// speed chips along the bottom when `showSpeedControl` is on.
// ---------------------------------------------------------------------------

import type { FanTileCard as FanTileCardDescriptor, FanState, FanSpeed } from '@ha/shared';
import { Fan } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token } from '@/lib/tokens';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { withEntityBoundary } from '../EntityBoundary';

const SPEEDS: { value: FanSpeed; label: string }[] = [
  { value: 'off',         label: 'Off' },
  { value: 'low',         label: 'Low' },
  { value: 'medium',      label: 'Med' },
  { value: 'medium-high', label: 'Med+' },
  { value: 'high',        label: 'High' },
];

export function FanTileCard({ card }: { card: FanTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type !== 'fan') return <div />;
    return <FanTileBody card={card} device={d} />;
  }, { title: card.name });
}

function FanTileBody({ card, device }: { card: FanTileCardDescriptor; device: FanState }) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const busyTap = isPending('tap');

  const onToggle = () => {
    void send('tap', { type: 'fan', action: device.on ? 'turn_off' : 'turn_on' });
  };
  const onSpeed = (speed: FanSpeed) => {
    void send(`speed:${speed}`, { type: 'fan', action: 'set_speed', speed });
  };

  // Spin speed mirrors the fan speed — purely cosmetic, but users instantly
  // grok "off" vs "high" without reading text.
  const spinSeconds =
    !device.on || device.speed === 'off' ? 0
      : device.speed === 'low' ? 4
      : device.speed === 'medium' ? 2.2
      : device.speed === 'medium-high' ? 1.3
      : 0.7;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busyTap ? 0.85 : 1,
      }}
      data-card-type="fan-tile"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busyTap}
        className="flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Fan
            className="h-5 w-5"
            style={{
              color: device.on ? token('--color-accent') : token('--color-text-muted'),
              animation: spinSeconds > 0 ? `spin ${spinSeconds}s linear infinite` : 'none',
            }}
          />
          <span className="truncate text-sm font-medium">{label}</span>
        </div>
        {busyTap ? <ButtonSpinner /> : (
          <span
            className="rounded-md px-2 py-0.5 text-xs font-medium"
            style={{
              background: device.on ? token('--color-success') : token('--color-bg-hover'),
              color: device.on ? '#fff' : token('--color-text-muted'),
            }}
          >
            {device.on ? device.speed : 'off'}
          </span>
        )}
      </button>

      {card.showSpeedControl && (
        <div className="flex gap-1">
          {SPEEDS.map((s) => {
            const active = device.speed === s.value;
            const pending = isPending(`speed:${s.value}`);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onSpeed(s.value)}
                disabled={pending}
                className="flex-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? token('--color-accent') : token('--color-bg-hover'),
                  color: active ? '#fff' : token('--color-text-secondary'),
                  border: `1px solid ${active ? token('--color-accent') : token('--color-border')}`,
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
