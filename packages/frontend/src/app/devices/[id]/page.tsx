'use client';

import { use, useState, useMemo, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDeviceMergedState } from '@/hooks/useDeviceMergedState';
import { DeviceCard } from '@/components/DeviceCard';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Settings, Pencil, Check, X, Loader2, Braces } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import Link from 'next/link';
import { CoverControl, WeatherCard } from '@/components/viz';
import { getDeviceVizConfig } from '@/components/viz/device-viz-config';
import { DeviceLiveStateTree } from '@/components/DeviceLiveStateTree';
import { DeviceRawJsonPanelBody } from '@/components/DeviceRawJsonPanel';
import { DeviceFieldHistoryContent } from '@/components/DeviceFieldHistoryContent';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { formatFieldPath } from '@/lib/object-path';
import type { CoverState, DeviceState, GarageDoorState, NetworkDeviceState, WeatherState } from '@ha/shared';
import { getApiBase, apiFetch } from '@/lib/api-base';
import { updateDeviceSettings } from '@/lib/api';
import { setDeviceClass } from '@/lib/api-device-cards';
import { DeviceClassControl } from '@/components/DeviceClassControl';
import { DeviceDefaultCardPanel } from '@/components/DeviceDefaultCardPanel';
import { DeviceHistoryDefault } from '@/components/DeviceHistoryDefault';
import { Collapsible } from '@/components/ui/Collapsible';
import { useAuth } from '@/providers/AuthProvider';

const API_BASE = getApiBase();

interface Area { id: string; name: string; }

function DeviceSettings({ deviceId, device }: { deviceId: string; device: DeviceState }) {
  const { isAdmin } = useAuth();
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
      apiFetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`).then((r) => r.json()),
      apiFetch(`${API_BASE}/api/areas`).then((r) => r.json()),
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
      const res = await apiFetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData?.message || 'Failed to save');
      }
      // Refetch settings to confirm persistence
      const settingsRes = await apiFetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/settings`);
      const settingsData = await settingsRes.json();
      setRetentionDays(settingsData.settings.history_retention_days);
      setDisplayName(settingsData.settings.display_name);
      setAreaId(settingsData.settings.area_id);
      setAliases(settingsData.settings.aliases ?? []);
    } catch (e) {
      console.error('Failed to save device settings:', e);
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

      {/* Device class — admin-only; controls the default card mapping */}
      {isAdmin && <DeviceClassControl device={device} />}

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

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

function getEntityStateValue(d: DeviceState): string | null {
  const s = d as unknown as Record<string, unknown>;
  if (d.type === 'sensor' && 'value' in s) return String(s.value ?? '');
  if ('state' in s && s.state !== null && s.state !== undefined) return String(s.state);
  return null;
}

function isEntityOpen(val: string | null): boolean {
  if (!val) return false;
  const v = val.toLowerCase();
  return v === 'open' || v === 'true' || v === 'on' || v === 'detected' || v === 'motion';
}

const ENTITY_CLASS_OPTIONS = [
  { value: '__none__', label: 'Type…' },
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
  { value: 'garage_door', label: 'Garage door' },
  { value: 'motion', label: 'Motion' },
  { value: 'contact', label: 'Contact' },
  { value: 'glass', label: 'Glass break' },
  { value: 'smoke', label: 'Smoke' },
  { value: 'carbon_monoxide', label: 'CO' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'humidity', label: 'Humidity' },
  { value: 'battery', label: 'Battery' },
];

// ---------------------------------------------------------------------------
// EntityRow — one row in the child-entity list
// ---------------------------------------------------------------------------

function EntityRow({ entity }: { entity: DeviceState }) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [localName, setLocalName] = useState<string | null>(entity.displayName ?? null);
  const [localClass, setLocalClass] = useState<string | null>(entity.device_class ?? null);

  const displayName = localName ?? entity.name;
  const stateVal = getEntityStateValue(entity);
  const open = isEntityOpen(stateVal);

  const saveName = async () => {
    const name = nameInput.trim() || null;
    try {
      await updateDeviceSettings(entity.id, { display_name: name });
      setLocalName(name);
    } catch { /* ignore */ }
    setEditing(false);
  };

  const saveClass = async (cls: string | null) => {
    setLocalClass(cls);
    try { await setDeviceClass(entity.id, cls, 'admin'); } catch { /* ignore */ }
  };

  return (
    <div
      className="group flex items-center gap-2 py-1.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* State */}
      <span
        className="shrink-0 w-14 text-right text-xs font-medium"
        style={{ color: open ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-muted)' }}
      >
        {stateVal ?? '—'}
      </span>

      {/* Editable name */}
      <div className="flex flex-1 items-center gap-1 min-w-0">
        {editing ? (
          <>
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="flex-1 rounded border px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                outline: 'none',
                minWidth: 0,
              }}
            />
            <button onClick={() => void saveName()} className="rounded p-0.5 hover:bg-[var(--color-bg-hover)]">
              <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
            </button>
            <button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-[var(--color-bg-hover)]">
              <X className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </>
        ) : (
          <>
            <span className="truncate text-sm" style={{ color: 'var(--color-text)' }}>{displayName}</span>
            <button
              onClick={() => { setNameInput(displayName); setEditing(true); }}
              className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-bg-hover)]"
            >
              <Pencil className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </>
        )}
      </div>

      {/* Device class */}
      <div className="shrink-0 w-28">
        <Select
          value={localClass ?? '__none__'}
          onValueChange={(v) => void saveClass(v === '__none__' ? null : v)}
          options={ENTITY_CLASS_OPTIONS}
        />
      </div>
    </div>
  );
}

type Inspector =
  | null
  | { kind: 'json' }
  | { kind: 'field'; path: string[]; value: unknown };

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { devices, getDevice } = useWebSocket();
  const device = getDevice(decodeURIComponent(id));

  const merged = useDeviceMergedState(device?.id, device);

  const [inspector, setInspector] = useState<Inspector>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerInput, setHeaderInput] = useState('');

  const saveHeaderName = async () => {
    const name = headerInput.trim() || null;
    try { await updateDeviceSettings(device?.id ?? '', { display_name: name }); } catch { /* ignore */ }
    setEditingHeader(false);
  };

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

  const display = (merged.display ?? device) as DeviceState;
  const networkLinked =
    display.type === 'network_device'
      ? (display as NetworkDeviceState).linkedDeviceIds?.filter(Boolean) ?? []
      : [];
  const panelTitle =
    inspector?.kind === 'json'
      ? 'Raw device JSON'
      : inspector?.kind === 'field'
        ? formatFieldPath(inspector.path)
        : '';
  const panelSize = inspector?.kind === 'json' ? 'xl' : 'lg';

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <Link href="/devices" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--color-accent)' }}>
        <ArrowLeft className="h-4 w-4" /> Back to Devices
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 min-w-0 items-center gap-2">
          {editingHeader ? (
            <>
              <input
                autoFocus
                type="text"
                value={headerInput}
                onChange={(e) => setHeaderInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveHeaderName();
                  if (e.key === 'Escape') setEditingHeader(false);
                }}
                className="flex-1 min-w-0 rounded-md border px-2 py-1 text-lg font-semibold"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
              <button onClick={() => void saveHeaderName()} className="shrink-0 rounded-md p-1 hover:bg-[var(--color-bg-hover)]">
                <Check className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
              </button>
              <button onClick={() => setEditingHeader(false)} className="shrink-0 rounded-md p-1 hover:bg-[var(--color-bg-hover)]">
                <X className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold truncate">{device.displayName ?? device.name}</h1>
              <button
                onClick={() => { setHeaderInput(device.displayName ?? device.name); setEditingHeader(true); }}
                className="shrink-0 rounded-md p-1 hover:bg-[var(--color-bg-hover)]"
                title="Rename device"
              >
                <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </>
          )}
        </div>
        <Badge variant={device.available ? 'success' : 'danger'}>
          {device.available ? 'Online' : 'Offline'}
        </Badge>
      </div>

      {/* Entity summary — shown for hub/parent devices with child entities */}
      {childDevices.length > 0 && (() => {
        const withState = childDevices.filter((d) => getEntityStateValue(d) !== null);
        const openOnes = withState.filter((d) => isEntityOpen(getEntityStateValue(d)));
        const closedCount = withState.length - openOnes.length;
        if (withState.length === 0) return null;
        return (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Entity Status
              </h2>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {openOnes.length > 0 && (
                  <span style={{ color: 'var(--color-warning, #f59e0b)' }}>
                    {openOnes.length} open
                  </span>
                )}
                <span>{closedCount} closed</span>
              </div>
            </div>
            {openOnes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {openOnes.map((d) => (
                  <span
                    key={d.id}
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{
                      borderColor: 'var(--color-warning, #f59e0b)',
                      color: 'var(--color-warning, #f59e0b)',
                      backgroundColor: 'var(--color-bg-secondary)',
                    }}
                  >
                    {d.displayName ?? d.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-success)' }}>All closed</p>
            )}
          </Card>
        );
      })()}

      {/* Default card — resolved from the device-card-map or a per-user override */}
      <DeviceDefaultCardPanel deviceId={device.id} />

      {/* Details — collapsed by default. Lower-level info, endpoints, and
          specialised controls live here. Each field row in the live state
          tree is its own interactive widget and doubles as a history
          drill-in (click → slide panel). */}
      <Collapsible
        title="Details"
        subtitle="Endpoints, live state, and specialised controls."
        action={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setInspector({ kind: 'json' }); }}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Braces className="h-3.5 w-3.5" />
            Raw JSON
          </button>
        }
      >
        <div className="space-y-4">
          {/* Specialized controls — same dispatch as before */}
          <div>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Controls
            </div>
            {vizConfig?.useWeatherCard ? (
              <WeatherCard device={device as WeatherState} />
            ) : vizConfig?.useCoverControl ? (
              <CoverControl device={device as CoverState | GarageDoorState} />
            ) : (
              <DeviceCard device={device} variant="detail" />
            )}
          </div>

          {/* Live state — one row per JSON field, click to open history */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Live state
              </div>
              {merged.loading && !merged.error && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing…
                </div>
              )}
            </div>
            <DeviceLiveStateTree
              data={display as unknown}
              onFieldSelect={(path, value) => setInspector({ kind: 'field', path, value })}
            />
          </div>

          {/* Network-linked mirrors of this device */}
          {networkLinked.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Same device elsewhere in HomeOS
              </div>
              <ul className="space-y-1.5 text-sm">
                {networkLinked.map((lid) => {
                  const linked = getDevice(lid);
                  const lab = linked?.displayName ?? linked?.name ?? lid;
                  return (
                    <li key={lid}>
                      <Link
                        href={`/devices/${encodeURIComponent(lid)}`}
                        className="hover:underline"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {lab}
                      </Link>
                      {linked ? (
                        <span className="text-xs ml-1.5" style={{ color: 'var(--color-text-muted)' }}>
                          ({linked.integration})
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Child devices (for hub/parent devices) */}
          {childDevices.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Entities ({childDevices.length})
              </div>
              <div className="rounded-md border" style={{ borderColor: 'var(--color-border)' }}>
                {childDevices.map((child) => (
                  <EntityRow key={child.id} entity={child} />
                ))}
              </div>
            </div>
          )}
        </div>
      </Collapsible>

      {/* History — collapsed by default. Device-class-aware default view. */}
      <Collapsible
        title="History"
        subtitle="Default history view for this device class."
      >
        <DeviceHistoryDefault device={device} />
      </Collapsible>

      {/* Device settings */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Device Settings</h2>
        </div>
        <DeviceSettings deviceId={device.id} device={device} />
      </Card>

      <SlidePanel
        open={inspector !== null}
        onClose={() => setInspector(null)}
        title={panelTitle}
        size={inspector?.kind === 'field' || inspector?.kind === 'json' ? panelSize : 'md'}
      >
        {inspector?.kind === 'json' && (
          <DeviceRawJsonPanelBody
            display={display}
            loading={merged.loading}
            error={merged.error}
            onReload={merged.reload}
          />
        )}
        {inspector?.kind === 'field' && (
          <DeviceFieldHistoryContent
            deviceId={device.id}
            path={inspector.path}
            liveValue={inspector.value}
          />
        )}
      </SlidePanel>
    </div>
  );
}
