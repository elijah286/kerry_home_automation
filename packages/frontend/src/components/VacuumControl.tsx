'use client';

import { useEffect, useState } from 'react';
import type { VacuumState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { Battery, Home, Map as MapIcon, Play, Pause, Volume2 } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  cleaning: 'success',
  returning: 'info',
  docked: 'default',
  paused: 'warning',
  error: 'danger',
  idle: 'default',
};

export function VacuumControl({ device }: { device: VacuumState }) {
  const { send, isPending, lastError, clearError } = useCommand(device.id);
  const cmd = (action: string, fanSpeed?: string) => {
    void send(action, { type: 'vacuum', action, fanSpeed });
  };

  const [mapObjectUrl, setMapObjectUrl] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (device.integration !== 'roborock' || device.mapUpdatedAt == null) {
      setMapObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setMapError(false);
      return;
    }

    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/roborock/map?deviceId=${encodeURIComponent(device.id)}&t=${device.mapUpdatedAt}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (!res.ok) {
          setMapError(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setMapObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setMapError(false);
      } catch {
        if (!cancelled) setMapError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [device.id, device.integration, device.mapUpdatedAt]);

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

      {lastError && (
        <p className="text-xs rounded-md border px-2 py-2" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-border)' }}>
          {lastError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => clearError()}
            style={{ color: 'var(--color-text-muted)' }}
          >
            Dismiss
          </button>
        </p>
      )}

      {device.integration === 'roborock' && device.mapUpdatedAt != null && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <MapIcon className="h-3.5 w-3.5" />
            Floor map
          </div>
          {mapObjectUrl ? (
            <img
              src={mapObjectUrl}
              alt={`${device.name} map`}
              className="w-full max-h-64 rounded-md border object-contain"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
            />
          ) : (
            <p className="text-xs" style={{ color: mapError ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
              {mapError ? 'Map not ready yet — refreshes about every 50s when the bridge can reach the vacuum.' : 'Loading map…'}
            </p>
          )}
        </div>
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
          aria-label="Find vacuum"
        >
          {isPending('find') ? <ButtonSpinner /> : <Volume2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
