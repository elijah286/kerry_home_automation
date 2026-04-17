'use client';

import type { SwitchTileCard as SwitchTileCardDescriptor, SwitchState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { token } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { withEntityBoundary } from '../EntityBoundary';
import { useCardHandlers } from '../CardHandlersContext';

export function SwitchTileCard({ card }: { card: SwitchTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type !== 'switch') return <div />;
    return <SwitchTileBody card={card} device={d} />;
  }, { title: card.name });
}

function SwitchTileBody({ card, device }: { card: SwitchTileCardDescriptor; device: SwitchState }) {
  const handlers = useCardHandlers();
  const { dispatch, isPending } = useDeviceCommand(device.id, handlers);
  const label = card.name ?? device.displayName ?? device.name;
  const busy = isPending('tap');

  return (
    <button
      type="button"
      onClick={() => void dispatch({ type: 'toggle' }, 'tap')}
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2"
      style={{
        background: device.on ? token('--color-accent') : token('--color-bg-card'),
        color: device.on ? '#fff' : token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.7 : 1,
      }}
      data-card-type="switch-tile"
    >
      {card.icon && <IconGlyph name={card.icon} size={18} />}
      <span className="flex-1 truncate text-sm font-medium text-left">{label}</span>
      {busy ? <ButtonSpinner /> : (
        <span className="text-xs font-medium opacity-80">{device.on ? 'ON' : 'OFF'}</span>
      )}
    </button>
  );
}
