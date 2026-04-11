'use client';

import { use, useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { DeviceCard } from '@/components/DeviceCard';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Clock, Loader2, Settings, Pencil, Check, X } from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface HistoryEntry {
  state: Record<string, unknown>;
  changedAt: string;
}

function formatStateChange(state: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('on' in state) parts.push(state.on ? 'Turned on' : 'Turned off');
  if ('brightness' in state) parts.push(`Brightness: ${state.brightness}%`);
  if ('speed' in state) parts.push(`Speed: ${state.speed}`);
  if ('position' in state) parts.push(`Position: ${state.position}%`);
  if ('power' in state) parts.push(`Power: ${state.power}`);
  if ('volume' in state) parts.push(`Volume: ${state.volume}%`);
  if ('source' in state) parts.push(`Source: ${state.source}`);
  if ('online' in state) parts.push(state.online ? 'Came online' : 'Went offline');
  if ('recipeCount' in state) parts.push(`Recipes: ${state.recipeCount}`);
  if ('batteryLevel' in state) parts.push(`Battery: ${state.batteryLevel}%`);
  if ('locked' in state) parts.push(state.locked ? 'Locked' : 'Unlocked');
  if ('currentTemp' in state && state.currentTemp != null) parts.push(`Temp: ${state.currentTemp}°F`);
  if (parts.length === 0) {
    // Fallback: show available + type
    if ('available' in state) parts.push(state.available ? 'Available' : 'Unavailable');
    if ('type' in state) parts.push(`Type: ${state.type}`);
  }
  return parts.join(' · ') || 'State changed';
}

function HistoryTimeline({ deviceId }: { deviceId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/history?limit=50`)
      .then((r) => r.json())
      .then((data: { history: HistoryEntry[] }) => setHistory(data.history))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />;
  }

  if (history.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        No history recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {history.map((entry, i) => (
        <div key={i} className="flex gap-3 py-2" style={{ borderBottom: i < history.length - 1 ? '1px solid var(--color-border)' : undefined }}>
          <div className="flex flex-col items-center">
            <div className="h-2 w-2 rounded-full mt-1.5" style={{ backgroundColor: 'var(--color-accent)' }} />
            {i < history.length - 1 && <div className="flex-1 w-px mt-1" style={{ backgroundColor: 'var(--color-border)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{formatStateChange(entry.state)}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(entry.changedAt).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Area { id: string; name: string; }

function DeviceSettings({ deviceId }: { deviceId: string }) {
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`).then((r) => r.json()),
      fetch(`${API_BASE}/api/areas`).then((r) => r.json()),
    ])
      .then(([settingsData, areasData]: [{ settings: { history_retention_days: number | null; display_name: string | null; area_id: string | null } }, { areas: Area[] }]) => {
        setRetentionDays(settingsData.settings.history_retention_days);
        setDisplayName(settingsData.settings.display_name);
        setAreaId(settingsData.settings.area_id);
        setAreas(areasData.areas);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  const saveSetting = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`, {
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

      {/* Area assignment */}
      <div className="space-y-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Area:</span>
        <select
          value={areaId ?? ''}
          onChange={(e) => saveArea(e.target.value || null)}
          className="rounded-md border px-2 py-1 text-sm w-full"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <option value="">No area</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
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
  const { getDevice } = useWebSocket();
  const device = getDevice(decodeURIComponent(id));

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
          <span>{device.areaId ?? '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Last Changed</span>
          <span>{device.lastChanged ? new Date(device.lastChanged).toLocaleString() : '—'}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Last Updated</span>
          <span>{device.lastUpdated ? new Date(device.lastUpdated).toLocaleString() : '—'}</span>
        </div>
      </Card>

      {/* Controls */}
      <Card>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>Controls</h2>
        <DeviceCard device={device} />
      </Card>

      {/* History */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>History</h2>
        </div>
        <HistoryTimeline deviceId={device.id} />
      </Card>

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
