'use client';

// ---------------------------------------------------------------------------
// LockTileCard — door-lock tile.
//
// This codebase doesn't yet have a first-class LockState integration; locks
// currently surface as generic devices with `locked` or `state` fields. Rather
// than omit the card, we render the canonical Lovelace "lock/unlock" UI
// against whatever boolean-ish field we can find, and show a clear "unknown"
// state when we can't. When a real LockState lands, this component's
// `extractLocked()` helper is the only hook that needs updating.
//
// Unlock requires PIN elevation per the schema docstring — but PIN entry is a
// session concern (elevated-session cookie) handled upstream. The card just
// dispatches the toggle; the backend rejects unauthenticated unlocks.
// ---------------------------------------------------------------------------

import type { LockTileCard as LockTileCardDescriptor, DeviceState } from '@ha/shared';
import { Lock, Unlock, HelpCircle } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token } from '@/lib/tokens';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { withEntityBoundary } from '../EntityBoundary';

export function LockTileCard({ card }: { card: LockTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => <LockTileBody card={card} device={d} />, {
    title: card.name,
  });
}

function LockTileBody({ card, device }: { card: LockTileCardDescriptor; device: DeviceState }) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const locked = extractLocked(device);
  const busy = isPending('tap');

  const onTap = () => {
    if (locked === undefined) return;
    // Vehicle locks: the Tesla integration uses `door_lock` / `door_unlock`.
    // This is the only concrete lockable device we ship today; the generic
    // fallback matches HA's service naming so new integrations slot in.
    if (device.type === 'vehicle') {
      void send('tap', { type: 'vehicle', action: locked ? 'door_unlock' : 'door_lock' });
      return;
    }
    void send('tap', { type: 'lock', action: locked ? 'unlock' : 'lock' });
  };

  const Icon = locked === true ? Lock : locked === false ? Unlock : HelpCircle;
  const tone =
    locked === true ? token('--color-success')
      : locked === false ? token('--color-warning')
      : token('--color-text-muted');

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={busy || locked === undefined}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.7 : 1,
      }}
      data-card-type="lock-tile"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: tone }} />
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      {busy ? (
        <ButtonSpinner />
      ) : (
        <span className="text-xs font-medium" style={{ color: tone }}>
          {locked === true ? 'Locked' : locked === false ? 'Unlocked' : 'Unknown'}
        </span>
      )}
    </button>
  );
}

// Heuristic extraction until a dedicated LockState lands. Order matters:
// check the strongest signals first.
function extractLocked(device: DeviceState): boolean | undefined {
  const d = device as unknown as Record<string, unknown>;
  if (typeof d.locked === 'boolean') return d.locked;
  if (typeof d.isLocked === 'boolean') return d.isLocked;
  if (typeof d.state === 'string') {
    const s = d.state.toLowerCase();
    if (s === 'locked') return true;
    if (s === 'unlocked') return false;
  }
  return undefined;
}
