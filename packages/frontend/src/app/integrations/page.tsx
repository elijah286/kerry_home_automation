'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { AddEntryDialog } from '@/components/AddEntryDialog';
import {
  Puzzle,
  Loader2,
  Lightbulb,
  Speaker,
  CookingPot,
  Waves,
  Battery,
  Camera,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import type { DeviceState, IntegrationHealth, IntegrationInfo, IntegrationEntry } from '@ha/shared';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  lutron: Lightbulb,
  yamaha: Speaker,
  paprika: CookingPot,
  pentair: Waves,
  tesla: Battery,
  unifi: Camera,
};

function healthVariant(state: string): 'success' | 'warning' | 'danger' | 'default' {
  if (state === 'connected') return 'success';
  if (state === 'reconnecting' || state === 'connecting') return 'warning';
  if (state === 'error' || state === 'disconnected') return 'danger';
  return 'default';
}

function statusLabel(health: IntegrationHealth, configured: boolean): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' } {
  if (health.state !== 'init') {
    return { label: health.state.charAt(0).toUpperCase() + health.state.slice(1), variant: healthVariant(health.state) };
  }
  if (configured) return { label: 'Connected', variant: 'success' };
  return { label: 'Not configured', variant: 'default' };
}

interface IntegrationData {
  health: IntegrationHealth;
  configured: boolean;
  entries: IntegrationEntry[];
  info: IntegrationInfo;
}

// ---------------------------------------------------------------------------
// Integration Sidebar — entry management only (no device list)
// ---------------------------------------------------------------------------

function IntegrationSidebar({
  data,
  onRefresh,
}: {
  data: IntegrationData;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IntegrationEntry | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const { info, health, configured } = data;
  const entries = data.entries ?? [];
  const { label: statusLbl, variant: statusVar } = statusLabel(health, configured);

  const handleDeleteEntry = async (entryId: string) => {
    await fetch(`${API_BASE}/api/integrations/${info.id}/entries/${entryId}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleRebuildEntry = async (entryId: string) => {
    setRebuilding(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/entries/${entryId}/rebuild`, { method: 'POST' });
      onRefresh();
    } finally {
      setRebuilding(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/restart`, { method: 'POST' });
      onRefresh();
    } finally {
      setRestarting(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${info.id}/rebuild`, { method: 'POST' });
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
          <Badge variant={statusVar}>{statusLbl}</Badge>
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
          {entries.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No instances configured.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
                >
                  <div
                    className="cursor-pointer flex-1 min-w-0"
                    onClick={() => router.push(`/devices?integration=${info.id}&entry=${entry.id}`)}
                  >
                    <div className="text-sm font-medium hover:underline">
                      {entry.label || entry.config.host || entry.config.email || 'Untitled'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {entry.config.host ?? entry.config.email ?? ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={entry.enabled ? 'success' : 'default'} className="text-[10px]">
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    {info.providesDevices && (
                      <button
                        onClick={() => handleRebuildEntry(entry.id)}
                        disabled={rebuilding}
                        className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                        title="Rebuild devices for this instance"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} style={{ color: 'var(--color-warning)' }} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingEntry(entry); setDialogOpen(true); }}
                      className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="rounded-md p-1.5 hover:bg-[var(--color-bg-hover)] transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </div>
                </div>
              ))}
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
        onSaved={onRefresh}
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
  onClick,
}: {
  data: IntegrationData;
  deviceCount: number;
  onClick: () => void;
}) {
  const { info, health, configured } = data;
  const entries = data.entries ?? [];
  const Icon = INTEGRATION_ICONS[info.id] ?? Puzzle;
  const { label: statusLbl, variant: statusVar } = statusLabel(health, configured);

  const entryCount = entries.length;
  const enabledCount = entries.filter((e) => e.enabled).length;

  return (
    <Card className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]" onClick={onClick}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}
        >
          <Icon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{info.name}</span>
            <Badge variant={statusVar}>{statusLbl}</Badge>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {entryCount > 0
              ? `${enabledCount} instance${enabledCount !== 1 ? 's' : ''}${deviceCount > 0 ? ` · ${deviceCount} device${deviceCount !== 1 ? 's' : ''}` : ''}`
              : info.description}
          </p>
        </div>
      </div>
    </Card>
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
    fetch(`${API_BASE}/api/integrations`)
      .then((r) => r.json())
      .then((data: { integrations: Record<string, IntegrationData> }) => {
        setIntegrationData(data.integrations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const selectedData = selectedId ? integrationData[selectedId] : null;

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <Puzzle className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Integrations</h1>
      </div>

      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading integrations...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(integrationData).map(([id, data]) => (
            <IntegrationCard
              key={id}
              data={data}
              deviceCount={devices.filter((d) => d.integration === id).length}
              onClick={() => setSelectedId(id)}
            />
          ))}
        </div>
      )}

      {selectedData && (
        <SlidePanel
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
          title={selectedData.info.name}
        >
          <IntegrationSidebar
            data={selectedData}
            onRefresh={loadIntegrations}
          />
        </SlidePanel>
      )}
    </div>
  );
}
