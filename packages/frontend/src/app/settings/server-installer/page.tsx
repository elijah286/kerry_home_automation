'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import {
  HardDrive, ArrowLeft, Loader2, Download, ShieldAlert,
  CheckCircle2, XCircle, RefreshCw, Ban,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

/** Survives client-side navigation, refresh, and new tabs on the same origin. */
const JOB_STORAGE_KEY = 'ha-server-installer-job-id';

function persistInstallerJobId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(JOB_STORAGE_KEY, id);
  else localStorage.removeItem(JOB_STORAGE_KEY);
}

interface ProgressEvent {
  percent: number;
  message: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
}

interface StatusResponse {
  status: string;
  progress: number;
  message: string;
}

type Phase = 'idle' | 'building' | 'complete' | 'failed' | 'cancelled';

interface InstallerArtifact {
  jobId: string;
  hostname: string | null;
  adminUsername: string | null;
  createdAt: string;
  completedAt: string | null;
  sizeBytes: number;
  fileAvailable: boolean;
}

function formatBytes(n: number): string {
  if (n <= 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
  return `${(n / k ** i).toFixed(i > 1 ? 2 : 0)} ${sizes[i]}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const inputStyle = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
};

export default function ServerInstallerPage() {
  const [restoring, setRestoring] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachedToExistingRun, setAttachedToExistingRun] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [buildActionError, setBuildActionError] = useState('');
  const [artifacts, setArtifacts] = useState<InstallerArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);

  // Form fields
  const [hostname, setHostname] = useState('home-automation');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [formError, setFormError] = useState('');

  const esRef = useRef<EventSource | null>(null);

  const fetchArtifacts = useCallback(async () => {
    setArtifactsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/installer/artifacts`, { credentials: 'include' });
      if (!r.ok) return;
      const data = (await r.json()) as { items: InstallerArtifact[] };
      setArtifacts(data.items ?? []);
    } catch {
      setArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  }, []);

  // Restore job from localStorage or attach to the server singleton if still running
  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        let id: string | null = localStorage.getItem(JOB_STORAGE_KEY);
        if (!id) {
          const r = await fetch(`${API_BASE}/api/installer/active`, { credentials: 'include' });
          if (r.ok) {
            const a = await r.json() as { active: boolean; jobId?: string };
            if (a.active && a.jobId) id = a.jobId;
          }
        }
        if (!id) return;

        const st = await fetch(`${API_BASE}/api/installer/status/${id}`, { credentials: 'include' });
        if (!st.ok) {
          persistInstallerJobId(null);
          return;
        }
        const data = (await st.json()) as StatusResponse;
        if (cancelled) return;

        setJobId(id);
        persistInstallerJobId(id);
        setProgress(data.progress);
        setStatusMessage(data.message || '');
        if (data.status === 'running') {
          setPhase('building');
        } else if (data.status === 'complete') {
          setProgress(100);
          setStatusMessage('ISO ready for download');
          setPhase('complete');
        } else if (data.status === 'failed') {
          setErrorMessage(data.message || 'ISO build failed');
          setPhase('failed');
        } else if (data.status === 'cancelled') {
          setStatusMessage(data.message || 'Cancelled');
          setPhase('cancelled');
        } else {
          persistInstallerJobId(null);
        }
      } catch {
        persistInstallerJobId(null);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (restoring) return;
    void fetchArtifacts();
  }, [restoring, fetchArtifacts]);

  useEffect(() => {
    if (phase === 'complete') void fetchArtifacts();
  }, [phase, fetchArtifacts]);

  // SSE subscription when building
  useEffect(() => {
    if (phase !== 'building' || !jobId) return;

    const es = new EventSource(`${API_BASE}/api/installer/progress/${jobId}`, {
      withCredentials: true,
    });
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ProgressEvent;
      setProgress(event.percent);
      setStatusMessage(event.message);
      if (event.status === 'complete') {
        setPhase('complete');
        es.close();
      } else if (event.status === 'failed') {
        setErrorMessage(event.message);
        setPhase('failed');
        es.close();
      } else if (event.status === 'cancelled') {
        setStatusMessage(event.message || 'Cancelled');
        setPhase('cancelled');
        es.close();
      }
    };

    es.onerror = () => {
      // SSE connection dropped — poll once to check if already finished
      fetch(`${API_BASE}/api/installer/status/${jobId}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data: ProgressEvent & { status: string }) => {
          if (data.status === 'complete') {
            setProgress(100);
            setStatusMessage('ISO ready for download');
            setPhase('complete');
            es.close();
          } else if (data.status === 'failed') {
            setErrorMessage(data.message);
            setPhase('failed');
            es.close();
          } else if (data.status === 'cancelled') {
            setStatusMessage(data.message || 'Cancelled');
            setPhase('cancelled');
            es.close();
          }
        })
        .catch(() => { /* will retry via browser SSE reconnect */ });
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [phase, jobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/installer/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hostname, username, password, sshPublicKey: sshPublicKey || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to start build');
      }

      const data = await res.json() as { jobId: string; alreadyRunning?: boolean };
      setJobId(data.jobId);
      persistInstallerJobId(data.jobId);
      setAttachedToExistingRun(Boolean(data.alreadyRunning));
      if (data.alreadyRunning) {
        const st = await fetch(`${API_BASE}/api/installer/status/${data.jobId}`, { credentials: 'include' });
        if (st.ok) {
          const s = (await st.json()) as StatusResponse;
          setProgress(s.progress);
          setStatusMessage(s.message || 'Build in progress…');
        } else {
          setProgress(0);
          setStatusMessage('Reconnecting to build…');
        }
      } else {
        setProgress(0);
        setStatusMessage('Starting ISO build...');
      }
      setPhase('building');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadIso = (id: string) => {
    const a = document.createElement('a');
    a.href = `${API_BASE}/api/installer/download/${id}`;
    a.download = 'ha-server-installer.iso';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const cancelBuild = async () => {
    if (!jobId) return;
    setBuildActionError('');
    setCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/api/installer/cancel/${jobId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Could not cancel build');
      }
    } catch (err) {
      setBuildActionError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const reset = () => {
    esRef.current?.close();
    persistInstallerJobId(null);
    setAttachedToExistingRun(false);
    setBuildActionError('');
    setPhase('idle');
    setJobId(null);
    setProgress(0);
    setStatusMessage('');
    setErrorMessage('');
    setPassword('');
    setConfirmPassword('');
    setFormError('');
  };

  if (restoring) {
    return (
      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-1 rounded-lg hover:bg-[var(--color-bg-hover)]">
            <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          </Link>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
          >
            <HardDrive className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h1 className="text-lg font-semibold">Server Installer</h1>
        </div>
        <Card>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking installer status…
          </div>
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
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <HardDrive className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Server Installer</h1>
      </div>

      {/* Description */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Generate a bootable installer</h2>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Creates a custom Ubuntu 24.04 Server ISO pre-configured with Docker, this app, and your
          current production settings. Flash it to a USB drive, boot your server, and it installs
          itself automatically — no manual configuration needed.
        </p>
      </Card>

      {/* Security warning */}
      <Card>
        <div className="flex gap-3">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-warning, #f59e0b)' }} />
          <div>
            <p className="text-sm font-medium">Security notice</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              The generated ISO embeds your production API keys and secrets. Treat it like a
              password — store it securely and do not share it. Delete it after flashing to USB.
            </p>
          </div>
        </div>
      </Card>

      {/* Form — idle phase */}
      {phase === 'idle' && (
        <Card>
          <h2 className="text-sm font-medium mb-4">Server configuration</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Hostname
                </label>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="home-automation"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Admin username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Admin password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                SSH public key <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>
              </label>
              <textarea
                value={sshPublicKey}
                onChange={(e) => setSshPublicKey(e.target.value)}
                placeholder="ssh-rsa AAAA..."
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-xs font-mono outline-none resize-none"
                style={inputStyle}
              />
            </div>

            {formError && (
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{formError}</p>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Starting build...</>
                ) : (
                  <><HardDrive className="h-4 w-4" /> Create Installer ISO</>
                )}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Building phase */}
      {phase === 'building' && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-sm font-medium">Building installer ISO...</h2>
          </div>

          {attachedToExistingRun && (
            <p className="text-xs mb-3 rounded-lg px-2 py-1.5" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
              A build was already running on the server; this page is showing that job. Only one ISO build can run at a time.
            </p>
          )}

          <div
            className="w-full rounded-full h-2 overflow-hidden mb-2"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: 'var(--color-accent)' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {statusMessage || 'Working...'}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {progress}%
            </p>
          </div>

          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            This can take several minutes. The first run downloads the Ubuntu ISO (~1.6 GB).
            Subsequent builds use the cached copy and are much faster.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cancelBuild}
              disabled={cancelling}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel build'}
            </button>
            {buildActionError && (
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{buildActionError}</p>
            )}
          </div>
        </Card>
      )}

      {/* Cancelled phase */}
      {phase === 'cancelled' && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Ban className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
            <h2 className="text-sm font-medium">Build cancelled</h2>
          </div>

          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            {statusMessage || 'The installer build was stopped. You can start a new build when you are ready.'}
          </p>

          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Start over
          </button>
        </Card>
      )}

      {/* Complete phase */}
      {phase === 'complete' && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
            <h2 className="text-sm font-medium">ISO ready</h2>
          </div>

          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Your installer ISO has been generated. Flash it to a USB drive with Balena Etcher or
            Rufus, boot your server from it, and it will install automatically.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => jobId && downloadIso(jobId)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              <Download className="h-4 w-4" />
              Download ISO
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Build another
            </button>
          </div>
        </Card>
      )}

      {/* Failed phase */}
      {phase === 'failed' && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4" style={{ color: 'var(--color-danger)' }} />
            <h2 className="text-sm font-medium">Build failed</h2>
          </div>

          <p
            className="text-xs mb-4 normal-case"
            style={{ color: 'var(--color-danger)' }}
          >
            {errorMessage || 'An unknown error occurred during ISO generation.'}
          </p>

          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </Card>
      )}

      {/* Completed ISOs — persistent downloads */}
      <Card>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-medium">Saved installer ISOs</h2>
          <button
            type="button"
            onClick={() => void fetchArtifacts()}
            disabled={artifactsLoading}
            className="text-xs font-medium rounded-md px-2 py-1 border disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Refresh
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Finished builds stay on the server so you can download again later. Sizes and timestamps reflect each build.
        </p>

        {artifactsLoading && artifacts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : artifacts.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No completed installers yet. When a build finishes, it will appear here with a download link.
          </p>
        ) : (
          <ul className="space-y-3">
            {artifacts.map((a) => (
              <li
                key={a.jobId}
                className="rounded-lg border p-3 text-xs"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
                      {a.hostname || 'Installer ISO'}
                      {a.adminUsername ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>{' · '}{a.adminUsername}</span>
                      ) : null}
                    </p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      <div>
                        <dt className="inline opacity-80">Build started: </dt>
                        <dd className="inline">{formatDateTime(a.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="inline opacity-80">Completed: </dt>
                        <dd className="inline">{formatDateTime(a.completedAt)}</dd>
                      </div>
                      <div>
                        <dt className="inline opacity-80">Size: </dt>
                        <dd className="inline">{formatBytes(a.sizeBytes)}</dd>
                      </div>
                      <div className="font-mono text-[10px] sm:col-span-2 truncate" title={a.jobId}>
                        Job {a.jobId}
                      </div>
                    </dl>
                    {!a.fileAvailable && (
                      <p className="text-[11px] pt-1" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                        File is no longer on disk (removed or moved). Download is unavailable.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex sm:pt-0.5">
                    {a.fileAvailable ? (
                      <button
                        type="button"
                        onClick={() => downloadIso(a.jobId)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    ) : (
                      <span className="text-[11px] px-2 py-1 rounded-md border opacity-60" style={{ borderColor: 'var(--color-border)' }}>
                        Unavailable
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
