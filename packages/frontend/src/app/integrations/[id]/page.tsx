'use client';

import { useState, useEffect, useCallback, useRef, createElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AddEntryDialog } from '@/components/AddEntryDialog';
import {
  Puzzle, Loader2, Plus, Pencil, Trash2, RefreshCw,
  ChevronLeft, ChevronDown, ChevronRight, Save, MapPin,
  Cpu, Wifi, WifiOff, AlertTriangle,
} from 'lucide-react';
import {
  LutronIcon, YamahaIcon, PaprikaIcon, PentairIcon, TeslaIcon,
  UnifiIcon, SonyIcon, WeatherIcon, XboxIcon, MerossIcon,
  RoborockIcon, RachioIcon, CalendarIcon, RainsoftIcon, SenseIcon,
} from '@/components/icons/IntegrationIcons';
import type { DeviceState, IntegrationHealth, IntegrationInfo, IntegrationEntry, ConfigField } from '@ha/shared';
import { Permission } from '@ha/shared';
import { useAuth } from '@/providers/AuthProvider';
import type { EntrySaveDetail } from '@/components/AddEntryDialog';
import { RoborockCloudConnect, filterRoborockConfigFields } from '@/components/RoborockCloudConnect';
import { devicesForIntegrationEntry } from '@/lib/device-instance';
import { getApiBase } from '@/lib/api-base';

function IntegrationDebugLoggingCard({ integrationId }: { integrationId: string }) {
  const { hasPermission } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getApiBase()}/api/integrations/debug-logging`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { flags?: Record<string, boolean> }) => {
        if (!cancelled) setEnabled(d.flags?.[integrationId] === true);
      })
      .catch(() => {
        if (!cancelled) setErr('Could not load debug flags');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [integrationId]);

  if (!hasPermission(Permission.ManageIntegrations)) return null;

  const toggle = async () => {
    setSaving(true);
    setErr(null);
    try {
      const next = !enabled;
      const res = await fetch(`${getApiBase()}/api/integrations/${integrationId}/debug-logging`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setEnabled(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-sm font-semibold">Troubleshooting</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          When enabled, the system terminal includes extra diagnostic lines from this integration. Open Status → full
          screen → <span className="font-medium">Sources</span> to filter logs by integration.
        </p>
      </div>
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Detailed logging
        </span>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void toggle()}
          className="rounded-lg px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-60"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: enabled ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: enabled ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {loading ? '…' : saving ? 'Saving…' : enabled ? 'On' : 'Off'}
        </button>
      </div>
      {err ? <p className="px-5 pb-3 text-xs" style={{ color: 'var(--color-danger)' }}>{err}</p> : null}
    </Card>
  );
}

interface UnifiDiagEntry {
  entryId: string;
  label: string;
  go2rtcUrl: string;
  reachable: boolean;
  httpStatus?: number;
  streamCount: number;
  streamNames: string[];
  error?: string;
  hint?: string;
}

/** Live probe of go2rtc from the backend — explains “works on laptop, empty on server” (wrong URL / Docker localhost). */
function UnifiDiagnosticsCard() {
  const [entries, setEntries] = useState<UnifiDiagEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`${getApiBase()}/api/cameras/diagnostics`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { entries?: UnifiDiagEntry[] }) => setEntries(d.entries ?? []))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
        setEntries(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-sm font-semibold">go2rtc connectivity (this server)</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          The backend reads camera names from go2rtc&apos;s <span className="font-mono">/api/streams</span>. If this shows
          zero streams but your laptop works, set go2rtc URL to the LAN IP of the machine running go2rtc (reachable from
          this server), not localhost unless go2rtc runs on the same host as the backend.
        </p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking go2rtc…
          </div>
        ) : err ? (
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{err}</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No enabled UniFi instances with a go2rtc URL.</p>
        ) : (
          entries.map((e) => (
            <div
              key={e.entryId}
              className="rounded-lg border px-3 py-2 text-xs space-y-1"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{e.label}</div>
              <div className="font-mono break-all opacity-90">{e.go2rtcUrl}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span style={{ color: e.reachable ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {e.reachable ? 'Reachable' : 'Not reachable'}
                  {e.httpStatus != null ? ` (HTTP ${e.httpStatus})` : ''}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>Streams: {e.streamCount}</span>
              </div>
              {e.error ? <p style={{ color: 'var(--color-danger)' }}>{e.error}</p> : null}
              {e.streamNames.length > 0 ? (
                <p className="text-[10px] break-words" style={{ color: 'var(--color-text-muted)' }}>
                  {e.streamNames.join(', ')}
                  {e.streamCount > e.streamNames.length ? ' …' : ''}
                </p>
              ) : null}
              {e.hint ? <p className="mt-1" style={{ color: 'var(--color-warning)' }}>{e.hint}</p> : null}
            </div>
          ))
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs rounded border px-3 py-1.5 transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Refresh check
        </button>
      </div>
    </Card>
  );
}

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
  calendar: CalendarIcon,
  rainsoft: RainsoftIcon,
  sense: SenseIcon,
};

interface IntegrationData {
  health: IntegrationHealth;
  configured: boolean;
  entries: IntegrationEntry[];
  info: IntegrationInfo;
}

function integrationStatus(data: IntegrationData, devices: DeviceState[]) {
  const entries = data.entries ?? [];
  const enabledEntries = entries.filter((e) => e.enabled);
  if (enabledEntries.length === 0) return { label: 'Offline', variant: 'danger' as const };

  const integrationDevices = devices.filter((d) => d.integration === data.info.id);
  const onlineDevices = integrationDevices.filter((d) => d.available).length;
  const totalDevices = integrationDevices.length;

  if (data.info.providesDevices) {
    if (totalDevices === 0) {
      return { label: 'No devices', variant: 'warning' as const };
    }
    if (onlineDevices === totalDevices) return { label: 'Connected', variant: 'success' as const };
    if (onlineDevices > 0) return { label: 'Problem', variant: 'warning' as const };
    return { label: 'Offline', variant: 'danger' as const };
  }
  return { label: 'Connected', variant: 'success' as const };
}

// ---------------------------------------------------------------------------
// Inline New Instance Form
// ---------------------------------------------------------------------------

const PROVISION_TIMEOUT_MS = 60_000;
const PROVISION_PHASE_MS = 2_800;

function NewInstanceCard({
  integrationId,
  integrationName,
  fields,
  onSaved,
}: {
  integrationId: string;
  integrationName: string;
  fields: ConfigField[];
  onSaved: (detail?: EntrySaveDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reset = () => {
    setLabel('');
    const defaults: Record<string, string> = {};
    for (const f of fields) {
      if (f.defaultValue) defaults[f.key] = f.defaultValue;
    }
    setValues(defaults);
    setSaveError(null);
  };

  const handleToggle = () => {
    if (!expanded) reset();
    setExpanded((v) => !v);
  };

  const configFields =
    integrationId === 'roborock' ? filterRoborockConfigFields(fields, values) : fields;

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/integrations/${integrationId}/entries`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, config: values }),
      });
      const text = await res.text();
      let data: { id?: string; error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as { id?: string; error?: string }) : {};
      } catch {
        setSaveError(res.ok ? 'Invalid response from server' : `Request failed (${res.status})`);
        return;
      }
      if (!res.ok) {
        setSaveError(
          typeof data.error === 'string'
            ? data.error
            : res.status === 403
              ? 'Admin access required — sign in as an admin user or use PIN elevation, then try again.'
              : res.status === 401
                ? 'Session expired — sign in again.'
                : `Could not save (${res.status})`,
        );
        return;
      }
      if (!data.id) {
        setSaveError('Invalid response from server');
        return;
      }
      onSaved({ kind: 'created', entryId: data.id });
      setExpanded(false);
      reset();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error — is the backend running on port 3000?');
    } finally {
      setSaving(false);
    }
  };

  const useHomeLocation = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings`, { credentials: 'include' });
      const data = await res.json();
      const s = data.settings as Record<string, unknown>;
      if (typeof s.home_latitude === 'number' && typeof s.home_longitude === 'number') {
        setValues((v) => ({
          ...v,
          latitude: String(s.home_latitude),
          longitude: String(s.home_longitude),
        }));
        if (!label && typeof s.home_address === 'string') {
          setLabel(s.home_address as string);
        }
      }
    } catch {}
  };

  return (
    <Card className="overflow-hidden !p-0">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Plus className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
            Add New Instance
          </span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Configure a new {integrationName} connection
          </p>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
      </button>

      {expanded && (
        <div
          className="border-t px-5 py-5"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <form
            className="space-y-4"
            style={{ position: 'relative', zIndex: 2 }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleSave();
            }}
            onClick={(e) => e.stopPropagation()}
          >
          {integrationId === 'tesla' && (
            <p className="text-xs rounded-lg border px-3 py-2" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              Use &apos;Auth App for Tesla&apos; on iOS or &apos;Tesla Tokens&apos; on Android to create a refresh token.
            </p>
          )}

          {(integrationId === 'weather' || integrationId === 'sun') && (
            <button
              type="button"
              onClick={useHomeLocation}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors border w-full justify-center"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <MapPin className="h-3.5 w-3.5" />
              Use Home Location
            </button>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Instance Label
            </label>
            <input
              type="text"
              placeholder="e.g. Main House, Upstairs, etc."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          {configFields.map((field) => (
            <div key={field.key} className="space-y-1">
              {field.type === 'checkbox' ? (
                <label className="flex items-center gap-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values[field.key] === 'true'}
                    onChange={(e) => setValues({ ...values, [field.key]: String(e.target.checked) })}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span className="text-sm">{field.label}</span>
                </label>
              ) : (
                <>
                  <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    {field.label}
                    {field.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                  </label>
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </>
              )}
            </div>
          ))}

          {integrationId === 'roborock' && values.local_miio !== 'true' && (
            <RoborockCloudConnect
              email={values.email ?? ''}
              onSessionReady={(session) =>
                setValues((v) => ({
                  ...v,
                  cloud_user_data: JSON.stringify(session.user_data),
                  cloud_email: v.email ?? '',
                  cloud_base_url: session.base_url ?? '',
                  local_miio: 'false',
                }))
              }
            />
          )}

          {saveError ? (
            <p className="text-xs rounded-lg border px-3 py-2" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>
              {saveError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setExpanded(false); setSaveError(null); }}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save Instance'}
            </button>
          </div>
          </form>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Instance Card — expandable with device list
// ---------------------------------------------------------------------------

function InstanceCard({
  entry,
  integrationId,
  integrationName,
  fields,
  devices,
  providesDevices,
  provisioningEntryId,
  provisionPhase,
  rebuilding,
  onEdit,
  onDelete,
  onRebuild,
}: {
  entry: IntegrationEntry;
  integrationId: string;
  integrationName: string;
  fields: ConfigField[];
  devices: DeviceState[];
  providesDevices: boolean;
  provisioningEntryId: string | null;
  provisionPhase: 'connect' | 'discover';
  rebuilding: boolean;
  onEdit: (entry: IntegrationEntry) => void;
  onDelete: (entryId: string) => void;
  onRebuild: (entryId: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const instanceDevices = devicesForIntegrationEntry(devices, integrationId, entry.id);
  const deviceCount = instanceDevices.length;
  const availableCount = instanceDevices.filter((d) => d.available).length;
  const isProvisioning = provisioningEntryId === entry.id && providesDevices;

  const displayName = entry.label || entry.config.host || entry.config.email || 'Untitled';
  const subtitle = entry.label && (entry.config.host ?? entry.config.email)
    ? (entry.config.host ?? entry.config.email)
    : null;

  const statusIcon = !entry.enabled
    ? <WifiOff className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
    : deviceCount > 0 && availableCount < deviceCount
    ? <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--color-warning)' }} />
    : entry.enabled
    ? <Wifi className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
    : null;

  return (
    <Card className="overflow-hidden !p-0">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-3 min-w-0 text-left"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            {isProvisioning
              ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
              : statusIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{displayName}</span>
              <Badge variant={entry.enabled ? 'success' : 'default'} className="text-[10px] shrink-0">
                {entry.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {subtitle && (
                <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</span>
              )}
              {isProvisioning ? (
                <span className="text-xs" style={{ color: 'var(--color-accent)' }}>
                  {provisionPhase === 'connect' ? 'Connecting…' : 'Discovering devices…'}
                </span>
              ) : providesDevices ? (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {deviceCount === 0
                    ? 'No devices yet'
                    : `${availableCount}/${deviceCount} device${deviceCount === 1 ? '' : 's'} online`}
                </span>
              ) : null}
            </div>
          </div>
          {expanded
            ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
            : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {providesDevices && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRebuild(entry.id); }}
              disabled={rebuilding}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
              aria-label="Rebuild devices"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} style={{ color: 'var(--color-warning)' }} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
            className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
            aria-label="Edit integration"
          >
            <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
            className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
            aria-label="Delete integration"
          >
            <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
          </button>
        </div>
      </div>

      {/* Expanded device list */}
      {expanded && (
        <div
          className="border-t px-5 py-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {!providesDevices ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              This integration does not expose devices.
            </p>
          ) : isProvisioning ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--color-accent)' }} />
              {provisionPhase === 'connect' ? 'Connecting to instance…' : 'Discovering devices…'}
            </div>
          ) : instanceDevices.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No devices found yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Devices ({deviceCount})
                </span>
                <button
                  className="text-xs transition-colors hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                  onClick={() => {
                    const lbl = encodeURIComponent(entry.label || entry.config.host || entry.config.email || 'Instance');
                    router.push(`/devices?integration=${integrationId}&entry=${entry.id}&entryLabel=${lbl}`);
                  }}
                >
                  View all in Devices →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {instanceDevices.map((device) => {
                  const deviceName = device.id.split('.').slice(2).join('.') || device.id;
                  return (
                    <div
                      key={device.id}
                      className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                    >
                      <div
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: device.available ? 'var(--color-success)' : 'var(--color-danger)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {'alias' in device && device.alias ? String(device.alias) : deviceName}
                        </p>
                        {'type' in device && device.type && (
                          <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {String(device.type)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Detail Page
// ---------------------------------------------------------------------------

export default function IntegrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const integrationId = params.id as string;
  const { devices } = useWebSocket();

  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildingEntryId, setRebuildingEntryId] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IntegrationEntry | null>(null);

  const [provisioningEntryId, setProvisioningEntryId] = useState<string | null>(null);
  const [provisionPhase, setProvisionPhase] = useState<'connect' | 'discover'>('connect');
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const loadData = useCallback(() => {
    fetch(`${getApiBase()}/api/integrations`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { integrations: Record<string, IntegrationData> }) => {
        const found = d.integrations[integrationId];
        if (found) setData(found);
        else router.push('/integrations');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [integrationId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Provisioning state machine
  useEffect(() => {
    if (!provisioningEntryId) return;
    setProvisionPhase('connect');
    const t = window.setTimeout(() => setProvisionPhase('discover'), PROVISION_PHASE_MS);
    return () => window.clearTimeout(t);
  }, [provisioningEntryId]);

  useEffect(() => {
    if (!provisioningEntryId || !data?.info.providesDevices) return;
    const entryId = provisioningEntryId;

    const tryFinish = () => {
      const n = devicesForIntegrationEntry(devicesRef.current, integrationId, entryId).length;
      if (n > 0) { setProvisioningEntryId(null); return true; }
      return false;
    };

    if (tryFinish()) return;
    loadData();
    const poll = window.setInterval(() => { loadData(); tryFinish(); }, 1_400);
    const timeout = window.setTimeout(() => setProvisioningEntryId(null), PROVISION_TIMEOUT_MS);
    return () => { window.clearInterval(poll); window.clearTimeout(timeout); };
  }, [provisioningEntryId, data?.info.providesDevices, integrationId, loadData]);

  useEffect(() => {
    if (!provisioningEntryId || !data?.info.providesDevices) return;
    const n = devicesForIntegrationEntry(devices, integrationId, provisioningEntryId).length;
    if (n > 0) setProvisioningEntryId(null);
  }, [devices, provisioningEntryId, integrationId, data?.info.providesDevices]);

  const handleEntrySaved = useCallback((detail?: EntrySaveDetail) => {
    loadData();
    if (detail?.kind === 'created' && data?.info.providesDevices) {
      setProvisioningEntryId(detail.entryId);
    }
  }, [data?.info.providesDevices, loadData]);

  const handleDeleteEntry = async (entryId: string) => {
    await fetch(`${getApiBase()}/api/integrations/${integrationId}/entries/${entryId}`, { method: 'DELETE', credentials: 'include' });
    loadData();
  };

  const handleRebuildEntry = async (entryId: string) => {
    setRebuildingEntryId(entryId);
    try {
      await fetch(`${getApiBase()}/api/integrations/${integrationId}/entries/${entryId}/rebuild`, { method: 'POST', credentials: 'include' });
      loadData();
    } finally {
      setRebuildingEntryId(null);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await fetch(`${getApiBase()}/api/integrations/${integrationId}/restart`, { method: 'POST', credentials: 'include' });
      loadData();
    } finally {
      setRestarting(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await fetch(`${getApiBase()}/api/integrations/${integrationId}/rebuild`, { method: 'POST', credentials: 'include' });
      loadData();
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
      </div>
    );
  }

  if (!data) return null;

  const { info, configured } = data;
  const entries = data.entries ?? [];
  const Icon = INTEGRATION_ICONS[info.id] ?? Puzzle;
  const status = integrationStatus(data, devices);
  const totalDevices = devices.filter((d) => d.integration === info.id).length;
  const onlineDevices = devices.filter((d) => d.integration === info.id && d.available).length;
  const enabledInstances = entries.filter((e) => e.enabled).length;

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/integrations')}
        className="flex items-center gap-1.5 text-sm transition-colors hover:underline"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ChevronLeft className="h-4 w-4" />
        All Integrations
      </button>

      {/* Header card */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
          >
            {createElement(Icon, {
              className: 'h-7 w-7',
              style: { color: 'var(--color-accent)' },
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{info.name}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {info.description}
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="grid grid-cols-3 border-t divide-x"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {[
            { label: 'Instances', value: enabledInstances, total: entries.length },
            ...(info.providesDevices
              ? [{ label: 'Devices', value: onlineDevices, total: totalDevices }]
              : [{ label: 'Devices', value: null, total: null }]),
            { label: 'Integration ID', value: null, raw: info.id },
          ].map((stat, i) => (
            <div key={i} className="px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
              {'raw' in stat && stat.raw ? (
                <p className="text-sm font-mono mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{stat.raw}</p>
              ) : stat.total !== null && stat.total !== undefined ? (
                <p className="text-lg font-semibold mt-0.5">
                  {stat.value}
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>/ {stat.total}</span>
                </p>
              ) : (
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>—</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <IntegrationDebugLoggingCard integrationId={info.id} />

      {info.id === 'unifi' ? <UnifiDiagnosticsCard /> : null}

      {/* Instances section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Instances</h2>
          {entries.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {entries.length} configured
            </span>
          )}
        </div>

        {/* New instance card */}
        <NewInstanceCard
          integrationId={info.id}
          integrationName={info.name}
          fields={info.configFields}
          onSaved={handleEntrySaved}
        />

        {/* Existing instances */}
        {entries.map((entry) => (
          <InstanceCard
            key={entry.id}
            entry={entry}
            integrationId={info.id}
            integrationName={info.name}
            fields={info.configFields}
            devices={devices}
            providesDevices={info.providesDevices}
            provisioningEntryId={provisioningEntryId}
            provisionPhase={provisionPhase}
            rebuilding={rebuildingEntryId === entry.id}
            onEdit={(e) => { setEditingEntry(e); setEditDialogOpen(true); }}
            onDelete={handleDeleteEntry}
            onRebuild={handleRebuildEntry}
          />
        ))}

        {entries.length === 0 && !provisioningEntryId && (
          <p className="text-sm text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
            No instances configured yet. Add one above to get started.
          </p>
        )}
      </div>

      {/* Integration actions */}
      {configured && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors border"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
              {restarting ? 'Restarting…' : 'Restart Integration'}
            </button>
            {info.providesDevices && (
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors border"
                style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-warning)', borderColor: 'var(--color-border)' }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                {rebuilding ? 'Rebuilding…' : 'Rebuild All Devices'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit entry dialog */}
      {editingEntry && (
        <AddEntryDialog
          open={editDialogOpen}
          onClose={() => { setEditDialogOpen(false); setEditingEntry(null); }}
          integrationId={info.id}
          integrationName={info.name}
          fields={info.configFields}
          entry={editingEntry}
          onSaved={handleEntrySaved}
        />
      )}
    </div>
  );
}
