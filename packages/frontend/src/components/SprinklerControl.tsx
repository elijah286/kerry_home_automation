'use client';

import type { SprinklerState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { Droplets } from 'lucide-react';

export function SprinklerControl({ device }: { device: SprinklerState }) {
  const { send, isPending } = useCommand(device.id);
  const stopWatering = () => send('stop', { type: 'sprinkler', action: 'stop' });
  const startZone = (zoneId: string) => {
    send(`zone_${zoneId}`, { type: 'sprinkler', action: 'start_zone', zoneId, duration: 300 });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <div className="flex gap-1.5">
          {device.standby && <Badge variant="warning">Standby</Badge>}
          {device.rainDelay && <Badge variant="info">Rain Delay</Badge>}
          <Badge variant={device.running ? 'success' : 'default'}>
            {device.running ? 'Watering' : 'Idle'}
          </Badge>
        </div>
      </div>

      {device.running && device.currentZone && (
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="flex items-center gap-1">
            <Droplets className="h-3 w-3" style={{ color: 'var(--color-accent)' }} />
            {device.currentZone}
          </span>
          {device.timeRemaining != null && (
            <span>{Math.ceil(device.timeRemaining / 60)} min left</span>
          )}
        </div>
      )}

      {device.running && (
        <button
          onClick={stopWatering}
          disabled={isPending('stop')}
          className="w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-danger)', color: '#fff', opacity: isPending('stop') ? 0.7 : 1 }}
        >
          {isPending('stop') ? <ButtonSpinner /> : 'Stop Watering'}
        </button>
      )}

      <div className="border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Zones</div>
        <div className="space-y-1">
          {device.zones.filter((z) => z.enabled).map((zone) => (
            <div key={zone.id} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: zone.running ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                {zone.name}
              </span>
              {!zone.running && !device.running && (
                <button
                  onClick={() => startZone(zone.id)}
                  disabled={isPending(`zone_${zone.id}`)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending(`zone_${zone.id}`) ? 0.7 : 1 }}
                >
                  {isPending(`zone_${zone.id}`) ? <ButtonSpinner className="h-2.5 w-2.5" /> : '5 min'}
                </button>
              )}
              {zone.running && (
                <Droplets className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
