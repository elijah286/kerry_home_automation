'use client';

import { useState, useEffect, useCallback, createElement } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import {
  Cpu, ArrowLeft, RefreshCw, Loader2, Power, RotateCcw,
  HardDrive, MemoryStick, Activity, Terminal, AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface SystemStats {
  cpu: { percent: number; cores: number; model: string };
  memory: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  uptime: number;
  platform: string;
  hostname: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${bytes} B`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface GaugeProps {
  label: string;
  icon: React.ElementType;
  percent: number;
  detail: string;
}

function Gauge({ label, icon: Icon, percent, detail }: GaugeProps) {
  const color = percent > 85 ? 'var(--color-danger)' : percent > 65 ? 'var(--color-warning, #f59e0b)' : 'var(--color-accent)';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-2">
        {createElement(Icon, { className: 'h-3.5 w-3.5', style: { color } })}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="w-full rounded-full h-1.5 overflow-hidden mb-1"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{detail}</span>
        <span className="text-xs font-mono" style={{ color }}>{percent}%</span>
      </div>
    </div>
  );
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface ActionButtonProps {
  label: string;
  icon: React.ElementType;
  state: ActionState;
  onClick: () => void;
  danger?: boolean;
  confirmLabel?: string;
}

function ActionButton({ label, icon: Icon, state, onClick, danger, confirmLabel }: ActionButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (danger && !confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    onClick();
  };

  const isLoading = state === 'loading';
  const isSuccess = state === 'success';

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border transition-colors disabled:opacity-50"
      style={{
        backgroundColor: confirming
          ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)'
          : isSuccess
            ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
            : 'var(--color-bg-secondary)',
        borderColor: confirming
          ? 'var(--color-danger)'
          : isSuccess
            ? 'var(--color-success)'
            : 'var(--color-border)',
        color: confirming
          ? 'var(--color-danger)'
          : isSuccess
            ? 'var(--color-success)'
            : 'var(--color-text-secondary)',
      }}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isSuccess ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        createElement(Icon, { className: 'h-3.5 w-3.5' })
      )}
      {confirming ? (confirmLabel ?? 'Confirm?') : isSuccess ? 'Done' : label}
    </button>
  );
}

export default function SystemPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});

  const setAction = (key: string, state: ActionState) => {
    setActionStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'success' || state === 'error') {
      setTimeout(() => setActionStates((prev) => ({ ...prev, [key]: 'idle' })), 3000);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/stats`, { credentials: 'include' });
      if (res.ok) {
        setStats(await res.json() as SystemStats);
        setStatsError(false);
      } else {
        setStatsError(true);
      }
    } catch {
      setStatsError(true);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/system/update-log`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { lines: string[] };
        setLogLines(data.lines);
      }
    } catch { /* ignore */ }
    setLogLoading(false);
  }, []);

  // Poll stats every 5s
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const runAction = async (key: string, path: string) => {
    setAction(key, 'loading');
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setAction(key, 'success');
      } else {
        setAction(key, 'error');
      }
    } catch {
      setAction(key, 'error');
    }
  };

  const as = (key: string): ActionState => actionStates[key] ?? 'idle';

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 lg:p-6 flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-1 rounded-lg hover:bg-[var(--color-bg-hover)]">
            <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          </Link>
          <h1 className="text-lg font-semibold">System</h1>
        </div>
        <Card>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            System telemetry and controls are limited to administrator accounts.
          </p>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="mt-4 text-sm font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            Back to Settings
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-1 rounded-lg hover:bg-[var(--color-bg-hover)]">
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <Cpu className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">System</h1>
          {stats && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {stats.hostname} · up {formatUptime(stats.uptime)} · {stats.platform}
            </p>
          )}
        </div>
      </div>

      {/* Hardware telemetry */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Hardware</h2>
          {statsError && (
            <span className="text-xs" style={{ color: 'var(--color-danger)' }}>
              Failed to load stats
            </span>
          )}
        </div>
        {stats ? (
          <div className="flex gap-6 flex-wrap">
            <Gauge
              label="CPU"
              icon={Activity}
              percent={stats.cpu.percent}
              detail={`${stats.cpu.cores} cores`}
            />
            <Gauge
              label="Memory"
              icon={MemoryStick}
              percent={stats.memory.percent}
              detail={`${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`}
            />
            <Gauge
              label="Disk"
              icon={HardDrive}
              percent={stats.disk.percent}
              detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
            />
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        )}
      </Card>

      {/* Services */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Services</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Restart individual services. The backend will be briefly unreachable during a backend restart.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Restart Backend"
            icon={RotateCcw}
            state={as('restart-backend')}
            onClick={() => runAction('restart-backend', '/api/system/restart/backend')}
          />
          <ActionButton
            label="Restart Frontend"
            icon={RotateCcw}
            state={as('restart-frontend')}
            onClick={() => runAction('restart-frontend', '/api/system/restart/frontend')}
          />
        </div>
      </Card>

      {/* Automations & Helpers */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Automations & Helpers</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Reload in-memory state from the database without restarting any services.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Reload Automations"
            icon={RefreshCw}
            state={as('reload-automations')}
            onClick={() => runAction('reload-automations', '/api/system/reload/automations')}
          />
          <ActionButton
            label="Reload Helpers"
            icon={RefreshCw}
            state={as('reload-helpers')}
            onClick={() => runAction('reload-helpers', '/api/helpers/reload')}
          />
        </div>
      </Card>

      {/* Hardware restart */}
      <Card>
        <div className="flex gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }} />
          <div className="flex-1">
            <h2 className="text-sm font-medium mb-1">Restart Hardware</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Reboots the entire server. All services will be offline for 30–60 seconds while the
              system boots and Docker starts. Click twice to confirm.
            </p>
            <ActionButton
              label="Reboot Server"
              icon={Power}
              state={as('restart-hardware')}
              onClick={() => runAction('restart-hardware', '/api/system/restart/hardware')}
              danger
              confirmLabel="Confirm reboot"
            />
          </div>
        </div>
      </Card>

      {/* Update log */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-sm font-medium">Auto-Update Log</h2>
          </div>
          <button
            onClick={fetchLog}
            disabled={logLoading}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw className={`h-3 w-3 ${logLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {logLines.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
            No update log yet. Updates run every 5 minutes on the deployed server.
          </p>
        ) : (
          <div
            className="rounded-lg p-3 overflow-x-auto"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <pre className="text-xs font-mono leading-5 whitespace-pre-wrap break-all"
              style={{ color: 'var(--color-text-muted)' }}>
              {logLines.join('\n')}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
