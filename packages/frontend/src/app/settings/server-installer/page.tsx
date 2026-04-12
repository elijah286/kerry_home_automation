'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import {
  HardDrive, ArrowLeft, Loader2, Download, ShieldAlert,
  CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface ProgressEvent {
  percent: number;
  message: string;
  status: 'running' | 'complete' | 'failed';
}

type Phase = 'idle' | 'building' | 'complete' | 'failed';

const inputStyle = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
};

export default function ServerInstallerPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [hostname, setHostname] = useState('home-automation');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [formError, setFormError] = useState('');

  const esRef = useRef<EventSource | null>(null);

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

      const data = await res.json() as { jobId: string };
      setJobId(data.jobId);
      setProgress(0);
      setStatusMessage('Starting ISO build...');
      setPhase('building');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadIso = () => {
    if (!jobId) return;
    const a = document.createElement('a');
    a.href = `${API_BASE}/api/installer/download/${jobId}`;
    a.download = 'ha-server-installer.iso';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const reset = () => {
    esRef.current?.close();
    setPhase('idle');
    setJobId(null);
    setProgress(0);
    setStatusMessage('');
    setErrorMessage('');
    setPassword('');
    setConfirmPassword('');
    setFormError('');
  };

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
              onClick={downloadIso}
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

          <p className="text-xs mb-4" style={{ color: 'var(--color-danger)' }}>
            {errorMessage || 'An unknown error occurred during ISO generation.'}
          </p>

          {errorMessage.includes('xorriso') && (
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Make sure <code className="font-mono">xorriso</code> is installed on the server:{' '}
              <code className="font-mono">sudo apt install xorriso</code>
            </p>
          )}

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
    </div>
  );
}
