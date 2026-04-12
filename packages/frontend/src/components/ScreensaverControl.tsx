'use client';

import type { DeviceState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ImageIcon } from 'lucide-react';

type ScreensaverDevice = Extract<DeviceState, { type: 'screensaver' }>;

export function ScreensaverControl({ device }: { device: ScreensaverDevice }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () =>
    send('toggle', { type: 'screensaver', action: device.on ? 'turn_off' : 'turn_on' });
  const busy = isPending('toggle');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <button
          onClick={toggle}
          disabled={busy}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: device.on ? '#fff' : 'var(--color-text-secondary)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <ButtonSpinner /> : device.on ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <ImageIcon className="h-3.5 w-3.5" />
        <span>{device.photoCount} photos</span>
        <span>&middot;</span>
        <span>{device.rotationIntervalSec}s interval</span>
        <span>&middot;</span>
        <span>{device.effect.replace('_', ' ')}</span>
      </div>
    </div>
  );
}
