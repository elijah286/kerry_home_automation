'use client';

import { useEffect, useState } from 'react';
import type { VacuumCommand, VacuumState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  Battery,
  Home,
  Map as MapIcon,
  Play,
  Pause,
  Volume2,
  Droplets,
  Lock,
  Moon,
  Sparkles,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { getApiBase, apiFetch } from '@/lib/api-base';

const API_BASE = getApiBase();

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  cleaning: 'success',
  returning: 'info',
  docked: 'default',
  paused: 'warning',
  error: 'danger',
  idle: 'default',
};

const FAN_SPEED_OPTIONS = [
  { value: 'quiet', label: 'Quiet' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'max', label: 'Max' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'auto', label: 'Auto' },
];

const MOP_MODE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep' },
  { value: 'deep_plus', label: 'Deep+' },
  { value: 'fast', label: 'Fast' },
];

const MOP_INTENSITY_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function VacuumControl({ device }: { device: VacuumState }) {
  const { send, isPending, lastError, clearError } = useCommand(device.id);
  const sendCmd = (key: string, command: Partial<VacuumCommand>) =>
    void send(key, { type: 'vacuum', action: key, ...command } as Record<string, unknown>);

  const [mapObjectUrl, setMapObjectUrl] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState<number>(device.volume ?? 50);

  useEffect(() => {
    if (typeof device.volume === 'number') setVolume(device.volume);
  }, [device.volume]);

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
        const res = await apiFetch(
          `${API_BASE}/api/roborock/map?deviceId=${encodeURIComponent(device.id)}&t=${device.mapUpdatedAt}`,
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

  const rooms = device.rooms ?? [];
  const isDocked = device.status === 'docked';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <div className="flex items-center gap-1.5">
          {device.mopAttached && (
            <Badge variant="info">
              <Droplets className="h-3 w-3" /> mop
            </Badge>
          )}
          {device.waterShortage && <Badge variant="warning">low water</Badge>}
          <Badge variant={STATUS_VARIANT[device.status] ?? 'default'}>
            {device.status}
          </Badge>
        </div>
      </div>

      {/* Battery + stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <Battery className="h-3 w-3" /> {device.battery}%
        </span>
        <span>Fan: {device.fanSpeed}</span>
        {device.areaCleaned != null && <span>{device.areaCleaned} m²</span>}
        {device.cleaningTime != null && <span>{device.cleaningTime} min</span>}
      </div>

      {(device.totalCleaningArea != null || device.totalCleaningCount != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.totalCleaningArea != null && <span>Total: {device.totalCleaningArea} m²</span>}
          {device.totalCleaningTime != null && <span>{device.totalCleaningTime} min lifetime</span>}
          {device.totalCleaningCount != null && <span>{device.totalCleaningCount} cleans</span>}
        </div>
      )}

      {device.errorMessage && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{device.errorMessage}</p>
      )}

      {device.dockErrorCode != null && device.dockErrorCode !== 0 && (
        <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
          Dock error: {device.dockErrorCode}
        </p>
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

      {/* Map */}
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

      {/* Primary controls */}
      <div className="flex gap-2">
        <button
          onClick={() => sendCmd('start', {})}
          disabled={isPending('start')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-success)', color: '#fff', opacity: isPending('start') ? 0.7 : 1 }}
        >
          {isPending('start') ? <ButtonSpinner /> : <><Play className="h-3 w-3" /> Clean</>}
        </button>
        <button
          onClick={() => sendCmd('pause', {})}
          disabled={isPending('pause')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('pause') ? 0.7 : 1 }}
        >
          {isPending('pause') ? <ButtonSpinner /> : <><Pause className="h-3 w-3" /> Pause</>}
        </button>
        <button
          onClick={() => sendCmd('return_dock', {})}
          disabled={isPending('return_dock')}
          className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('return_dock') ? 0.7 : 1 }}
        >
          {isPending('return_dock') ? <ButtonSpinner /> : <><Home className="h-3 w-3" /> Dock</>}
        </button>
        <button
          onClick={() => sendCmd('find', {})}
          disabled={isPending('find')}
          className="rounded-md px-2 py-1.5 text-xs transition-colors"
          style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('find') ? 0.7 : 1 }}
          aria-label="Find vacuum"
        >
          {isPending('find') ? <ButtonSpinner /> : <Volume2 className="h-3 w-3" />}
        </button>
      </div>

      {/* Mode selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fan speed</label>
          <Select
            size="xs"
            value={device.fanSpeed in { quiet: 1, balanced: 1, turbo: 1, max: 1, gentle: 1, auto: 1 } ? device.fanSpeed : 'balanced'}
            onValueChange={(v) => sendCmd('set_fan_speed', { fanSpeed: v })}
            options={FAN_SPEED_OPTIONS}
            className="w-full"
          />
        </div>
        {device.mopMode !== undefined && (
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Mop mode</label>
            <Select
              size="xs"
              value={device.mopMode && MOP_MODE_OPTIONS.some((o) => o.value === device.mopMode) ? device.mopMode : 'standard'}
              onValueChange={(v) => sendCmd('set_mop_mode', { mopMode: v })}
              options={MOP_MODE_OPTIONS}
              className="w-full"
            />
          </div>
        )}
        {device.mopIntensity !== undefined && (
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Water flow</label>
            <Select
              size="xs"
              value={device.mopIntensity && MOP_INTENSITY_OPTIONS.some((o) => o.value === device.mopIntensity) ? device.mopIntensity : 'medium'}
              onValueChange={(v) => sendCmd('set_mop_intensity', { mopIntensity: v })}
              options={MOP_INTENSITY_OPTIONS}
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-2">
        {device.dndEnabled !== undefined && (
          <button
            type="button"
            onClick={() => sendCmd('set_dnd', { dndEnabled: !device.dndEnabled })}
            disabled={isPending('set_dnd')}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: device.dndEnabled ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: device.dndEnabled ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            <Moon className="h-3 w-3" />
            DND
          </button>
        )}
        {device.childLock !== undefined && (
          <button
            type="button"
            onClick={() => sendCmd('set_child_lock', { childLock: !device.childLock })}
            disabled={isPending('set_child_lock')}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: device.childLock ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: device.childLock ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            <Lock className="h-3 w-3" />
            Child lock
          </button>
        )}
      </div>

      {/* Volume slider */}
      {device.volume !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>Voice volume</span>
            <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{volume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            onMouseUp={() => sendCmd('set_volume', { volume })}
            onTouchEnd={() => sendCmd('set_volume', { volume })}
            className="w-full"
          />
        </div>
      )}

      {/* Rooms */}
      {rooms.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowRoomPicker((v) => !v)}
            className="text-xs font-medium underline"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {showRoomPicker ? 'Hide rooms' : `Clean rooms (${rooms.length})`}
          </button>
          {showRoomPicker && (
            <div className="space-y-1.5 rounded-md border p-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex flex-wrap gap-1.5">
                {rooms.map((r) => {
                  const selected = selectedRooms.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setSelectedRooms((prev) => {
                          const next = new Set(prev);
                          if (selected) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                      className="rounded-full border px-2 py-0.5 text-xs transition-colors"
                      style={{
                        borderColor: 'var(--color-border)',
                        backgroundColor: selected ? 'var(--color-accent)' : 'transparent',
                        color: selected ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRooms.size === 0) return;
                    sendCmd('segment_clean', { roomIds: Array.from(selectedRooms) });
                  }}
                  disabled={isPending('segment_clean') || selectedRooms.size === 0}
                  className="flex-1 rounded-md py-1 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--color-success)',
                    color: '#fff',
                    opacity: selectedRooms.size === 0 || isPending('segment_clean') ? 0.5 : 1,
                  }}
                >
                  {isPending('segment_clean') ? <ButtonSpinner /> : `Clean ${selectedRooms.size || ''} selected`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRooms(new Set())}
                  className="rounded-md border px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dock actions */}
      {isDocked && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => sendCmd('start_dust_collection', {})}
            disabled={isPending('start_dust_collection')}
            className="flex-1 flex items-center justify-center gap-1 rounded-md border py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {isPending('start_dust_collection') ? <ButtonSpinner /> : <><Trash2 className="h-3 w-3" /> Empty dust</>}
          </button>
          <button
            type="button"
            onClick={() => sendCmd('start_mop_wash', {})}
            disabled={isPending('start_mop_wash')}
            className="flex-1 flex items-center justify-center gap-1 rounded-md border py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {isPending('start_mop_wash') ? <ButtonSpinner /> : <><Sparkles className="h-3 w-3" /> Wash mop</>}
          </button>
        </div>
      )}

      {/* Consumable reset quick actions */}
      <div className="space-y-1">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Reset consumables
        </div>
        <div className="flex flex-wrap gap-1">
          {(['main_brush', 'side_brush', 'filter', 'sensor'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => sendCmd('reset_consumable', { consumable: c })}
              disabled={isPending('reset_consumable')}
              className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
                opacity: isPending('reset_consumable') ? 0.5 : 1,
              }}
            >
              <RotateCcw className="h-3 w-3" />
              {c.replace('_', ' ')}
            </button>
          ))}
        </div>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          Life percentages are visible on the device detail page as child sensors.
        </p>
      </div>
    </div>
  );
}
