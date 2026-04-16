'use client';

import type { ButtonCard as ButtonCardDescriptor } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { token } from '@/lib/tokens';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { useCardHandlers } from '../CardHandlersContext';

export function ButtonCard({ card }: { card: ButtonCardDescriptor }) {
  const device = useDevice(card.entity);
  const handlers = useCardHandlers();
  const { dispatch, isPending } = useDeviceCommand(card.entity ?? '', handlers);

  const on = device && ('on' in device ? Boolean(device.on) : undefined);
  const label = card.name ?? device?.displayName ?? device?.name ?? card.entity ?? 'Button';
  const busy = isPending('tap');

  const onClick = () => { void dispatch(card.tapAction, 'tap'); };
  const onContextMenu = card.holdAction ? (e: React.MouseEvent) => {
    e.preventDefault();
    void dispatch(card.holdAction, 'hold');
  } : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
      style={{
        background: on ? token('--color-accent') : token('--color-bg-card'),
        color: on ? '#fff' : token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.7 : 1,
      }}
      data-card-id={card.id}
      data-card-type="button"
    >
      {card.icon && <span aria-hidden className="text-lg">{card.icon}</span>}
      <span className="flex-1 truncate text-sm font-medium">{label}</span>
      {busy && <ButtonSpinner />}
      {card.showState && device && (
        <span className="text-xs opacity-70">
          {typeof on === 'boolean' ? (on ? 'on' : 'off') : ''}
        </span>
      )}
    </button>
  );
}
