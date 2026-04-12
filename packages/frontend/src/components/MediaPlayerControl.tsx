'use client';

import type { MediaPlayerState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { Select } from '@/components/ui/Select';

export function MediaPlayerControl({ device }: { device: MediaPlayerState }) {
  const { send, isPending } = useCommand(device.id);
  const togglePower = () => send('power', {
    type: 'media_player',
    action: device.power === 'on' ? 'power_off' : 'power_on',
  });
  const busy = isPending('power');

  const setVolume = (value: number) => {
    sendCommand(device.id, { type: 'media_player', action: 'set_volume', volume: value });
  };

  const setSource = (value: string) => {
    send('source', { type: 'media_player', action: 'set_source', source: value });
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
          disabled={busy}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: isOn ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: isOn ? '#fff' : 'var(--color-text-secondary)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <ButtonSpinner /> : isOn ? 'ON' : 'OFF'}
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
            <Select
              value={device.source}
              onValueChange={setSource}
              disabled={isPending('source')}
              options={device.sourceList.map((s) => ({ value: s, label: s }))}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}
