'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { AddEntryDialog } from '@/components/AddEntryDialog';
import {
  Puzzle,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  LutronIcon, YamahaIcon, PaprikaIcon, PentairIcon, TeslaIcon,
  UnifiIcon, SonyIcon, WeatherIcon, XboxIcon, MerossIcon,
  RoborockIcon, RachioIcon, GamechangerIcon, SportsengineIcon, RainsoftIcon, SenseIcon,
} from '@/components/icons/IntegrationIcons';
import type { DeviceState, IntegrationHealth, IntegrationInfo, IntegrationEntry } from '@ha/shared';
import type { EntrySaveDetail } from '@/components/AddEntryDialog';
import { devicesForIntegrationEntry } from '@/lib/device-instance';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  lutron: LutronIcon,
  yamaha: YamahaIcon,
  paprika: PaprikaIcon,
  pentair: PentairIcon,
  tesla: TeslaIcon,
  unifi: UnifiIcon,
  sony: SonyIcon,
  xbox: XboxIcon,
  meross: MerossIcon,
  rachio: RachioIcon,
  roborock: RoborockIcon,
  weather: WeatherIcon,
  gamechanger: GamechangerIcon,
  sportsengine: SportsengineIcon,
  rainsoft: RainsoftIcon,
  sense: SenseIcon,
};

function integrationStatus(
  data: IntegrationData,
  devices: DeviceState[],
): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' } {
  const entries = data.entries ?? [];
  const enabledEntries = entries.filter((e) => e.enabled);

  if (enabledEntries.length === 0) {
    return { label: 'Offline', variant: 'danger' };
  }

  const integrationDevices = devices.filter((d) => d.integration === data.info.id);
  const onlineDevices = integrationDevices.filter((d) => d.available).length;
  const totalDevices = integrationDevices.length;

  // If the integration provides devices, check device availability
  if (data.info.providesDevices && totalDevices > 0) {
    if (onlineDevices === totalDevices) return { label: 'Connected', variant: 'success' };
    if (onlineDevices > 0) return { label: 'Problem', variant: 'warning' };
    return { label: 'Offline', variant: 'danger' };
  }

  // No devices — just check if any entries are enabled
  return { label: 'Connected', variant: 'success' };
}

interface IntegrationData {
  health: IntegrationHealth;
  configured: boolean;
  entries: IntegrationEntry[];
  info: IntegrationInfo;
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortMode = 'name' | 'status' | 'devices' | 'instances';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'devices', label: 'Devices' },
  { value: 'instances', label: 'Instances' },
];

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: value === opt.value ? 'var(--color-accent)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Sidebar — entry management only (no device list)
// ---------------------------------------------------------------------------

const PROVISION_TIMEOUT_MS = 60_000;
const PROVISION_PHASE_MS = 2_800;

function IntegrationSidebar({
  data,
  devices,
  onRefresh,
}: {
  data: IntegrationData;
  devices: DeviceState[];
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IntegrationEntry | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  /** New instance: show connect/discover until devices appear or timeout */
  const [provisioningEntryId, setProvisioningEntryId] = useState<string | null>(null);
  const [provisionPhase, setProvisionPhase] = useState<'connect' | 'discover'>('connect');
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const { info, configured } = data;
  const entries = data.entries ?? [];
  const { label: statusLbl, variant: statusVar } = integrationStatus(data, devices);

  useEffect(() => {
    if (!provisioningEntryId) return;
    setProvisionPhase('connect');
    const t = window.setTimeout(() => setProvisionPhase('discover'), PROVISION_PHASE_MS);
    return () => window.clearTimeout(t);
  }, [provisioningEntryId]);

  useEffect(() => {
    if (!provisioningEntryId || !info.providesDevices) return;
    const entryId = provisioningEntryId;
    const integId = info.id;

    const tryFinish = () => {
      const n = devicesForIntegrationEntry(devicesRef.current, integId, entryId).length;
      if (n > 0) {
        setProvisioningEntryId(null);
        return true;
      }
      return false;
    };

    if (tryFinish()) return;

    onRefresh();
    const poll = window.setInterval(() => {
      onRefresh();
      tryFinish();
    }, 1_400);
    const timeout = window.setTimeout(() => setProvisioningEntryId(null), PROVISION_TIMEOUT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [provisioningEntryId, info.id, info.providesDevices, onRefresh]);

  useEffect(() => {
    if (!provisioningEntryId || !info.providesDevices) return;
    const n = devicesForIntegrationEntry(devices, info.id, provisioningEntryId).length;
    if (n > 0) setProvisioningEntryId(null);
  }, [devices, provisioningEntryId, info.id, info.providesDevices]);

  const handleEntrySaved = useCallback(
    (detail?: EntrySaveDetail) => {
      onRefresh();
      if (detail?.kind === 'created' && info.providesDevices) {
        setProvisioningEntryId(detail.entryId);
      }
    },
    [info.providesDevices, onRefresh],
  );

  const handleDeleteEntry = async (entryId: string) => {
    await fetch(`${API_BASE}/api/integrations/${info.id}/entries/${entryId}`, { method: 'DELETE', credentials: 'include' });
    onRefresh();
  };

  const handleRebuildEntry = async (entryId: string) => {
    setRebuilding(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/entries/${entryId}/rebuild`, { method: 'POST', credentials: 'include' });
      onRefresh();
    } finally {
      setRebuilding(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/restart`, { method: 'POST', credentials: 'include' });
      onRefresh();
    } finally {
      setRestarting(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/rebuild`, { method: 'POST', credentials: 'include' });
      onRefresh();
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Status</span>
          <Badge variant={statusVar as 'success' | 'warning' | 'danger' | 'default'}>{statusLbl}</Badge>
        </div>

        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{info.description}</p>

        {/* Entry list — all integrations are multi-entry */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Instances
            </h4>
            <button
              onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
              className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {provisioningEntryId && !entries.some((e) => e.id === provisioningEntryId) && (
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2.5 mb-2"
              style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-bg-secondary)' }}
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--color-accent)' }} />
              <div className="min-w-0 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {provisionPhase === 'connect'
                  ? 'Connecting to your instance…'
                  : 'Discovering devices…'}
              </div>
            </div>
          )}

          {entries.length === 0 && !provisioningEntryId ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No instances configured.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const instanceDevices = devicesForIntegrationEntry(devices, info.id, entry.id);
                const deviceCount = instanceDevices.length;
                const isProvisioning = provisioningEntryId === entry.id && info.providesDevices;

                const goToDevices = () => {
                  const label = encodeURIComponent(entry.label || entry.config.host || entry.config.email || 'Instance');
                  router.push(`/devices?integration=${info.id}&entry=${entry.id}&entryLabel=${label}`);
                };

                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={goToDevices}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToDevices();
                      }
                    }}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-sm font-medium">
                        {entry.label || entry.config.host || entry.config.email || 'Untitled'}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {entry.config.host ?? entry.config.email ?? ''}
                      </div>
                      {isProvisioning ? (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />
                          {provisionPhase === 'connect'
                            ? 'Connecting…'
                            : 'Finding devices…'}
                        </div>
                      ) : info.providesDevices ? (
                        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {deviceCount === 0
                            ? 'No devices yet'
                            : `${deviceCount} device${deviceCount === 1 ? '' : 's'} found`}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Badge variant={entry.enabled ? 'success' : 'default'} className="text-[10px]">
                        {entry.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      {info.providesDevices && (
                        <button
                          type="button"
                          onClick={() => handleRebuildEntry(entry.id)}
                          disabled={rebuilding}
                          className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                          title="Rebuild devices for this instance"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} style={{ color: 'var(--color-warning)' }} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditingEntry(entry); setDialogOpen(true); }}
                        className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Restart / Rebuild buttons */}
        {configured && (
          <div className="space-y-2">
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
              {restarting ? 'Restarting...' : 'Restart Integration'}
            </button>
            {info.providesDevices && (
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-warning)', border: '1px solid var(--color-border)' }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                {rebuilding ? 'Rebuilding...' : 'Rebuild All Devices'}
              </button>
            )}
          </div>
        )}
      </div>

      <AddEntryDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingEntry(null); }}
        integrationId={info.id}
        integrationName={info.name}
        fields={info.configFields}
        entry={editingEntry}
        onSaved={handleEntrySaved}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Integration Card
// ---------------------------------------------------------------------------

function IntegrationCard({
  data,
  deviceCount,
  devices,
  onClick,
}: {
  data: IntegrationData;
  deviceCount: number;
  devices: DeviceState[];
  onClick: () => void;
}) {
  const { info } = data;
  const entries = data.entries ?? [];
  const Icon = INTEGRATION_ICONS[info.id] ?? Puzzle;
  const { label: statusLbl, variant: statusVar } = integrationStatus(data, devices);

  const enabledCount = entries.filter((e) => e.enabled).length;

  const STATUS_DOT: Record<string, string> = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    default: 'var(--color-text-muted)',
  };

  return (
    <Card className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)] !p-3" onClick={onClick}>
      <div className="flex flex-col items-center text-center gap-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Icon className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium leading-tight block">{info.name}</span>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_DOT[statusVar] }}
            />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {statusLbl}
            </span>
          </div>
          {enabledCount > 0 && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {enabledCount} inst{deviceCount > 0 ? ` · ${deviceCount} dev` : ''}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Integration Groups — section headers like devices page
// ---------------------------------------------------------------------------

function IntegrationGroups({
  integrations,
  devices,
  onSelect,
}: {
  integrations: [string, IntegrationData][];
  devices: DeviceState[];
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const grouped: Record<string, [string, IntegrationData][]> = {};
    for (const entry of integrations) {
      const [id, data] = entry;
      const { variant } = integrationStatus(data, devices);
      const section = variant === 'success' || variant === 'warning' ? 'Connected' : 'Offline';
      (grouped[section] ??= []).push(entry);
    }
    // Connected first, then Offline
    const order = ['Connected', 'Offline'];
    return order
      .filter((s) => grouped[s]?.length)
      .map((s) => ({ section: s, items: grouped[s] }));
  }, [integrations, devices]);

  const toggle = (section: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {groups.map(({ section, items }) => {
        const isCollapsed = collapsed.has(section);
        return (
          <div key={section}>
            <button
              onClick={() => toggle(section)}
              className="flex w-full items-center gap-2 mb-3 select-none"
            >
              {isCollapsed
                ? <ChevronRight className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                : <ChevronDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />}
              <span className="text-sm font-semibold">{section}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {items.length} integration{items.length !== 1 ? 's' : ''}
              </span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.map(([id, data]) => (
                  <IntegrationCard
                    key={id}
                    data={data}
                    deviceCount={devices.filter((d) => d.integration === id).length}
                    devices={devices}
                    onClick={() => onSelect(id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { devices } = useWebSocket();
  const [integrationData, setIntegrationData] = useState<Record<string, IntegrationData>>({});
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-open integration from query param
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId && integrationData[openId]) {
      setSelectedId(openId);
    }
  }, [searchParams, integrationData]);

  const loadIntegrations = useCallback(() => {
    fetch(`${API_BASE}/api/integrations`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: { integrations: Record<string, IntegrationData> }) => {
        setIntegrationData(data.integrations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  const selectedData = selectedId ? integrationData[selectedId] : null;

  const STATUS_ORDER: Record<string, number> = { success: 0, warning: 1, danger: 2, default: 3 };

  const filteredIntegrations = useMemo(() => {
    let entries = Object.entries(integrationData);
    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(([, data]) =>
        data.info.name.toLowerCase().includes(q) ||
        data.info.id.toLowerCase().includes(q) ||
        data.info.description.toLowerCase().includes(q),
      );
    }
    entries.sort((a, b) => {
      const [idA, dataA] = a;
      const [idB, dataB] = b;
      switch (sortMode) {
        case 'name':
          return dataA.info.name.localeCompare(dataB.info.name);
        case 'status': {
          const sA = integrationStatus(dataA, devices);
          const sB = integrationStatus(dataB, devices);
          const diff = (STATUS_ORDER[sA.variant] ?? 9) - (STATUS_ORDER[sB.variant] ?? 9);
          return diff !== 0 ? diff : dataA.info.name.localeCompare(dataB.info.name);
        }
        case 'devices': {
          const dA = devices.filter((d) => d.integration === idA).length;
          const dB = devices.filter((d) => d.integration === idB).length;
          return dB - dA || dataA.info.name.localeCompare(dataB.info.name);
        }
        case 'instances': {
          const eA = (dataA.entries ?? []).filter((e) => e.enabled).length;
          const eB = (dataB.entries ?? []).filter((e) => e.enabled).length;
          return eB - eA || dataA.info.name.localeCompare(dataB.info.name);
        }
        default:
          return 0;
      }
    });
    return entries;
  }, [integrationData, search, sortMode, devices]);

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Puzzle className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Integrations</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {Object.keys(integrationData).length} integration{Object.keys(integrationData).length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-2 h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border pl-8 pr-3 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <SegmentedControl
          options={SORT_OPTIONS}
          value={sortMode}
          onChange={(v) => setSortMode(v as SortMode)}
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading integrations...</span>
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No integrations match your search
        </div>
      ) : (
        <IntegrationGroups
          integrations={filteredIntegrations}
          devices={devices}
          onSelect={setSelectedId}
        />
      )}

      {selectedData && (
        <SlidePanel
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
          title={selectedData.info.name}
        >
          <IntegrationSidebar
            data={selectedData}
            devices={devices}
            onRefresh={loadIntegrations}
          />
        </SlidePanel>
      )}
    </div>
  );
}
