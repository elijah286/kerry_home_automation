'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Clock, Loader2, Search, EyeOff, Eye } from 'lucide-react';
import type { DeviceState } from '@ha/shared';
import { Select } from '@/components/ui/Select';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface DeviceHistorySettings {
  device_id: string;
  history_retention_days: number | null;
  history_enabled: boolean;
}

const RETENTION_OPTIONS = [
  { value: null, label: 'Default' },
  { value: 1, label: '1d' },
  { value: 3, label: '3d' },
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
];

export default function HistorySettingsPage() {
  const router = useRouter();
  const [globalRetention, setGlobalRetention] = useState<number>(3);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [deviceSettings, setDeviceSettings] = useState<Map<string, DeviceHistorySettings>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/settings`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API_BASE}/api/devices`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API_BASE}/api/device-settings/history`, { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([settingsData, devicesData, historyData]) => {
        const days = (settingsData as { settings: Record<string, unknown> }).settings.history_retention_days;
        if (typeof days === 'number') setGlobalRetention(days);

        setDevices((devicesData as { devices: DeviceState[] }).devices);

        const map = new Map<string, DeviceHistorySettings>();
        for (const s of (historyData as { settings: DeviceHistorySettings[] }).settings) {
          map.set(s.device_id, s);
        }
        setDeviceSettings(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveGlobalRetention = async (days: number) => {
    setGlobalRetention(days);
    setSaving('global');
    try {
      await fetch(`${API_BASE}/api/settings/history_retention_days`, {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: days }),
      });
    } finally {
      setSaving(null);
    }
  };

  const updateDeviceSetting = async (
    deviceId: string,
    update: { history_retention_days?: number | null; history_enabled?: boolean },
  ) => {
    setSaving(deviceId);
    try {
      await fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`, {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      setDeviceSettings((prev) => {
        const next = new Map(prev);
        const existing = next.get(deviceId) ?? { device_id: deviceId, history_retention_days: null, history_enabled: true };
        next.set(deviceId, { ...existing, ...update });
        return next;
      });
    } finally {
      setSaving(null);
    }
  };

  const filteredDevices = useMemo(() => {
    if (!search) return devices;
    const q = search.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q),
    );
  }, [devices, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Clock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">History</h1>
      </div>

      {/* Default Retention */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-medium">Default Retention</h2>
          {saving === 'global' && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          How long to keep device state history by default. Individual devices can override this below.
        </p>
        <div className="flex gap-1.5">
          {[1, 3, 7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => saveGlobalRetention(days)}
              className="rounded-md px-3 py-1 text-xs font-medium transition-colors border"
              style={{
                backgroundColor: globalRetention === days ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: globalRetention === days ? '#fff' : 'var(--color-text-secondary)',
                borderColor: globalRetention === days ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </Card>

      {/* Per-Device Settings */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Per-Device Settings</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Override retention duration or disable history recording for individual devices.
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search devices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border py-1.5 pl-8 pr-3 text-xs"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* Device list */}
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {filteredDevices.map((device) => {
            const settings = deviceSettings.get(device.id);
            const enabled = settings?.history_enabled ?? true;
            const retentionDays = settings?.history_retention_days ?? null;
            const isSaving = saving === device.id;

            return (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  backgroundColor: !enabled ? 'var(--color-bg-secondary)' : 'transparent',
                  opacity: !enabled ? 0.6 : 1,
                }}
              >
                {/* Device info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{device.name}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {device.type} &middot; {device.integration}
                  </div>
                </div>

                {/* Retention selector */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {enabled && (
                    <Select
                      value={String(retentionDays ?? '__default__')}
                      onValueChange={(v) => {
                        const val = v === '__default__' ? null : Number(v);
                        void updateDeviceSetting(device.id, { history_retention_days: val });
                      }}
                      options={RETENTION_OPTIONS.map((opt) => ({
                        value: opt.value != null ? String(opt.value) : '__default__',
                        label: opt.label,
                      }))}
                      size="xs"
                    />
                  )}

                  {/* Toggle recording */}
                  <button
                    onClick={() => void updateDeviceSetting(device.id, { history_enabled: !enabled })}
                    className="flex items-center justify-center rounded-md p-1.5 transition-colors border"
                    title={enabled ? 'Disable history recording' : 'Enable history recording'}
                    style={{
                      backgroundColor: enabled ? 'var(--color-bg-secondary)' : 'var(--color-danger-bg, #fef2f2)',
                      borderColor: enabled ? 'var(--color-border)' : 'var(--color-danger, #ef4444)',
                      color: enabled ? 'var(--color-text-muted)' : 'var(--color-danger, #ef4444)',
                    }}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : enabled ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredDevices.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              {search ? 'No devices match your search' : 'No devices found'}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
