'use client';

import type { GarageDoorState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';

export function GarageDoorControl({ device }: { device: GarageDoorState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'garage_door', action: device.open ? 'close' : 'open' });
  const busy = isPending('toggle');

  const statusText = device.opening ? 'Opening...' : device.closing ? 'Closing...' : device.open ? 'Open' : 'Closed';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <Badge variant={device.open ? 'warning' : 'success'}>{statusText}</Badge>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className="w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: device.open ? 'var(--color-danger)' : 'var(--color-accent)',
          color: '#fff',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? <ButtonSpinner className="h-4 w-4" /> : device.open ? 'Close' : 'Open'}
      </button>
    </div>
  );
}
