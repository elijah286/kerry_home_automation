'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { DeviceCard } from '@/components/DeviceCard';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Clock, Loader2, Settings, Pencil, Check, X, BarChart3, Activity } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import Link from 'next/link';
import { TimeSeriesGraph, StateTimeline, GaugeDisplay, CoverControl, WeatherCard } from '@/components/viz';
import { getDeviceVizConfig } from '@/components/viz/device-viz-config';
import type { CoverState, GarageDoorState, WeatherState } from '@ha/shared';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface Area { id: string; name: string; }

function DeviceSettings({ deviceId }: { deviceId: string }) {
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API_BASE}/api/areas`, { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([settingsData, areasData]: [{ settings: { history_retention_days: number | null; display_name: string | null; area_id: string | null; aliases: string[] } }, { areas: Area[] }]) => {
        setRetentionDays(settingsData.settings.history_retention_days);
        setDisplayName(settingsData.settings.display_name);
        setAreaId(settingsData.settings.area_id);
        setAliases(settingsData.settings.aliases ?? []);
        setAreas(areasData.areas);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  const saveSetting = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`, {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveRetention = (days: number | null) => {
    setRetentionDays(days);
    saveSetting({ history_retention_days: days });
  };

  const saveDisplayName = () => {
    const name = nameInput.trim() || null;
    setDisplayName(name);
    setEditingName(false);
    saveSetting({ display_name: name });
  };

  const saveArea = (id: string | null) => {
    setAreaId(id);
    saveSetting({ area_id: id });
  };

  const addAlias = () => {
    const alias = aliasInput.trim();
    if (!alias || aliases.includes(alias)) { setAliasInput(''); return; }
    const next = [...aliases, alias];
    setAliases(next);
    setAliasInput('');
    saveSetting({ aliases: next });
  };

  const removeAlias = (alias: string) => {
    const next = aliases.filter((a) => a !== alias);
    setAliases(next);
    saveSetting({ aliases: next });
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {saving && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}

      {/* Display name */}
      <div className="space-y-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Display name:</span>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDisplayName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              placeholder="Custom name..."
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <button onClick={saveDisplayName} className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]">
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
            </button>
            <button onClick={() => setEditingName(false)} className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]">
              <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm">{displayName || '(using default)'}</span>
            <button
              onClick={() => { setNameInput(displayName ?? ''); setEditingName(true); }}
              className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]"
            >
              <Pencil className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        )}
      </div>

      {/* Aliases */}
      <div className="space-y-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Aliases:</span>
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((alias) => (
            <span
              key={alias}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {alias}
              <button
                onClick={() => removeAlias(alias)}
                className="ml-0.5 rounded-full hover:bg-[var(--color-bg-hover)]"
              >
                <X className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addAlias(); }}
            placeholder="Add alias..."
            className="flex-1 rounded-md border px-2 py-1 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <button
            onClick={addAlias}
            className="rounded-md px-2.5 py-1 text-xs font-medium border transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Add
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Alternative names the assistant can use to find this device.
        </p>
      </div>

      {/* Area assignment */}
      <div className="space-y-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Area:</span>
        <Select
          value={areaId ?? '__none__'}
          onValueChange={(v) => saveArea(v === '__none__' ? null : v)}
          options={[
            { value: '__none__', label: 'No area' },
            ...areas.map((a) => ({ value: a.id, label: a.name })),
          ]}
          className="w-full"
        />
      </div>

      {/* History retention */}
      <div className="space-y-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>History retention:</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => saveRetention(null)}
            className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
            style={{
              backgroundColor: retentionDays === null ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: retentionDays === null ? '#fff' : 'var(--color-text-secondary)',
              borderColor: retentionDays === null ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            Default
          </button>
          {[1, 3, 7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => saveRetention(days)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
              style={{
                backgroundColor: retentionDays === days ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: retentionDays === days ? '#fff' : 'var(--color-text-secondary)',
                borderColor: retentionDays === days ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { devices, getDevice } = useWebSocket();
  const device = getDevice(decodeURIComponent(id));

  const childDevices = useMemo(
    () => device ? devices.filter((d) => d.parentDeviceId === device.id) : [],
    [devices, device?.id],
  );

  const vizConfig = useMemo(() => device ? getDeviceVizConfig(device) : null, [device?.type, device?.id]);

  if (!device) {
    return (
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <Link href="/devices" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: 'var(--color-accent)' }}>
          <ArrowLeft className="h-4 w-4" /> Back to Devices
        </Link>
        <p style={{ color: 'var(--color-text-muted)' }}>Device not found. It may not be connected yet.</p>
      </div>
    );
  }

  const showDefaultCard = !vizConfig?.useCoverControl && !vizConfig?.useWeatherCard;

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <Link href="/devices" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-accent)' }}>
        <ArrowLeft className="h-4 w-4" /> Back to Devices
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{device.displayName ?? device.name}</h1>
        <Badge variant={device.available ? 'success' : 'danger'}>
          {device.available ? 'Online' : 'Offline'}
        </Badge>
      </div>

      {/* Device info */}
      <Card>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>Details</h2>
        <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
          <span style={{ color: 'var(--color-text-muted)' }}>ID</span>
          <span className="font-mono text-xs">{device.id}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Type</span>
          <span className="capitalize">{device.type.replace(/_/g, ' ')}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Integration</span>
          <span className="capitalize">{device.integration}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Area</span>
          <span>{device.areaId ?? '\u2014'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Last Changed</span>
          <span>{device.lastChanged ? new Date(device.lastChanged).toLocaleString() : '\u2014'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Last Updated</span>
          <span>{device.lastUpdated ? new Date(device.lastUpdated).toLocaleString() : '\u2014'}</span>
        </div>
      </Card>

      {/* Controls — specialized or default */}
      <Card>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>Controls</h2>
        {vizConfig?.useWeatherCard ? (
          <WeatherCard device={device as WeatherState} />
        ) : vizConfig?.useCoverControl ? (
          <CoverControl device={device as CoverState | GarageDoorState} />
        ) : (
          <DeviceCard device={device} />
        )}
      </Card>

      {/* Gauge (if applicable) */}
      {vizConfig?.gauge && (
        <Card>
          <div className="flex justify-center">
            <GaugeDisplay
              value={((device as unknown as Record<string, unknown>)[vizConfig.gauge.field] as number) ?? 0}
              min={vizConfig.gauge.min}
              max={vizConfig.gauge.max}
              unit={vizConfig.gauge.unit}
              label={vizConfig.gauge.label}
              thresholds={vizConfig.gauge.thresholds}
            />
          </div>
        </Card>
      )}

      {/* History graph */}
      {vizConfig?.graphSignals && vizConfig.graphSignals.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>History</h2>
          </div>
          <TimeSeriesGraph signals={vizConfig.graphSignals} />
        </Card>
      )}

      {/* State timeline */}
      {vizConfig?.timelineItems && vizConfig.timelineItems.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              State History
            </h2>
          </div>
          <StateTimeline items={vizConfig.timelineItems} />
        </Card>
      )}

      {/* Child devices (for hub/parent devices) */}
      {childDevices.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Entities ({childDevices.length})
          </h2>
          <div className="space-y-2">
            {childDevices.map((child) => (
              <DeviceCard key={child.id} device={child} />
            ))}
          </div>
        </Card>
      )}

      {/* Device settings */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Device Settings</h2>
        </div>
        <DeviceSettings deviceId={device.id} />
      </Card>
    </div>
  );
}
