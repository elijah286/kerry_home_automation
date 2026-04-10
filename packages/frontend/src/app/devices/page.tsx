'use client';

import { useState, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { Badge } from '@/components/ui/Badge';
import { DeviceCard } from '@/components/DeviceCard';
import { Search, Cpu, Lightbulb, ToggleLeft, Fan, Blinds, Speaker } from 'lucide-react';
import type { DeviceState } from '@ha/shared';
import Link from 'next/link';

const typeIcons: Record<string, React.ElementType> = {
  light: Lightbulb,
  switch: ToggleLeft,
  fan: Fan,
  cover: Blinds,
  media_player: Speaker,
};

const columns: Column<DeviceState>[] = [
  {
    key: 'name',
    label: 'Name',
    render: (d) => <span className="font-medium text-sm">{d.name}</span>,
    sortValue: (d) => d.name.toLowerCase(),
  },
  {
    key: 'type',
    label: 'Type',
    render: (d) => {
      const Icon = typeIcons[d.type];
      return (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {Icon && <Icon className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />}
          {d.type.replace('_', ' ')}
        </span>
      );
    },
    sortValue: (d) => d.type,
    width: '120px',
  },
  {
    key: 'integration',
    label: 'Integration',
    render: (d) => <span className="text-xs capitalize">{d.integration}</span>,
    sortValue: (d) => d.integration,
    width: '100px',
  },
  {
    key: 'status',
    label: 'Status',
    render: (d) => (
      <Badge variant={d.available ? 'success' : 'danger'}>
        {d.available ? 'Online' : 'Offline'}
      </Badge>
    ),
    sortValue: (d) => (d.available ? 0 : 1),
    width: '90px',
  },
  {
    key: 'area',
    label: 'Area',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {d.areaId ?? '—'}
      </span>
    ),
    sortValue: (d) => d.areaId ?? '',
    width: '120px',
  },
  {
    key: 'lastChanged',
    label: 'Last Changed',
    render: (d) => (
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {d.lastChanged ? new Date(d.lastChanged).toLocaleTimeString() : '—'}
      </span>
    ),
    sortValue: (d) => d.lastChanged,
    width: '110px',
  },
];

export default function DevicesPage() {
  const { devices } = useWebSocket();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterIntegration, setFilterIntegration] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<DeviceState | null>(null);

  const types = useMemo(() => [...new Set(devices.map((d) => d.type))].sort(), [devices]);
  const integrations = useMemo(() => [...new Set(devices.map((d) => d.integration))].sort(), [devices]);

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType && d.type !== filterType) return false;
      if (filterIntegration && d.integration !== filterIntegration) return false;
      return true;
    });
  }, [devices, search, filterType, filterIntegration]);

  // Keep selected device in sync with live state
  const liveSelected = selectedDevice ? devices.find((d) => d.id === selectedDevice.id) ?? selectedDevice : null;

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

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
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
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select
          value={filterIntegration}
          onChange={(e) => setFilterIntegration(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value="">All integrations</option>
          {integrations.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(d) => d.id}
        onRowClick={(d) => setSelectedDevice(d)}
        emptyMessage="No devices match your filters"
      />

      {/* Slide-out detail panel */}
      <SlidePanel
        open={!!liveSelected}
        onClose={() => setSelectedDevice(null)}
        title={liveSelected?.name ?? 'Device'}
      >
        {liveSelected && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Type</span>
                <span className="capitalize">{liveSelected.type.replace('_', ' ')}</span>
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
