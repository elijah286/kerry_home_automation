'use client';

import type { VacuumState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { Battery, Home, Play, Pause, Square, Volume2 } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  cleaning: 'success',
  returning: 'info',
  docked: 'default',
  paused: 'warning',
  error: 'danger',
  idle: 'default',
};

export function VacuumControl({ device }: { device: VacuumState }) {
  const { send, isPending } = useCommand(device.id);
  const cmd = (action: string, fanSpeed?: string) => {
    send(action, { type: 'vacuum', action, fanSpeed });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <Badge variant={STATUS_VARIANT[device.status] ?? 'default'}>
          {device.status}
        </Badge>
      </div>

      {/* Battery + stats */}
      <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <Battery className="h-3 w-3" /> {device.battery}%
        </span>
        <span>Fan: {device.fanSpeed}</span>
        {device.areaCleaned != null && <span>{device.areaCleaned} m²</span>}
        {device.cleaningTime != null && <span>{device.cleaningTime} min</span>}
      </div>

      {device.errorMessage && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{device.errorMessage}</p>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={() => cmd('start')}
          disabled={isPending('start')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-success)', color: '#fff', opacity: isPending('start') ? 0.7 : 1 }}
        >
          {isPending('start') ? <ButtonSpinner /> : <><Play className="h-3 w-3" /> Clean</>}
        </button>
        <button
          onClick={() => cmd('pause')}
          disabled={isPending('pause')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('pause') ? 0.7 : 1 }}
        >
          {isPending('pause') ? <ButtonSpinner /> : <><Pause className="h-3 w-3" /> Pause</>}
        </button>
        <button
          onClick={() => cmd('return_dock')}
          disabled={isPending('return_dock')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('return_dock') ? 0.7 : 1 }}
        >
          {isPending('return_dock') ? <ButtonSpinner /> : <><Home className="h-3 w-3" /> Dock</>}
        </button>
        <button
          onClick={() => cmd('find')}
          disabled={isPending('find')}
          className="rounded-md px-2 py-1.5 text-xs transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('find') ? 0.7 : 1 }}
          title="Find vacuum"
        >
          {isPending('find') ? <ButtonSpinner /> : <Volume2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
