'use client';

import type { MediaPlayerState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';

export function MediaPlayerControl({ device }: { device: MediaPlayerState }) {
  const togglePower = () => {
    sendCommand(device.id, {
      type: 'media_player',
      action: device.power === 'on' ? 'power_off' : 'power_on',
    });
  };

  const setVolume = (value: number) => {
    sendCommand(device.id, { type: 'media_player', action: 'set_volume', volume: value });
  };

  const setSource = (e: React.ChangeEvent<HTMLSelectElement>) => {
    sendCommand(device.id, { type: 'media_player', action: 'set_source', source: e.target.value });
  };

  const isOn = device.power === 'on';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{device.name}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {device.model} &middot; {device.zone}
          </div>
        </div>
        <button
          onClick={togglePower}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: isOn ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: isOn ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {isOn ? 'ON' : 'OFF'}
        </button>
      </div>
      {isOn && (
        <>
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Volume: {device.volume}%
            </label>
            <ThrottledSlider
              value={device.volume}
              onValueCommit={setVolume}
              throttleMs={500}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Source</label>
            <select
              value={device.source}
              onChange={setSource}
              className="w-full rounded-md border px-2 py-1 text-sm"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {device.sourceList.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
