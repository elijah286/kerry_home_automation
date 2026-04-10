'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Puzzle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Save,
  Loader2,
  Lightbulb,
  Speaker,
  CookingPot,
  Waves,
  Battery,
} from 'lucide-react';
import Link from 'next/link';
import type { DeviceState, IntegrationHealth, IntegrationInfo, ConfigField } from '@ha/shared';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  lutron: Lightbulb,
  yamaha: Speaker,
  paprika: CookingPot,
  pentair: Waves,
  tesla: Battery,
};

function healthVariant(state: string): 'success' | 'warning' | 'danger' | 'default' {
  if (state === 'connected') return 'success';
  if (state === 'reconnecting' || state === 'connecting') return 'warning';
  if (state === 'error' || state === 'disconnected') return 'danger';
  return 'default';
}

interface IntegrationData {
  health: IntegrationHealth;
  configured: boolean;
  info: IntegrationInfo;
}

function ConfigForm({ integrationId, fields, onSaved }: { integrationId: string; fields: ConfigField[]; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/integrations/${integrationId}/config`)
      .then((r) => r.json())
      .then((data: { config: Record<string, string> }) => {
        setValues(data.config ?? {});
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [integrationId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/integrations/${integrationId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      // Restart the integration so new config takes effect immediately
      await fetch(`${API_BASE}/api/integrations/${integrationId}/restart`, { method: 'POST' });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (loadingConfig) {
    return <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />;
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {field.label} {field.required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
          </label>
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            placeholder={field.placeholder}
            value={values[field.key] ?? ''}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      ))}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save &amp; Apply
      </button>
    </div>
  );
}

function IntegrationCard({
  data,
  devices,
}: {
  data: IntegrationData;
  devices: DeviceState[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [configApplied, setConfigApplied] = useState(false);
  const { info, health, configured } = data;
  const Icon = INTEGRATION_ICONS[info.id] ?? Puzzle;
  const isPaprika = info.id === 'paprika';

  return (
    <Card>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}
          >
            <Icon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{info.name}</span>
              <Badge variant={health.state !== 'init' ? healthVariant(health.state) : configured ? 'default' : 'default'}>
                {health.state !== 'init' ? health.state : configured ? 'Ready' : 'Not configured'}
              </Badge>
              {configApplied && <Badge variant="success">Applied</Badge>}
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{info.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {info.providesDevices && configured && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {devices.length} device{devices.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t pt-3 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          {/* Config form */}
          <div>
            <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Configuration</h4>
            <ConfigForm
              integrationId={info.id}
              fields={info.configFields}
              onSaved={() => setConfigApplied(true)}
            />
          </div>

          {/* Devices or link */}
          {isPaprika && configured && (
            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Recipe integration — no devices
              </span>
              <Link
                href="/recipes"
                className="inline-flex items-center gap-1 text-sm"
                style={{ color: 'var(--color-accent)' }}
              >
                Recipes <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {info.providesDevices && devices.length > 0 && (
            <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Devices ({devices.length})
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {devices.map((d) => (
                  <Link
                    key={d.id}
                    href={`/devices/${encodeURIComponent(d.id)}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <span>{d.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
                        {d.type.replace('_', ' ')}
                      </span>
                      <Badge variant={d.available ? 'success' : 'danger'} className="text-[10px]">
                        {d.available ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function IntegrationsPage() {
  const { devices } = useWebSocket();
  const [integrationData, setIntegrationData] = useState<Record<string, IntegrationData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/integrations`)
      .then((r) => r.json())
      .then((data: { integrations: Record<string, IntegrationData> }) => {
        setIntegrationData(data.integrations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
              devices={devices.filter((d) => d.integration === id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
