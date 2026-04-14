'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBase } from '@/lib/api-base';
import {
  clearServerTransitionPending,
  readServerTransitionPending,
  type ServerTransitionKind,
} from '@/lib/server-transition';
import { Loader2 } from 'lucide-react';

const INTERVAL_MS = 4000;
const INTERVAL_MS_URGENT = 2000;
/** Consecutive failed health polls before showing overlay when no deploy signal (avoids flapping). */
const FAIL_THRESHOLD = 5;
/** Faster overlay during a known deploy (nginx flag) while API is still down. */
const FAIL_THRESHOLD_URGENT = 1;
const OK_THRESHOLD = 2;

/** Same host, default HTTP(S) port — used to read nginx maintenance JSON from :3001 UI. */
function getHostDefaultOrigin(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.protocol}//${window.location.hostname}`;
}

/**
 * Full-screen notice while the server is updating, rebooting, or the API is unreachable.
 * - User-initiated reboot: session flag shows overlay immediately; polls until /api/health is OK.
 * - Polls port 80 /ha-update-status.json (written by scripts/update.sh) for an early deploy signal.
 * - Always polls /api/health. If health is OK repeatedly, the overlay clears even when
 *   ha-update-status.json is stale (script crashed before removing it).
 * - Without the nginx flag, requires several consecutive health failures before showing
 *   (avoids flashing on brief network blips).
 */
export function UpdateInProgressOverlay() {
  const [forcedKind, setForcedKind] = useState<ServerTransitionKind | null>(null);
  const [passiveVisible, setPassiveVisible] = useState(false);
  const failRef = useRef(0);
  const okRef = useRef(0);
  const forcedKindRef = useRef<ServerTransitionKind | null>(null);

  useEffect(() => {
    forcedKindRef.current = forcedKind;
  }, [forcedKind]);

  useEffect(() => {
    const k = readServerTransitionPending();
    if (k) setForcedKind(k);
  }, []);

  useEffect(() => {
    const onPending = (e: Event) => {
      const ce = e as CustomEvent<{ kind: ServerTransitionKind }>;
      const kind = ce.detail?.kind ?? 'reboot';
      setForcedKind(kind);
    };
    window.addEventListener('ha-server-transition-pending', onPending);
    return () => window.removeEventListener('ha-server-transition-pending', onPending);
  }, []);

  useEffect(() => {
    const shouldPoll = process.env.NODE_ENV === 'production' || forcedKind !== null;
    if (!shouldPoll) return;

    let cancelled = false;
    const urgent = forcedKind !== null;

    const tick = async () => {
      const api = getApiBase();
      const hostOrigin = getHostDefaultOrigin();

      let nginxUpdating = false;
      if (process.env.NODE_ENV === 'production') {
        try {
          const r = await fetch(`${hostOrigin}/ha-update-status.json`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(2800),
          });
          if (r.ok) {
            const j: unknown = await r.json();
            nginxUpdating =
              typeof j === 'object' && j !== null && (j as { updating?: boolean }).updating === true;
          }
        } catch {
          // No nginx on :80 or file missing — rely on health only.
        }
      }

      if (cancelled) return;

      let healthOk = false;
      try {
        const r = await fetch(`${api}/api/health`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        healthOk = r.ok;
      } catch {
        healthOk = false;
      }

      if (cancelled) return;

      if (healthOk) {
        failRef.current = 0;
        okRef.current += 1;
        if (okRef.current >= OK_THRESHOLD) {
          if (forcedKindRef.current) {
            clearServerTransitionPending();
            forcedKindRef.current = null;
            setForcedKind(null);
          }
          setPassiveVisible(false);
        }
        return;
      }

      okRef.current = 0;
      if (forcedKindRef.current) {
        return;
      }
      failRef.current += 1;
      if (process.env.NODE_ENV === 'production') {
        const needFails = nginxUpdating ? FAIL_THRESHOLD_URGENT : FAIL_THRESHOLD;
        if (failRef.current >= needFails) setPassiveVisible(true);
      }
    };

    void tick();
    const intervalMs = urgent ? INTERVAL_MS_URGENT : INTERVAL_MS;
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [forcedKind]);

  const visible = forcedKind !== null || passiveVisible;
  if (!visible) return null;

  const title =
    forcedKind === 'reboot' ? 'Server restarting' : 'Software update in progress';
  const body =
    forcedKind === 'reboot'
      ? 'The hub is rebooting. This page will clear when the API is healthy again.'
      : 'The system is restarting services. This page will clear when the API is healthy again.';

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{
        backgroundColor: 'rgba(10, 14, 20, 0.96)',
        color: 'var(--color-text)',
        borderTop: '3px solid var(--color-accent)',
      }}
      role="alert"
      aria-live="polite"
    >
      <Loader2 className="h-10 w-10 animate-spin shrink-0" style={{ color: 'var(--color-accent)' }} />
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold tracking-wide" style={{ color: 'var(--color-accent)' }}>
          {title}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {body}
        </p>
      </div>
    </div>
  );
}
