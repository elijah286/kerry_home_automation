'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Loader2 } from 'lucide-react';
import { isRemoteAccess } from '@/lib/api-base';

/**
 * Remote-only banner shown when the Railway proxy can't reach the home hub
 * via the tunnel. Without this the UI just silently shows empty state (0
 * devices, no cameras, etc.) and the user can't tell the hub is offline vs.
 * a genuinely empty install.
 *
 * The proxy's `/api/health` always returns 200 regardless of tunnel state —
 * the state lives in the response body (`tunnel: 'connected' | 'disconnected'`).
 * On LAN this banner never mounts: the frontend talks to the backend directly
 * and `/api/health` comes straight from Fastify (no tunnel concept).
 */

const POLL_INTERVAL_MS = 5_000;

type TunnelState = 'unknown' | 'connected' | 'disconnected';

export function TunnelStatusBanner() {
  const [state, setState] = useState<TunnelState>('unknown');

  useEffect(() => {
    if (!isRemoteAccess()) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setState('disconnected');
          return;
        }
        const data = (await res.json()) as { tunnel?: string };
        if (cancelled) return;
        setState(data.tunnel === 'connected' ? 'connected' : 'disconnected');
      } catch {
        if (!cancelled) setState('disconnected');
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (state !== 'disconnected') return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-amber-600/95 text-white shadow-lg backdrop-blur">
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span>Home hub is offline.</span>
        <span className="inline-flex items-center gap-1 text-amber-100/90">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reconnecting…
        </span>
      </div>
    </div>
  );
}
