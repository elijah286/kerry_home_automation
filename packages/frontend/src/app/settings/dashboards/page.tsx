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
import { EyeOff, Eye, LayoutDashboard } from 'lucide-react';
import type { DashboardDoc } from '@ha/shared';
import { listDashboards, updateDashboard } from '@/lib/api-dashboards';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { SettingsRow, SettingsRowGroup } from '@/components/ui/SettingsRow';
import { GhostIconButton } from '@/components/ui/Button';

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
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboards"
        subtitle="Control who can view each dashboard and whether it shows up in the sidebar. Click a row to edit access."
        back="/settings"
      />

      {error && (
        <div
          className="mb-4 rounded-[var(--radius)] p-3 text-sm"
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
        <SettingsRowGroup>
          {docs.map((doc) => {
            const hidden = doc.hiddenFromSidebar ?? false;
            const isToggling = togglingPath === doc.path;
            return (
              <SettingsRow
                key={doc.id}
                icon={LayoutDashboard}
                label={doc.title}
                description={`/${doc.path} · ${visibilityLabel(doc)}`}
                onClick={() => router.push(`/settings/dashboards/${doc.path}`)}
                extras={
                  <GhostIconButton
                    icon={hidden ? EyeOff : Eye}
                    tone={hidden ? 'default' : 'accent'}
                    disabled={isToggling}
                    aria-label={hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                    title={hidden ? 'Hidden from sidebar — click to show' : 'Visible in sidebar — click to hide'}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggleSidebar(doc);
                    }}
                  />
                }
              />
            );
          })}
        </SettingsRowGroup>
      )}
    </div>
  );
}
