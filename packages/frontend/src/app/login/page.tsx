'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { getApiBase, isRemoteAccess } from '@/lib/api-base';
import { Loader2 } from 'lucide-react';

/** How often to poll /api/health while backend is down (ms). */
const POLL_MS = 3000;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const remote = typeof window !== 'undefined' && isRemoteAccess();

  // Backend reachability: null = checking (initial probe), true = reachable, false = offline
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const api = getApiBase();
      try {
        const r = await fetch(`${api}/api/health`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled) setBackendUp(r.ok);
      } catch {
        if (!cancelled) setBackendUp(false);
      }

      // Keep polling while backend is down (or on first check)
      if (!cancelled) {
        timerRef.current = setTimeout(probe, POLL_MS);
      }
    };

    void probe();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Still running the initial health probe — show a brief loading state
  if (backendUp === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
      </div>
    );
  }

  // Backend is down — show offline / upgrading screen instead of login form
  if (!backendUp) {
    const api = getApiBase();
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <Loader2 className="h-10 w-10 animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold tracking-wide" style={{ color: 'var(--color-accent)' }}>
            Hub unavailable
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            The hub at {api} is not responding. It may be starting up after an update or reboot.
            This screen will clear automatically when the system is ready.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-6"
        style={{ backgroundColor: 'var(--color-card-bg)', border: '1px solid var(--color-border)' }}
      >
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            HomeOS
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {remote ? 'Sign in with your remote access account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {remote ? 'Email' : 'Username'}
            </label>
            <input
              type={remote ? 'email' : 'text'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              autoFocus
              autoComplete={remote ? 'email' : 'username'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
