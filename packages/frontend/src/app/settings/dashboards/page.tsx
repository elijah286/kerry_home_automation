'use client';

// ---------------------------------------------------------------------------
// Settings → Dashboards
//
// Admin overview of every dashboard. Shows:
//   - Title, path, owner
//   - Visibility summary (everyone / role list / user list)
//   - Sidebar toggle (inline; flips `hiddenFromSidebar` and saves)
//
// Clicking a row opens /settings/dashboards/[path] for detailed access control.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, EyeOff, Eye, LayoutDashboard } from 'lucide-react';
import type { DashboardDoc } from '@ha/shared';
import { listDashboards, updateDashboard } from '@/lib/api-dashboards';
import { useAuth } from '@/providers/AuthProvider';

function visibilityLabel(doc: DashboardDoc): string {
  const v = doc.visibility;
  if (!v || (!v.roles?.length && !v.userIds?.length && !v.permissions?.length && !v.requiresElevation)) {
    return 'Everyone';
  }
  const parts: string[] = [];
  if (v.roles?.length) parts.push(`roles: ${v.roles.join(', ')}`);
  if (v.userIds?.length) parts.push(`${v.userIds.length} user${v.userIds.length === 1 ? '' : 's'}`);
  if (v.requiresElevation) parts.push('PIN required');
  return parts.join(' · ') || 'Restricted';
}

export default function DashboardsSettingsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [docs, setDocs] = useState<DashboardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingPath, setTogglingPath] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    listDashboards()
      .then(setDocs)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) refresh();
  }, [authLoading, isAdmin, refresh]);

  const handleToggleSidebar = async (doc: DashboardDoc) => {
    setTogglingPath(doc.path);
    try {
      const updated = await updateDashboard(doc.path, {
        hiddenFromSidebar: !doc.hiddenFromSidebar,
        expectedRevision: doc.revision,
      });
      setDocs((prev) => prev.map((d) => (d.path === updated.path ? updated : d)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTogglingPath(null);
    }
  };

  if (!authLoading && !isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-4 lg:p-6">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          This page is only available to admins.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/settings"
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
          aria-label="Back to settings"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <LayoutDashboard className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Dashboards</h1>
      </div>

      <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Control who can view each dashboard and whether it shows up in the sidebar. Click a row to edit access.
      </p>

      {error && (
        <div
          className="mb-4 rounded p-3 text-sm"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-danger)',
            border: '1px solid var(--color-border)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : docs.length === 0 ? (
        <div
          className="rounded-[var(--radius)] border p-8 text-center text-sm"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-card)',
            color: 'var(--color-text-muted)',
          }}
        >
          No dashboards yet. Create one from the{' '}
          <Link href="/dashboards" className="underline">
            Dashboards page
          </Link>
          .
        </div>
      ) : (
        <div
          className="rounded-[var(--radius)] border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
        >
          {docs.map((doc, i) => {
            const hidden = doc.hiddenFromSidebar ?? false;
            const isToggling = togglingPath === doc.path;
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-bg-hover)]"
                style={i < docs.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : undefined}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/settings/dashboards/${doc.path}`)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      /{doc.path} · {visibilityLabel(doc)}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleToggleSidebar(doc);
                  }}
                  disabled={isToggling}
                  title={hidden ? 'Hidden from sidebar — click to show' : 'Visible in sidebar — click to hide'}
                  className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-secondary)]"
                  style={{
                    color: hidden ? 'var(--color-text-muted)' : 'var(--color-accent)',
                    opacity: isToggling ? 0.4 : 1,
                  }}
                  aria-label={hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/settings/dashboards/${doc.path}`)}
                  className="shrink-0"
                  aria-label={`Edit ${doc.title}`}
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
