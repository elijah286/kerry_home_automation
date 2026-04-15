'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  AlertTriangle,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import { getApiBase } from '@/lib/api-base';
import { signalServerTransitionPending } from '@/lib/server-transition';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';

const API = getApiBase();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitRow {
  hash: string;
  subject: string;
  date: string;
}

interface DeployRefInfo {
  sha: string;
  versionLabel: string | null;
  description: string;
}

interface CheckResponse {
  checkSupported: boolean;
  reason?: string;
  updateAvailable?: boolean;
  /** True when the running version comes from build-info.json (reliable). False for pre-CI containers. */
  containerVersionKnown?: boolean;
  currentSha?: string;
  remoteSha?: string;
  running?: DeployRefInfo;
  remote?: DeployRefInfo;
  commits?: CommitRow[];
  error?: string;
}

interface ProgressEvent {
  id: number;
  ts: string;
  stage: string;
  status: 'running' | 'completed' | 'failed' | 'log';
  msg: string;
}

interface UpdateStatus {
  inProgress: boolean;
  startedAt: string | null;
  targetVersion: string | null;
  currentStage: string | null;
  stages: ProgressEvent[];
  finalStatus: 'completed' | 'failed' | null;
}

// ---------------------------------------------------------------------------
// Stage metadata for display
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  preflight: 'Preflight checks',
  pull_code: 'Fetching code',
  pull_images: 'Pulling images',
  db_backup: 'Database backup',
  restart: 'Restarting services',
  health_check: 'Health validation',
  verify: 'Post-deploy verification',
  done: 'Complete',
  rollback: 'Rolling back',
};

const STAGE_ORDER = [
  'preflight',
  'pull_code',
  'pull_images',
  'db_backup',
  'restart',
  'health_check',
  'verify',
  'done',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortSha(sha: string | undefined): string {
  if (!sha) return '—';
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha;
}

function formatCommitDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function StageIcon({ status }: { status: 'pending' | 'running' | 'completed' | 'failed' }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-success)' }} />;
    case 'failed':
      return <XCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-danger)' }} />;
    default:
      return <div className="h-4 w-4 shrink-0 rounded-full border-2" style={{ borderColor: 'var(--color-border)' }} />;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function DeployRefBlock({
  title,
  info,
  shaFallback,
}: {
  title: string;
  info?: DeployRefInfo;
  shaFallback?: string;
}) {
  const version = info?.versionLabel ?? null;
  const description = info?.description?.trim() || '—';
  const sha = info?.sha ?? shaFallback ?? '';

  return (
    <div
      className="rounded-lg border px-3 py-3 space-y-2"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </div>
      <div className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
        {version ?? shortSha(sha)}
      </div>
      <p className="text-sm leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </p>
      <div className="text-[11px] font-mono break-all opacity-75" style={{ color: 'var(--color-text-muted)' }}>
        {sha || '—'}
      </div>
    </div>
  );
}

function DeployProgress({
  events,
  isConnected,
}: {
  events: ProgressEvent[];
  isConnected: boolean;
}) {
  // Determine the status of each stage (skip 'log' lines — those go to the system terminal)
  const stageStatuses = new Map<string, 'pending' | 'running' | 'completed' | 'failed'>();
  for (const stage of STAGE_ORDER) stageStatuses.set(stage, 'pending');

  for (const ev of events) {
    if (ev.status !== 'log') {
      stageStatuses.set(ev.stage, ev.status === 'running' ? 'running' : ev.status === 'completed' ? 'completed' : 'failed');
    }
  }

  const lastEvent = events[events.length - 1];
  const isDone = lastEvent?.stage === 'done';
  const isFailed = lastEvent?.status === 'failed';

  return (
    <div className="space-y-4">
      {/* Stage progress */}
      <div className="space-y-2">
        {STAGE_ORDER.map((stage) => {
          const status = stageStatuses.get(stage) ?? 'pending';
          // Find the most recent message for this stage
          const stageEvents = events.filter((e) => e.stage === stage && e.status !== 'log');
          const lastMsg = stageEvents[stageEvents.length - 1]?.msg;

          return (
            <div key={stage} className="flex items-start gap-3">
              <StageIcon status={status} />
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium"
                  style={{ color: status === 'pending' ? 'var(--color-text-muted)' : 'var(--color-text)' }}
                >
                  {STAGE_LABELS[stage] ?? stage}
                </div>
                {lastMsg && status !== 'pending' && (
                  <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {lastMsg}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection status */}
      {!isConnected && !isDone && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Services are restarting — reconnecting when the API is back...
        </div>
      )}

      {/* Final status */}
      {isDone && !isFailed && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
            color: 'var(--color-success)',
          }}
        >
          <Check className="h-4 w-4 shrink-0" />
          {lastEvent?.msg ?? 'Update completed successfully'}
        </div>
      )}

      {isFailed && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {lastEvent?.msg ?? 'Deployment failed'}
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SoftwareUpdatePage() {
  const { isAdmin, loading } = useAuth();
  const { openWithSourceFilter } = useSystemTerminal();
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [deployEvents, setDeployEvents] = useState<ProgressEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirrors `deploying` so SSE reconnection callbacks always read the current
  // value instead of a stale closure capture.
  const deployingRef = useRef(false);
  useEffect(() => { deployingRef.current = deploying; }, [deploying]);

  // On mount, check if a deployment is already in progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/system/update/status`, { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const status = (await r.json()) as UpdateStatus;
        if (status.inProgress) {
          // Backend confirms a deploy is actively running right now
          setDeploying(true);
          setDeployEvents(status.stages);
          connectSSE();
        } else if (status.finalStatus && status.stages.length > 0) {
          // Show the results of the last completed/failed deployment
          setDeployEvents(status.stages);
        }
        // If stages exist but no finalStatus and NOT inProgress, the deploy was
        // interrupted (e.g. the backend restarted and the script is long gone).
        // Don't show stale progress — the user can trigger a new deploy.
      } catch {
        // API not available — ignore
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE connection for real-time progress.
  // Uses deployingRef (always current) instead of the `deploying` state value
  // which would be stale inside the onerror closure.
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const url = `${API}/api/system/update/progress`;
    const es = new EventSource(url, { withCredentials: true });

    es.onopen = () => {
      setSseConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data) as ProgressEvent;
        setDeployEvents((prev) => {
          // Deduplicate by id
          if (prev.some((p) => p.id === ev.id)) return prev;
          return [...prev, ev];
        });

        // Detect completion
        if (ev.stage === 'done') {
          setDeploying(false);
          es.close();
          sseRef.current = null;
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
      sseRef.current = null;

      // Reconnect after delay — the backend is likely restarting during a deploy.
      // Read deployingRef (not the stale `deploying` closure) so we keep retrying.
      const scheduleReconnect = (delay: number) => {
        reconnectTimerRef.current = setTimeout(() => {
          if (!deployingRef.current) return; // deploy finished or was never started

          fetch(`${API}/api/system/update/status`, { credentials: 'include' })
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            })
            .then((status: UpdateStatus) => {
              if (status.stages.length > 0) {
                setDeployEvents(status.stages);
              }
              if (status.finalStatus) {
                setDeploying(false);
              } else {
                connectSSE();
              }
            })
            .catch(() => {
              // API still down — keep retrying every 4s
              scheduleReconnect(4000);
            });
        }, delay);
      };

      scheduleReconnect(3000);
    };

    sseRef.current = es;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const runCheck = useCallback(async () => {
    setCheckLoading(true);
    setDeployError(null);
    try {
      const r = await fetch(`${API}/api/system/update/check`, { credentials: 'include' });
      const j = (await r.json()) as CheckResponse;
      if (!r.ok) {
        setCheck({ checkSupported: false, error: (j as { error?: string }).error ?? r.statusText });
        return;
      }
      setCheck(j);
    } catch (e) {
      setCheck({
        checkSupported: false,
        error: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setCheckLoading(false);
    }
  }, []);

  const runDeploy = useCallback(async (options?: { buildFallback?: boolean }) => {
    setDeploying(true);
    setDeployEvents([]);
    setDeployError(null);

    // Open system terminal filtered to deploy logs
    openWithSourceFilter('software-update');

    // Signal the overlay that an update is starting
    signalServerTransitionPending('update');

    try {
      const r = await fetch(`${API}/api/system/update/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildFallback: options?.buildFallback }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || !j.ok) {
        setDeployError(j.error ?? 'Failed to start deployment');
        setDeploying(false);
        return;
      }
      // Connect to SSE for progress
      connectSSE();
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Request failed');
      setDeploying(false);
    }
  }, [connectSSE]);

  const runRollback = useCallback(async () => {
    setDeploying(true);
    setDeployEvents([]);
    setDeployError(null);
    signalServerTransitionPending('update');

    try {
      const r = await fetch(`${API}/api/system/update/rollback`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setDeployError(j.error ?? 'Failed to start rollback');
        setDeploying(false);
        return;
      }
      connectSSE();
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Request failed');
      setDeploying(false);
    }
  }, [connectSSE]);

  if (!loading && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You need administrator access to manage software updates.
        </p>
        <Link href="/settings" className="mt-4 inline-block text-sm underline" style={{ color: 'var(--color-accent)' }}>
          Back to settings
        </Link>
      </div>
    );
  }

  const lastDeployEvent = deployEvents[deployEvents.length - 1];
  const deployDone = lastDeployEvent?.stage === 'done';
  const deployFailed = lastDeployEvent?.status === 'failed';
  const showProgress = deploying || deployEvents.length > 0;

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-6">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-bg-hover)]"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </Link>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Download className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Software update</h1>
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Compare the running containers against <span className="font-mono">origin/main</span>. Updates pull pre-built
        Docker images from the CI/CD pipeline and restart services.
      </p>

      {/* Deployment progress panel */}
      {showProgress && (
        <Card className="p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            {deploying ? (
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
            ) : deployFailed ? (
              <XCircle className="h-5 w-5" style={{ color: 'var(--color-danger)' }} />
            ) : (
              <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--color-success)' }} />
            )}
            <h2 className="text-sm font-semibold">
              {deploying
                ? 'Deploying...'
                : deployFailed
                  ? 'Deployment failed'
                  : 'Deployment complete'}
            </h2>
          </div>
          <DeployProgress events={deployEvents} isConnected={sseConnected} />

          {/* Post-deploy actions */}
          {deployDone && !deploying && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {deployFailed && (
                <button
                  type="button"
                  onClick={() => void runRollback()}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                    borderColor: 'var(--color-danger)',
                    color: 'var(--color-danger)',
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Rollback to previous version
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDeployEvents([]);
                  setDeploying(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Check for updates panel */}
      <Card className="p-4 mb-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checkLoading || deploying}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {checkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check for updates
          </button>
        </div>

        {check?.error && (
          <div
            className="flex gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
              color: 'var(--color-danger)',
            }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap break-words min-w-0">{check.error}</span>
          </div>
        )}

        {check && check.checkSupported === false && !check.error && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {check.reason ?? 'Update checks are not available on this server.'}
          </p>
        )}

        {check?.checkSupported && (
          <div className="space-y-4 text-sm">
            <DeployRefBlock title="Running" info={check.running} shaFallback={check.currentSha} />
            <DeployRefBlock title="origin/main" info={check.remote} shaFallback={check.remoteSha} />

            {!check.updateAvailable ? (
              <>
                <p style={{ color: 'var(--color-success)' }}>
                  You are up to date.
                </p>
                {check.containerVersionKnown === false && (
                  <div
                    className="flex gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)',
                      color: 'var(--color-warning, #f59e0b)',
                    }}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      The running container version could not be verified (pre-CI build).
                      If you recently pushed new code, click <strong>Rebuild containers</strong> to apply it.
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runDeploy({ buildFallback: true })}
                    disabled={deploying}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'rgba(234, 88, 12, 0.2)',
                      borderColor: 'var(--color-accent)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Rebuild containers
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--color-text)' }}>New commits on the server&apos;s remote branch:</p>
                <ul
                  className="space-y-2 border rounded-lg p-3 max-h-72 overflow-auto"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {(check.commits ?? []).map((c) => (
                    <li key={c.hash} className="text-xs leading-snug">
                      <div className="font-mono text-[11px] opacity-80">{c.hash.slice(0, 7)}</div>
                      <div style={{ color: 'var(--color-text)' }}>{c.subject}</div>
                      <div style={{ color: 'var(--color-text-muted)' }}>{formatCommitDate(c.date)}</div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void runDeploy()}
                  disabled={deploying}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'rgba(234, 88, 12, 0.2)',
                    borderColor: 'var(--color-accent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Install update
                </button>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Pulls pre-built Docker images from CI/CD and restarts services. Progress streams in real time above.
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      {deployError && (
        <div
          className="flex gap-2 rounded-lg px-3 py-2 text-sm mb-4"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{deployError}</span>
        </div>
      )}
    </div>
  );
}
