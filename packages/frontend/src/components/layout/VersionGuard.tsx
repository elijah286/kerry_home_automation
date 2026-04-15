'use client';

import { useEffect, useRef } from 'react';
import { getApiBase } from '@/lib/api-base';
import { APP_VERSION_LABEL } from '@/lib/appVersion';

/**
 * Polls the backend's running version once per minute.
 * When the server comes back with a newer version (after a deploy/reboot)
 * the page auto-reloads so clients — especially unattended kiosks — always
 * run the latest frontend bundle without manual intervention.
 *
 * Only active in production to avoid dev-mode hot-reload conflicts.
 */

const POLL_INTERVAL_MS = 60_000;

export function VersionGuard() {
  const knownRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    const check = async () => {
      const api = getApiBase();
      try {
        const res = await fetch(`${api}/api/system/app-version`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { versionLabel?: string };
        if (cancelled || !data.versionLabel) return;

        const serverVersion = data.versionLabel;

        // First successful fetch — record what the server is running right now.
        if (knownRef.current === null) {
          knownRef.current = serverVersion;
          return;
        }

        // Server version changed since we first loaded (deploy happened).
        if (serverVersion !== knownRef.current) {
          // Also verify it differs from our bundle — avoids loops where
          // a reload lands on the same old cached bundle.
          if (serverVersion !== APP_VERSION_LABEL) {
            console.info(
              `[VersionGuard] Server updated: ${knownRef.current} → ${serverVersion} (bundle: ${APP_VERSION_LABEL}). Reloading.`,
            );
            window.location.reload();
          }
        }
      } catch {
        // Server down or network error — ignore; UpdateInProgressOverlay handles that case.
      }
    };

    void check();
    const id = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
