'use client';

import type { LightTileCard as LightTileCardDescriptor, LightState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useCommand } from '@/hooks/useCommand';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { token } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';
import { useCardHandlers } from '../CardHandlersContext';

export function LightTileCard({ card }: { card: LightTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type !== 'light') {
      return <div /* wrong-type fallback intentionally muted */ />;
    }
    return <LightTileBody card={card} device={d} />;
  }, { title: card.name });
}

function LightTileBody({ card, device }: { card: LightTileCardDescriptor; device: LightState }) {
  const handlers = useCardHandlers();
  const { dispatch, isPending } = useDeviceCommand(device.id, handlers);
  const { send: sendBrightness } = useCommand(device.id);

  const label = card.name ?? device.displayName ?? device.name;
  const busy = isPending('tap');

  const onTap = () => {
    // Fall back to toggle if the card has no explicit tapAction.
    void dispatch(card.tapAction ?? { type: 'toggle' }, 'tap');
  };

  const onBrightness = (value: number) => {
    void sendBrightness('brightness', { type: 'light', action: 'set_brightness', brightness: value });
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.85 : 1,
      }}
      data-card-type="light-tile"
    >
      <button
        type="button"
        onClick={onTap}
        className="flex items-center justify-between text-left"
      >
        <span className="truncate text-sm font-medium">{label}</span>
        <span
          className="rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            background: device.on ? token('--color-success') : token('--color-bg-hover'),
            color: device.on ? '#fff' : token('--color-text-muted'),
          }}
        >
          {device.on ? 'on' : 'off'}
        </span>
      </button>
      {card.showBrightness && (
        <div className="space-y-1">
          <ThrottledSlider value={device.brightness} onValueCommit={onBrightness} throttleMs={500} />
          <div className="text-xs" style={{ color: token('--color-text-muted') }}>{device.brightness}%</div>
        </div>
      )}
    </div>
  );
}

