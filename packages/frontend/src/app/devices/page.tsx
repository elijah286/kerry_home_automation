'use client';

import { useState, useMemo, useCallback, useRef, useEffect, memo, createElement } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Badge } from '@/components/ui/Badge';
import { DeviceCard } from '@/components/DeviceCard';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { updateDeviceSettings } from '@/lib/api';
import { deviceBelongsToEntry } from '@/lib/device-instance';
import {
  Search, Cpu, Lightbulb, ToggleLeft, Fan, Blinds, Speaker, Camera, CookingPot,
  Battery, Car, Waves, CircuitBoard, Beaker, ChevronDown, ChevronRight, X, Zap,
  Pencil, Check, CloudSun, Settings, DoorOpen, Activity, Droplets, Bot, Gauge,
  Braces, Loader2,
} from 'lucide-react';
import type { DeviceState, DeviceType } from '@ha/shared';
import Link from 'next/link';
import { useDeviceMergedState } from '@/hooks/useDeviceMergedState';
import { DeviceLiveStateTree } from '@/components/DeviceLiveStateTree';
import { DeviceRawJsonPanelBody } from '@/components/DeviceRawJsonPanel';
import { DeviceFieldHistoryContent } from '@/components/DeviceFieldHistoryContent';
import { formatFieldPath } from '@/lib/object-path';
import { LCARSSection } from '@/components/lcars/LCARSSection';

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
  garage_door: DoorOpen,
  sensor: Activity,
  sprinkler: Droplets,
  vacuum: Bot,
  water_softener: Droplets,
  energy_monitor: Gauge,
  helper_toggle: ToggleLeft,
  helper_counter: Activity,
  helper_timer: Activity,
  helper_button: Zap,
  helper_number: Gauge,
  helper_text: Activity,
  helper_datetime: Activity,
  helper_sensor: Activity,
  hub: Cpu,
  screensaver: Camera,
};

const INTEGRATION_LABELS: Record<string, string> = {
  lutron: 'Lutron Caseta',
  yamaha: 'Yamaha MusicCast',
  paprika: 'Paprika 3',
  pentair: 'Pentair IntelliCenter',
  tesla: 'Tesla',
  unifi: 'UniFi Protect',
  weather: 'Weather (NWS)',
  xbox: 'Xbox',
  meross: 'Meross',
  roborock: 'Roborock',
  rachio: 'Rachio',
  calendar: 'Calendar',
  esphome: 'ESPHome',
  rainsoft: 'RainSoft Remind',
  sense: 'Sense',
  screensaver: 'Screensaver',
  helpers: 'Helpers',
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
// Device state summary
// ---------------------------------------------------------------------------

function getDeviceStateSummary(device: DeviceState): string {
  switch (device.type) {
    case 'light':
      return device.on ? `On ${device.brightness}%` : 'Off';
    case 'switch':
      return device.on ? 'On' : 'Off';
    case 'fan':
      return device.on ? device.speed.charAt(0).toUpperCase() + device.speed.slice(1) : 'Off';
    case 'cover':
      if (device.moving !== 'stopped') return device.moving === 'opening' ? 'Opening' : 'Closing';
      return device.position === 0 ? 'Closed' : device.position === 100 ? 'Open' : `Open ${device.position}%`;
    case 'media_player':
      if (device.power === 'standby') return 'Standby';
      return `On · Vol ${device.volume}%`;
    case 'vehicle':
      return `${device.locked ? 'Locked' : 'Unlocked'} · ${device.batteryLevel}%`;
    case 'energy_site':
      return `Solar ${Math.round(device.solarPower)}W · Grid ${Math.round(device.gridPower)}W`;
    case 'pool_body':
      if (!device.on) return 'Off';
      return device.currentTemp != null ? `${device.currentTemp}°F` : 'On';
    case 'pool_pump':
      return device.on ? `${device.rpm ?? '?'} RPM` : 'Off';
    case 'pool_circuit':
      return device.on ? 'On' : 'Off';
    case 'pool_chemistry':
      return device.ph != null ? `pH ${device.ph}` : '—';
    case 'camera':
      return device.online ? 'Recording' : 'Offline';
    case 'recipe_library':
      return `${device.recipeCount} recipes`;
    case 'weather':
      return device.temperature != null ? `${device.temperature}°${device.temperatureUnit}` : device.condition;
    case 'garage_door':
      if (device.opening) return 'Opening';
      if (device.closing) return 'Closing';
      return device.open ? 'Open' : 'Closed';
    case 'sensor':
      if (device.value == null) return '—';
      if (typeof device.value === 'boolean') return device.value ? 'Detected' : 'Clear';
      return `${device.value}${device.unit ? ` ${device.unit}` : ''}`;
    case 'sprinkler':
      if (device.running) return `Running · ${device.currentZone ?? 'Zone'}`;
      if (device.rainDelay) return 'Rain Delay';
      return device.standby ? 'Standby' : 'Idle';
    case 'vacuum':
      return device.status.charAt(0).toUpperCase() + device.status.slice(1) + ` · ${device.battery}%`;
    case 'doorbell':
      return device.online ? 'Online' : 'Offline';
    case 'network_device':
      return device.connected ? `Up${device.clients != null ? ` · ${device.clients} clients` : ''}` : 'Down';
    case 'speedtest':
      return device.downloadMbps != null ? `${Math.round(device.downloadMbps)} / ${Math.round(device.uploadMbps ?? 0)} Mbps` : '—';
    case 'thermostat': {
      const temp = device.temperature != null ? `${device.temperature}°` : '';
      const action =
        device.hvacAction ??
        (device.running !== 'idle' ? device.running : 'idle');
      const act = action !== 'idle' ? ` ${action}` : '';
      const pr = device.ecobee?.presetMode ? ` · ${device.ecobee.presetMode}` : '';
      return `${temp}${act}${pr}` || '—';
    }
    case 'music_player':
      if (!device.playing) return 'Paused';
      return device.trackName ? `${device.trackName}` : 'Playing';
    case 'water_softener':
      return `${device.systemStatus} · Salt ${Math.round(device.saltPercent)}%`;
    case 'energy_monitor':
      return `${Math.round(device.powerW)} W`;
    case 'hub':
      return device.available ? 'Online' : 'Offline';
    default:
      return '—';
  }
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  label: string;
  width?: string;
  render: (device: DeviceState) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: 'name',
    label: 'Name',
    render: (d) => <InlineRename deviceId={d.id} currentName={d.displayName ?? d.name} size="sm" />,
  },
  {
    key: 'type',
    label: 'Type',
    width: '130px',
    render: (d) => {
      const Icon = TYPE_ICONS[d.type];
      return (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {Icon
            ? createElement(Icon, {
                className: 'h-3.5 w-3.5',
                style: { color: 'var(--color-text-muted)' },
              })
            : null}
          {d.type.replace(/_/g, ' ')}
        </span>
      );
    },
  },
  {
    key: 'state',
    label: 'State',
    width: '160px',
    render: (d) => (
      <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {getDeviceStateSummary(d)}
      </span>
    ),
  },
  {
    key: 'connected',
    label: 'Connected',
    width: '90px',
    render: (d) => (
      <Badge variant={d.available ? 'success' : 'danger'}>
        {d.available ? 'Online' : 'Offline'}
      </Badge>
    ),
  },
  {
    key: 'integration',
    label: 'Integration',
    width: '140px',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {INTEGRATION_LABELS[d.integration] ?? d.integration}
      </span>
    ),
  },
  {
    key: 'area',
    label: 'Area',
    width: '120px',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {d.userAreaId ?? d.areaId ?? '—'}
      </span>
    ),
  },
  {
    key: 'lastChanged',
    label: 'Last Changed',
    width: '110px',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {d.lastChanged ? new Date(d.lastChanged).toLocaleTimeString() : '—'}
      </span>
    ),
  },
  {
    key: 'lastUpdated',
    label: 'Last Updated',
    width: '110px',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {d.lastUpdated ? new Date(d.lastUpdated).toLocaleTimeString() : '—'}
      </span>
    ),
  },
  {
    key: 'id',
    label: 'ID',
    width: '200px',
    render: (d) => (
      <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
        {d.id}
      </span>
    ),
  },
];

const DEFAULT_VISIBLE = ['name', 'type', 'state', 'connected', 'area', 'lastChanged'];
const LS_KEY = 'devices-visible-columns';

function loadVisibleColumns(): string[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_VISIBLE;
}

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
// ColumnContextMenu
// ---------------------------------------------------------------------------

function ColumnContextMenu({
  x,
  y,
  visibleColumns,
  onToggle,
  onClose,
}: {
  x: number;
  y: number;
  visibleColumns: string[];
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg border py-1 shadow-lg"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--color-bg-card)',
        borderColor: 'var(--color-border)',
        minWidth: '180px',
      }}
    >
      <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
        Show Columns
      </div>
      {ALL_COLUMNS.map((col) => {
        const checked = visibleColumns.includes(col.key);
        const isName = col.key === 'name';
        return (
          <button
            key={col.key}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--color-table-row-hover)] transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onClick={() => { if (!isName) onToggle(col.key); }}
            disabled={isName}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded border"
              style={{
                borderColor: checked ? 'var(--color-accent)' : 'var(--color-border)',
                backgroundColor: checked ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {checked && <Check className="h-2.5 w-2.5 text-white" />}
            </span>
            <span>{col.label}</span>
            {isName && <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Required</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DevicesPage() {
  const { devices } = useWebSocket();
  const searchParams = useSearchParams();
  const router = useRouter();

  const integrationFilter = searchParams.get('integration') ?? '';
  const entryFilter = searchParams.get('entry') ?? '';
  const entryLabelParam = searchParams.get('entryLabel') ?? '';
  const areaFilter = searchParams.get('area') ?? '';
  const entryLabelDecoded = useMemo(() => {
    if (!entryLabelParam) return '';
    try {
      return decodeURIComponent(entryLabelParam);
    } catch {
      return entryLabelParam;
    }
  }, [entryLabelParam]);
  const [search, setSearch] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('integration');
  const [selectedDevice, setSelectedDevice] = useState<DeviceState | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string> | null>(null);
  const [showChildren, setShowChildren] = useState(false);

  type ListInspector = null | { kind: 'json' } | { kind: 'field'; path: string[]; value: unknown };
  const [listInspector, setListInspector] = useState<ListInspector>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setVisibleColumns(loadVisibleColumns());
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const columns = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns],
  );

  const clearFilter = useCallback(() => {
    router.replace('/devices');
  }, [router]);

  const activeFilter = integrationFilter || entryFilter || areaFilter;

  const HIDDEN_POOL_TYPES = new Set(['pool_pump', 'pool_circuit', 'pool_chemistry']);

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (!showChildren && d.parentDeviceId) return false;
      if (!showChildren && HIDDEN_POOL_TYPES.has(d.type)) return false;
      if (search) {
        const q = search.toLowerCase();
        const dn = (d.displayName ?? d.name).toLowerCase();
        if (!dn.includes(q) && !d.name.toLowerCase().includes(q) && !d.id.toLowerCase().includes(q)) return false;
      }
      if (integrationFilter && d.integration !== integrationFilter) return false;
      if (entryFilter && integrationFilter && !deviceBelongsToEntry(d, integrationFilter, entryFilter)) {
        return false;
      }
      if (entryFilter && !integrationFilter && !d.id.includes(entryFilter)) return false;
      if (areaFilter) {
        if (d.userAreaId !== areaFilter && d.areaId !== areaFilter) return false;
      }
      return true;
    });
  }, [devices, search, integrationFilter, entryFilter, areaFilter, showChildren]);

  const groups = useMemo(() => groupDevices(filtered, groupMode), [filtered, groupMode]);

  const liveSelected = selectedDevice ? devices.find((d) => d.id === selectedDevice.id) ?? selectedDevice : null;

  const mergedList = useDeviceMergedState(liveSelected?.id, liveSelected ?? undefined);
  const listDisplay = (mergedList.display ?? liveSelected) as DeviceState | undefined;

  useEffect(() => {
    setListInspector(null);
  }, [liveSelected?.id]);

  const sortedGroupKeys = useMemo(() => {
    const keys = [...groups.keys()];
    if (groupMode === 'last_updated') {
      const order = ['Last minute', 'Last hour', 'Last 24 hours', 'Older'];
      return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    return keys.sort();
  }, [groups, groupMode]);

  // Expand all groups by default when group keys change
  useEffect(() => {
    setExpandedGroups(null);
  }, [groupMode]);

  const isGroupExpanded = useCallback((key: string) => {
    if (expandedGroups === null) return true; // all expanded by default
    return expandedGroups.has(key);
  }, [expandedGroups]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      if (prev === null) {
        // First toggle: create set with all expanded except the toggled one
        const allKeys = new Set(sortedGroupKeys);
        allKeys.delete(key);
        return allKeys;
      }
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [sortedGroupKeys]);

  const expandAllGroups = useCallback(() => {
    setExpandedGroups(null);
  }, []);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const colCount = columns.length;

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
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

        <button
          onClick={() => setShowChildren((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: showChildren ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: showChildren ? '#fff' : 'var(--color-text-secondary)',
            border: showChildren ? 'none' : '1px solid var(--color-border)',
          }}
          title={showChildren ? 'Hide child devices' : 'Show child devices'}
        >
          <Battery className="h-3.5 w-3.5" />
          Children
        </button>
      </div>

      {/* Active filter chip */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {integrationFilter
              ? entryFilter && entryLabelDecoded
                ? `${INTEGRATION_LABELS[integrationFilter] ?? integrationFilter} · ${entryLabelDecoded}`
                : (INTEGRATION_LABELS[integrationFilter] ?? integrationFilter)
              : entryFilter
                ? `Instance ${entryFilter.slice(0, 8)}…`
                : `Area filter`}
            <button onClick={clearFilter} className="ml-0.5 hover:opacity-80">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Single unified table */}
      <div
        className="rounded-lg border overflow-auto"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-card)',
          maxHeight: 'calc(100vh - 220px)',
        }}
      >
        <table className="w-full border-collapse">
          <thead
            className="sticky top-0 z-20"
            onContextMenu={handleHeaderContextMenu}
          >
            <tr style={{ backgroundColor: 'var(--color-table-header)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-medium select-none"
                  style={{
                    color: 'var(--color-text-secondary)',
                    width: col.width,
                    ...(col.key === 'name' ? { paddingLeft: '2rem' } : {}),
                  }}
                >
                  {col.key === 'name' ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{col.label}</span>
                      {filtered.length > 0 && sortedGroupKeys.length > 0 && (
                        <span className="inline-flex items-center gap-1 font-normal">
                          <button
                            type="button"
                            className="rounded px-0 py-0 hover:underline"
                            style={{ color: 'var(--color-text-muted)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              expandAllGroups();
                            }}
                          >
                            Expand all
                          </button>
                          <span style={{ color: 'var(--color-text-muted)' }} aria-hidden>
                            /
                          </span>
                          <button
                            type="button"
                            className="rounded px-0 py-0 hover:underline"
                            style={{ color: 'var(--color-text-muted)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              collapseAllGroups();
                            }}
                          >
                            Collapse all
                          </button>
                        </span>
                      )}
                    </div>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No devices match your filters
                </td>
              </tr>
            ) : (
              sortedGroupKeys.map((key) => {
                const groupDeviceList = groups.get(key)!;
                const onlineCount = groupDeviceList.filter((d) => d.available).length;
                const offlineCount = groupDeviceList.length - onlineCount;
                const expanded = isGroupExpanded(key);
                const GIcon = groupIcon(key, groupMode);

                return (
                  <GroupRows
                    key={key}
                    groupKey={key}
                    mode={groupMode}
                    label={groupLabel(key, groupMode)}
                    GIcon={GIcon}
                    deviceCount={groupDeviceList.length}
                    onlineCount={onlineCount}
                    offlineCount={offlineCount}
                    expanded={expanded}
                    onToggle={() => toggleGroup(key)}
                    devices={groupDeviceList}
                    columns={columns}
                    colCount={colCount}
                    onDeviceClick={setSelectedDevice}
                    router={router}
                    showChildren={showChildren}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Column context menu */}
      {contextMenu && (
        <ColumnContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          visibleColumns={visibleColumns}
          onToggle={toggleColumn}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Slide-out detail panel */}
      <SlidePanel
        open={!!liveSelected}
        onClose={() => { setSelectedDevice(null); setListInspector(null); }}
        title={
          listInspector?.kind === 'json'
            ? 'Raw device JSON'
            : listInspector?.kind === 'field'
              ? formatFieldPath(listInspector.path)
              : (liveSelected?.displayName ?? liveSelected?.name ?? 'Device')
        }
        size={
          listInspector?.kind === 'json' ? 'xl' : listInspector?.kind === 'field' ? 'lg' : 'md'
        }
      >
        {liveSelected && listDisplay && (
          <div className="space-y-4">
            {listInspector && (
              <button
                type="button"
                onClick={() => setListInspector(null)}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Back to overview
              </button>
            )}

            {!listInspector && (
              <>
                <LCARSSection title="Device data">
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
                      <span style={{ color: 'var(--color-text-muted)' }}>State</span>
                      <span className="text-sm font-medium">{getDeviceStateSummary(liveSelected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--color-text-muted)' }}>ID</span>
                      <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{liveSelected.id}</span>
                    </div>
                  </div>
                </LCARSSection>

                <LCARSSection title="Live state">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setListInspector({ kind: 'json' })}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        <Braces className="h-3 w-3" />
                        Raw JSON
                      </button>
                    </div>
                    {mergedList.loading && !mergedList.error && (
                      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Syncing…
                      </div>
                    )}
                    <DeviceLiveStateTree
                      data={listDisplay as unknown}
                      onFieldSelect={(path, value) => setListInspector({ kind: 'field', path, value })}
                    />
                  </div>
                </LCARSSection>

                <LCARSSection title="Controls">
                  <DeviceCard device={liveSelected} />
                </LCARSSection>

                {/* Show child entities for hub devices */}
                {liveSelected.type === 'hub' && (() => {
                  const children = devices.filter((d) => d.parentDeviceId === liveSelected.id);
                  if (children.length === 0) return null;
                  return (
                    <LCARSSection title={`Entities (${children.length})`}>
                      <div className="space-y-3">
                        {children.map((child) => (
                          <div key={child.id} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--color-border)' }}>
                            <DeviceCard device={child} />
                          </div>
                        ))}
                      </div>
                    </LCARSSection>
                  );
                })()}

                {/* Show related pool sub-equipment inline */}
                {liveSelected.type === 'pool_body' && (() => {
                  const entryPrefix = liveSelected.id.split('.').slice(0, 2).join('.');
                  const related = devices.filter(
                    (d) => d.id.startsWith(entryPrefix) && HIDDEN_POOL_TYPES.has(d.type),
                  );
                  if (related.length === 0) return null;
                  return (
                    <LCARSSection title="Related equipment">
                      <div className="space-y-3">
                        {related.map((sub) => (
                          <div key={sub.id} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--color-border)' }}>
                            <DeviceCard device={sub} />
                          </div>
                        ))}
                      </div>
                    </LCARSSection>
                  );
                })()}

                <Link
                  href={`/devices/${encodeURIComponent(liveSelected.id)}`}
                  className="block text-center text-sm font-medium py-2 rounded-md transition-colors"
                  style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                >
                  View Full Details
                </Link>
              </>
            )}

            {listInspector?.kind === 'json' && (
              <LCARSSection title="Raw exchange">
                <DeviceRawJsonPanelBody
                  display={listDisplay}
                  loading={mergedList.loading}
                  error={mergedList.error}
                  onReload={mergedList.reload}
                />
              </LCARSSection>
            )}

            {listInspector?.kind === 'field' && (
              <LCARSSection title={formatFieldPath(listInspector.path)}>
                <DeviceFieldHistoryContent
                  deviceId={liveSelected.id}
                  path={listInspector.path}
                  liveValue={listInspector.value}
                />
              </LCARSSection>
            )}
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupRows — renders the group header row + device rows inside <tbody>
// ---------------------------------------------------------------------------

const GroupRows = memo(function GroupRows({
  groupKey,
  mode,
  label,
  GIcon,
  deviceCount,
  onlineCount,
  offlineCount,
  expanded,
  onToggle,
  devices,
  columns,
  colCount,
  onDeviceClick,
  router,
  showChildren,
}: {
  groupKey: string;
  mode: GroupMode;
  label: string;
  GIcon: React.ElementType | null;
  deviceCount: number;
  onlineCount: number;
  offlineCount: number;
  expanded: boolean;
  onToggle: () => void;
  devices: DeviceState[];
  columns: ColumnDef[];
  colCount: number;
  onDeviceClick: (d: DeviceState) => void;
  router: ReturnType<typeof useRouter>;
  showChildren: boolean;
}) {
  // Build parent→children map when showChildren is on
  const orderedDevices = useMemo(() => {
    if (!showChildren) return devices.map((d) => ({ device: d, isChild: false }));

    const childrenOf = new Map<string, DeviceState[]>();
    const parentIds = new Set<string>();
    for (const d of devices) {
      if (d.parentDeviceId) {
        const list = childrenOf.get(d.parentDeviceId) ?? [];
        list.push(d);
        childrenOf.set(d.parentDeviceId, list);
        parentIds.add(d.parentDeviceId);
      }
    }
    // Sort children alphabetically
    for (const list of childrenOf.values()) {
      list.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
    }

    const result: { device: DeviceState; isChild: boolean }[] = [];
    for (const d of devices) {
      if (d.parentDeviceId) continue; // will be placed after parent
      result.push({ device: d, isChild: false });
      const children = childrenOf.get(d.id);
      if (children) {
        for (const child of children) {
          result.push({ device: child, isChild: true });
        }
      }
    }
    // Orphan children whose parent is in a different group
    for (const d of devices) {
      if (d.parentDeviceId && !parentIds.has(d.parentDeviceId)) {
        // parent not in this group — already skipped above, add as child
      }
      if (d.parentDeviceId && !devices.some((p) => p.id === d.parentDeviceId)) {
        result.push({ device: d, isChild: true });
      }
    }
    return result;
  }, [devices, showChildren]);

  return (
    <>
      {/* Group header row */}
      <tr
        className="cursor-pointer select-none sticky z-10"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          top: '33px', // below the thead
        }}
        onClick={onToggle}
      >
        <td
          colSpan={colCount}
          className="px-3 py-2"
          style={{
            borderBottom: '1px solid var(--color-border)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
              : <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />}
            {GIcon
              ? createElement(GIcon, {
                  className: 'h-3.5 w-3.5',
                  style: { color: 'var(--color-accent)' },
                })
              : null}
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {deviceCount} device{deviceCount !== 1 ? 's' : ''}
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
        </td>
      </tr>
      {/* Device rows */}
      {expanded && orderedDevices.map(({ device: d, isChild }) => (
        <tr
          key={d.id}
          className="cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
          style={isChild ? { opacity: 0.75 } : undefined}
          onClick={() => onDeviceClick(d)}
        >
          {columns.map((col) => (
            <td
              key={col.key}
              className="px-3 py-2"
              style={col.key === 'name' ? { paddingLeft: isChild ? '3.5rem' : '2rem' } : undefined}
            >
              {col.key === 'name' && isChild ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>&#x2514;</span>
                  {col.render(d)}
                </span>
              ) : (
                col.render(d)
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
});
