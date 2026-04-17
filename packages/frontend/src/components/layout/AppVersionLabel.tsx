'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { getApiBase } from '@/lib/api-base';

const VERSION_HREF = '/settings/software-update';

function appVersionFetchUrls(): string[] {
  if (Capacitor.isNativePlatform()) {
    const b = getApiBase().replace(/\/$/, '');
    return b ? [`${b}/api/system/app-version`] : [];
  }
  const urls: string[] = [];
  // Same origin as the page (Next rewrites `/api` → backend) — works behind nginx :80 and avoids http(s) → :3000 issues.
  urls.push('/api/system/app-version');
  const b = getApiBase().replace(/\/$/, '');
  if (b) urls.push(`${b}/api/system/app-version`);
  return urls;
}

export function AppVersionLabel({
  variant = 'default',
  lcarsTextColor,
}: {
  variant?: 'default' | 'lcars';
  lcarsTextColor?: string;
}) {
  const [label, setLabel] = useState(APP_VERSION_LABEL);

  useEffect(() => {
    let cancelled = false;

    const fetchVersion = async () => {
      for (const url of appVersionFetchUrls()) {
        try {
          const r = await fetch(url, { cache: 'no-store' });
          if (!r.ok) continue;
          const j = (await r.json()) as { versionLabel?: string };
          if (!cancelled && j.versionLabel) {
            setLabel(j.versionLabel);
            return;
          }
        } catch {
          /* try next */
        }
      }
    };

    // Initial fetch, then poll every 60s so the header stays in sync with what the backend actually reports.
    void fetchVersion();
    const id = window.setInterval(() => void fetchVersion(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (variant === 'lcars') {
    return (
      <Link
        href={VERSION_HREF}
        className="shrink-0 rounded-sm outline-none ring-offset-2 ring-offset-black transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{
          color: lcarsTextColor,
          fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.08em',
          opacity: 0.88,
        }}
        title="Software update"
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={VERSION_HREF}
      className="shrink-0 text-[11px] tabular-nums tracking-tight text-[var(--color-text-muted)] underline-offset-2 transition-colors hover:text-[var(--color-text)] hover:underline"
      title="Software update"
    >
      {label}
    </Link>
  );
}
