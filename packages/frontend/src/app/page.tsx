'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Lightbulb,
  ToggleLeft,
  Fan,
  Blinds,
  Speaker,
} from 'lucide-react';
import type { DeviceState, IntegrationHealth } from '@ha/shared';

const typeConfig: Record<string, { icon: React.ElementType; label: string }> = {
  light: { icon: Lightbulb, label: 'Lights' },
  switch: { icon: ToggleLeft, label: 'Switches' },
  fan: { icon: Fan, label: 'Fans' },
  cover: { icon: Blinds, label: 'Covers' },
  media_player: { icon: Speaker, label: 'Media Players' },
};

function healthVariant(state: string): 'success' | 'warning' | 'danger' | 'default' {
  if (state === 'connected') return 'success';
  if (state === 'reconnecting' || state === 'connecting') return 'warning';
  if (state === 'error' || state === 'disconnected') return 'danger';
  return 'default';
}

export default function Dashboard() {
  const { devices, integrations, connected } = useWebSocket();

  const counts = new Map<string, number>();
  for (const d of devices) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  }

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)' }}
        />
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {devices.length} device{devices.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Device counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {Object.entries(typeConfig).map(([type, { icon: Icon, label }]) => {
          const count = counts.get(type) ?? 0;
          return (
            <Card key={type}>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}
                >
                  <Icon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                </div>
                <div>
                  <div className="text-xl font-semibold">{count}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Integration status */}
      <div>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          Integrations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(integrations).map(([id, health]) => (
            <Card key={id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{id}</span>
                <Badge variant={healthVariant(health.state)}>{health.state}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
