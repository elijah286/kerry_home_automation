'use client';

import type { EntityListCard as EntityListCardDescriptor } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { EntityBoundary } from '../EntityBoundary';
import { useCardHandlers } from '../CardHandlersContext';
import { token } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';

type EntryDescriptor =
  | { entity: string; name?: string; icon?: string; style?: 'default' | 'toggle' | 'value-only' };

function normaliseEntry(e: EntityListCardDescriptor['entities'][number]): EntryDescriptor {
  return typeof e === 'string' ? { entity: e } : e;
}

export function EntityListCard({ card }: { card: EntityListCardDescriptor }) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="entity-list"
    >
      {card.title && (
        <div
          className="border-b px-3 py-2 text-sm font-medium"
          style={{ borderColor: token('--color-border') }}
        >
          {card.title}
        </div>
      )}
      <ul className="divide-y" style={{ borderColor: token('--color-border') }}>
        {card.entities.map((raw, i) => {
          const entry = normaliseEntry(raw);
          return <EntityListRow key={entry.entity + i} entry={entry} />;
        })}
      </ul>
    </div>
  );
}

function EntityListRow({ entry }: { entry: EntryDescriptor }) {
  const device = useDevice(entry.entity);
  const handlers = useCardHandlers();
  const { dispatch, isPending } = useDeviceCommand(entry.entity, handlers);

  if (!device) {
    return (
      <li className="px-3 py-2">
        <EntityBoundary entityId={entry.entity} state="missing" title={entry.name} compact />
      </li>
    );
  }

  const label = entry.name ?? device.displayName ?? device.name;
  const style = entry.style ?? 'default';
  const on = 'on' in device ? Boolean(device.on) : undefined;
  const busy = isPending('tap');

  return (
    <li
      className="flex items-center justify-between px-3 py-2"
      style={{ opacity: device.available ? 1 : 0.6 }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {entry.icon && <IconGlyph name={entry.icon} size={16} style={{ color: token('--color-text-secondary') }} />}
        <span className="truncate text-sm">{label}</span>
      </div>

      {style === 'value-only' ? (
        <span className="text-xs tabular-nums" style={{ color: token('--color-text-muted') }}>
          {formatStateSummary(device)}
        </span>
      ) : style === 'toggle' && typeof on === 'boolean' ? (
        <button
          type="button"
          onClick={() => void dispatch({ type: 'toggle' }, 'tap')}
          disabled={busy}
          className="rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            background: on ? token('--color-success') : token('--color-bg-hover'),
            color: on ? '#fff' : token('--color-text-muted'),
            opacity: busy ? 0.6 : 1,
          }}
        >
          {on ? 'ON' : 'OFF'}
        </button>
      ) : (
        <span className="text-xs" style={{ color: token('--color-text-muted') }}>
          {formatStateSummary(device)}
        </span>
      )}
    </li>
  );
}

function formatStateSummary(device: import('@ha/shared').DeviceState): string {
  const d = device as unknown as Record<string, unknown>;
  if (typeof d.on === 'boolean') return d.on ? 'on' : 'off';
  if (typeof d.state === 'string' || typeof d.state === 'number') return String(d.state);
  if (typeof d.position === 'number') return `${d.position}%`;
  if (typeof d.temperature === 'number') return `${(d.temperature as number).toFixed(1)}°`;
  return '—';
}
