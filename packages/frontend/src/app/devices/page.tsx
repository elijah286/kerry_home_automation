'use client';

import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Badge } from '@/components/ui/Badge';
import { DeviceCard } from '@/components/DeviceCard';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { updateDeviceSettings } from '@/lib/api';
import {
  Search, Cpu, Lightbulb, ToggleLeft, Fan, Blinds, Speaker, Camera, CookingPot,
  Battery, Car, Waves, CircuitBoard, Beaker, ChevronDown, ChevronRight, X, Zap,
  Pencil, Check, CloudSun, Settings,
} from 'lucide-react';
import type { DeviceState, DeviceType } from '@ha/shared';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ElementType> = {
  light: Lightbulb,
  switch: ToggleLeft,
  fan: Fan,
  cover: Blinds,
  media_player: Speaker,
  camera: Camera,
  recipe_library: CookingPot,
  vehicle: Car,
  energy_site: Zap,
  pool_body: Waves,
  pool_pump: Waves,
  pool_circuit: CircuitBoard,
  pool_chemistry: Beaker,
  weather: CloudSun,
};

const INTEGRATION_LABELS: Record<string, string> = {
  lutron: 'Lutron Caseta',
  yamaha: 'Yamaha MusicCast',
  paprika: 'Paprika 3',
  pentair: 'Pentair IntelliCenter',
  tesla: 'Tesla',
  unifi: 'UniFi Protect',
  weather: 'Weather (NWS)',
};

type GroupMode = 'integration' | 'type' | 'status' | 'area' | 'last_updated';

const GROUP_OPTIONS: { value: GroupMode; label: string }[] = [
  { value: 'integration', label: 'Integration' },
  { value: 'type', label: 'Type' },
  { value: 'area', label: 'Area' },
  { value: 'status', label: 'Status' },
  { value: 'last_updated', label: 'Last Updated' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupDevices(devices: DeviceState[], mode: GroupMode): Map<string, DeviceState[]> {
  const groups = new Map<string, DeviceState[]>();

  for (const d of devices) {
    let key: string;
    switch (mode) {
      case 'integration':
        key = d.integration;
        break;
      case 'type':
        key = d.type;
        break;
      case 'area':
        key = d.userAreaId ?? d.areaId ?? 'Unassigned';
        break;
      case 'status':
        key = d.available ? 'Online' : 'Offline';
        break;
      case 'last_updated': {
        const ago = Date.now() - d.lastUpdated;
        if (ago < 60_000) key = 'Last minute';
        else if (ago < 3_600_000) key = 'Last hour';
        else if (ago < 86_400_000) key = 'Last 24 hours';
        else key = 'Older';
        break;
      }
    }
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  // Sort within groups by name
  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups;
}

function groupLabel(key: string, mode: GroupMode): string {
  if (mode === 'integration') return INTEGRATION_LABELS[key] ?? key;
  if (mode === 'type') return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return key;
}

function groupIcon(key: string, mode: GroupMode): React.ElementType | null {
  if (mode === 'type') return TYPE_ICONS[key] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// InlineRename
// ---------------------------------------------------------------------------

function InlineRename({
  deviceId,
  currentName,
  size = 'sm',
}: {
  deviceId: string;
  currentName: string;
  size?: 'sm' | 'base';
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(currentName);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, currentName]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateDeviceSettings(deviceId, { display_name: trimmed });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={save}
          disabled={saving}
          className={`rounded border px-1.5 py-0.5 ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium`}
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-text)',
            outline: 'none',
            minWidth: '200px',
            width: `${Math.max(value.length + 2, 20)}ch`,
          }}
        />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 group">
      <span className={`font-${size === 'sm' ? 'normal' : 'medium'} ${size === 'sm' ? 'text-xs' : 'text-sm'}`} style={{ color: 'var(--color-text-secondary)' }}>
        {currentName}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
        title="Rename"
      >
        <Pencil className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

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
// DeviceRow
// ---------------------------------------------------------------------------

function DeviceRow({ device, onClick }: { device: DeviceState; onClick: () => void }) {
  const Icon = TYPE_ICONS[device.type];
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
      onClick={onClick}
    >
      <td className="pl-8 pr-3 py-2">
        <InlineRename deviceId={device.id} currentName={device.displayName ?? device.name} size="sm" />
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs">
          {Icon && <Icon className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />}
          {device.type.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-3 py-2">
        <Badge variant={device.available ? 'success' : 'danger'}>
          {device.available ? 'Online' : 'Offline'}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.userAreaId ?? device.areaId ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.lastChanged ? new Date(device.lastChanged).toLocaleTimeString() : '—'}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// GroupedSection
// ---------------------------------------------------------------------------

const GroupedSection = memo(function GroupedSection({
  groupKey,
  mode,
  devices,
  onDeviceClick,
  defaultExpanded = true,
}: {
  groupKey: string;
  mode: GroupMode;
  devices: DeviceState[];
  onDeviceClick: (d: DeviceState) => void;
  defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const label = groupLabel(groupKey, mode);
  const GIcon = groupIcon(groupKey, mode);
  const onlineCount = devices.filter((d) => d.available).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <div>
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border)',
          borderTop: '1px solid var(--color-border)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
          : <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />}
        {GIcon && <GIcon className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {devices.length} device{devices.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {onlineCount} online{offlineCount > 0 ? `, ${offlineCount} offline` : ''}
        </span>
        {mode === 'integration' && (
          <button
            className="ml-2 p-0.5 rounded hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/integrations?open=${groupKey}`);
            }}
          >
            <Settings className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        )}
      </div>
      {expanded && (
        <table className="w-full">
          <tbody>
            {devices.map((d) => (
              <DeviceRow key={d.id} device={d} onClick={() => onDeviceClick(d)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DevicesPage() {
  const { devices } = useWebSocket();
  const searchParams = useSearchParams();
  const router = useRouter();

  const integrationFilter = searchParams.get('integration') ?? '';
  const entryFilter = searchParams.get('entry') ?? '';
  const areaFilter = searchParams.get('area') ?? '';
  const [search, setSearch] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('integration');
  const [selectedDevice, setSelectedDevice] = useState<DeviceState | null>(null);

  const clearFilter = useCallback(() => {
    router.replace('/devices');
  }, [router]);

  const activeFilter = integrationFilter || entryFilter || areaFilter;

  // Pool sub-equipment types are hidden from the device list — they're shown
  // inline when you open a pool body device (like how Sony shows one TV, not
  // separate volume/input/power devices).
  const HIDDEN_POOL_TYPES = new Set(['pool_pump', 'pool_circuit', 'pool_chemistry']);

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      // Hide pool sub-equipment from the top-level list
      if (HIDDEN_POOL_TYPES.has(d.type)) return false;
      if (search) {
        const q = search.toLowerCase();
        const dn = (d.displayName ?? d.name).toLowerCase();
        if (!dn.includes(q) && !d.name.toLowerCase().includes(q) && !d.id.toLowerCase().includes(q)) return false;
      }
      if (integrationFilter && d.integration !== integrationFilter) return false;
      if (entryFilter && !d.id.includes(entryFilter)) return false;
      if (areaFilter) {
        if (d.userAreaId !== areaFilter && d.areaId !== areaFilter) return false;
      }
      return true;
    });
  }, [devices, search, integrationFilter, entryFilter, areaFilter]);

  const groups = useMemo(() => groupDevices(filtered, groupMode), [filtered, groupMode]);

  const liveSelected = selectedDevice ? devices.find((d) => d.id === selectedDevice.id) ?? selectedDevice : null;

  // Sort group keys
  const sortedGroupKeys = useMemo(() => {
    const keys = [...groups.keys()];
    if (groupMode === 'last_updated') {
      const order = ['Last minute', 'Last hour', 'Last 24 hours', 'Older'];
      return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    return keys.sort();
  }, [groups, groupMode]);

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Cpu className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Devices</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {filtered.length} of {devices.length} device{devices.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search devices..."
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
          options={GROUP_OPTIONS}
          value={groupMode}
          onChange={(v) => setGroupMode(v as GroupMode)}
        />
      </div>

      {/* Active filter chip */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {integrationFilter ? (INTEGRATION_LABELS[integrationFilter] ?? integrationFilter) : entryFilter ? `Instance ${entryFilter.slice(0, 8)}...` : `Area filter`}
            <button onClick={clearFilter} className="ml-0.5 hover:opacity-80">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Grouped table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        {/* Table header */}
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-table-header)' }}>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)', width: '120px' }}>Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)', width: '90px' }}>Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)', width: '120px' }}>Area</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)', width: '110px' }}>Last Changed</th>
            </tr>
          </thead>
        </table>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No devices match your filters
          </div>
        ) : (
          sortedGroupKeys.map((key) => (
            <GroupedSection
              key={key}
              groupKey={key}
              mode={groupMode}
              devices={groups.get(key)!}
              onDeviceClick={setSelectedDevice}
            />
          ))
        )}
      </div>

      {/* Slide-out detail panel */}
      <SlidePanel
        open={!!liveSelected}
        onClose={() => setSelectedDevice(null)}
        title={liveSelected?.displayName ?? liveSelected?.name ?? 'Device'}
      >
        {liveSelected && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--color-text-muted)' }}>Name</span>
                <InlineRename deviceId={liveSelected.id} currentName={liveSelected.displayName ?? liveSelected.name} size="sm" />
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Type</span>
                <span className="capitalize">{liveSelected.type.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Integration</span>
                <span className="capitalize">{liveSelected.integration}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
                <Badge variant={liveSelected.available ? 'success' : 'danger'}>
                  {liveSelected.available ? 'Online' : 'Offline'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>ID</span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{liveSelected.id}</span>
              </div>
            </div>

            <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
              <DeviceCard device={liveSelected} />
            </div>

            {/* Show related pool sub-equipment inline */}
            {liveSelected.type === 'pool_body' && (() => {
              const entryPrefix = liveSelected.id.split('.').slice(0, 2).join('.');
              const related = devices.filter(
                (d) => d.id.startsWith(entryPrefix) && HIDDEN_POOL_TYPES.has(d.type),
              );
              if (related.length === 0) return null;
              return (
                <div className="space-y-3">
                  {related.map((sub) => (
                    <div key={sub.id} className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                      <DeviceCard device={sub} />
                    </div>
                  ))}
                </div>
              );
            })()}

            <Link
              href={`/devices/${encodeURIComponent(liveSelected.id)}`}
              className="block text-center text-sm font-medium py-2 rounded-md transition-colors"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              View Full Details
            </Link>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
