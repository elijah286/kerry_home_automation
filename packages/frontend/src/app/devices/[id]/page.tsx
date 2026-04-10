'use client';

import { use } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { DeviceCard } from '@/components/DeviceCard';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

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
        <h1 className="text-lg font-semibold">{device.name}</h1>
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
          <span className="capitalize">{device.type.replace('_', ' ')}</span>
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

      {/* History placeholder */}
      <Card>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>History</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Historical data will be available here once state history tracking is enabled.
        </p>
      </Card>
    </div>
  );
}
