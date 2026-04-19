'use client';

import type { LockState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';

export function LockControl({ device }: { device: LockState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () =>
    send('toggle', { type: 'lock', action: device.locked ? 'unlock' : 'lock' });
  const busy = isPending('toggle');

  const statusText = device.jammed ? 'Jammed' : device.locked ? 'Locked' : 'Unlocked';
  const statusVariant = device.jammed ? 'danger' : device.locked ? 'success' : 'warning';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <Badge variant={statusVariant}>{statusText}</Badge>
      </div>
      <button
        onClick={toggle}
        disabled={busy || device.jammed}
        className="w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: device.locked ? 'var(--color-warning)' : 'var(--color-accent)',
          color: '#fff',
          opacity: busy || device.jammed ? 0.6 : 1,
        }}
      >
        {busy ? <ButtonSpinner className="h-4 w-4" /> : device.locked ? 'Unlock' : 'Lock'}
      </button>
    </div>
  );
}
