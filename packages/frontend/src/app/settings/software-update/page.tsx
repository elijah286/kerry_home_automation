'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import { getApiBase } from '@/lib/api-base';
import { APP_VERSION_LABEL } from '@/lib/appVersion';

const API = getApiBase();

interface CommitRow {
  hash: string;
  subject: string;
  date: string;
}

interface CheckResponse {
  checkSupported: boolean;
  reason?: string;
  updateAvailable?: boolean;
  currentSha?: string;
  remoteSha?: string;
  commits?: CommitRow[];
  error?: string;
}

function formatCommitDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function SoftwareUpdatePage() {
  const { isAdmin, loading } = useAuth();
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setCheckLoading(true);
    setApplyMessage(null);
    setApplyError(null);
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

  const runApply = useCallback(async () => {
    setApplyLoading(true);
    setApplyMessage(null);
    setApplyError(null);
    try {
      const r = await fetch(`${API}/api/system/update/apply`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (r.status === 202 && j.message) {
        setApplyMessage(j.message);
        return;
      }
      setApplyError(j.error ?? r.statusText);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setApplyLoading(false);
    }
  }, []);

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
        UI build <span className="font-mono tabular-nums">{APP_VERSION_LABEL}</span>. Updates load new code on the server
        and restart containers — use when you are ready, not on a fixed schedule.
      </p>

      <Card className="p-4 mb-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checkLoading}
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
            <span>{check.error}</span>
          </div>
        )}

        {check && check.checkSupported === false && !check.error && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {check.reason ?? 'Update checks are not available on this server.'}
          </p>
        )}

        {check?.checkSupported && (
          <div className="space-y-3 text-sm">
            <div style={{ color: 'var(--color-text-secondary)' }}>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                Running:{' '}
              </span>
              <code className="text-xs break-all">{check.currentSha?.slice(0, 12) ?? '—'}</code>
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                origin/main:{' '}
              </span>
              <code className="text-xs break-all">{check.remoteSha?.slice(0, 12) ?? '—'}</code>
            </div>

            {!check.updateAvailable ? (
              <p style={{ color: 'var(--color-success)' }}>You are up to date with origin/main.</p>
            ) : (
              <>
                <p style={{ color: 'var(--color-text)' }}>New commits on the server&apos;s remote branch:</p>
                <ul className="space-y-2 border rounded-lg p-3 max-h-72 overflow-auto" style={{ borderColor: 'var(--color-border)' }}>
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
                  onClick={() => void runApply()}
                  disabled={applyLoading}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'rgba(234, 88, 12, 0.2)',
                    borderColor: 'var(--color-accent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Install update now
                </button>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Runs the same script as a manual server deploy (`scripts/update.sh`): pull, rebuild containers, and
                  health checks. The page may disconnect briefly.
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      {applyMessage && (
        <p className="text-sm mb-2" style={{ color: 'var(--color-success)' }}>
          {applyMessage}
        </p>
      )}
      {applyError && (
        <p className="text-sm mb-2" style={{ color: 'var(--color-danger)' }}>
          {applyError}
        </p>
      )}
    </div>
  );
}
