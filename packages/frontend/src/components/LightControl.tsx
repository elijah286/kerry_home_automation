'use client';

import type { LightState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';

export function LightControl({ device }: { device: LightState }) {
  const toggle = () => {
    sendCommand(device.id, { type: 'light', action: device.on ? 'turn_off' : 'turn_on' });
  };

  const setBrightness = (value: number) => {
    sendCommand(device.id, { type: 'light', action: 'set_brightness', brightness: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <button
          onClick={toggle}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: device.on ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {device.on ? 'ON' : 'OFF'}
        </button>
      </div>
      <ThrottledSlider
        value={device.brightness}
        onValueCommit={setBrightness}
        throttleMs={500}
      />
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.brightness}%
      </div>
    </div>
  );
}
