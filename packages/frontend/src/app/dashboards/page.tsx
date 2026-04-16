'use client';

// ---------------------------------------------------------------------------
// Dashboards list page — pick one to view, edit, or create a new one.
// Admin-only actions (create/delete) are gated at the backend; this page just
// shows/hides the buttons based on the session.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import { LayoutDashboard, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
} from '@/lib/api-dashboards';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton, GhostIconButton } from '@/components/ui/Button';
import { SettingsRow, SettingsRowGroup } from '@/components/ui/SettingsRow';

export default function DashboardsListPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [docs, setDocs] = useState<DashboardDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    listDashboards()
      .then((d) => setDocs(d))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    const path = window.prompt('Path (kebab-case, e.g. "garage"):')?.trim();
    if (!path) return;
    const title = window.prompt('Title:', path)?.trim() ?? path;
    try {
      const doc = await createDashboard({
        path,
        title,
        layout: { type: 'sections', maxColumns: 3, dense: false },
        sections: [{ id: 'main', title: 'Main', cards: [] }],
        cards: [],
        hiddenFromSidebar: false,
      });
      router.push(`/dashboards/${doc.path}/edit`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (doc: DashboardDoc) => {
    if (!window.confirm(`Delete dashboard "${doc.title}"?`)) return;
    try {
      await deleteDashboard(doc.path);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboards"
        subtitle="View and manage dashboards"
        actions={
          isAdmin ? (
            <PrimaryButton icon={Plus} onClick={handleCreate}>
              New dashboard
            </PrimaryButton>
          ) : null
        }
      />

      {error && (
        <div
          className="mb-3 rounded-[var(--radius)] p-3 text-sm"
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
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No dashboards yet.
        </p>
      ) : (
        <SettingsRowGroup>
          {docs.map((d) => (
            <SettingsRow
              key={d.id}
              icon={LayoutDashboard}
              label={d.title}
              description={`/${d.path} · rev ${d.revision} · ${d.owner.kind}`}
              onClick={() => router.push(`/dashboards/${d.path}`)}
              hideChevron={isAdmin}
              extras={
                isAdmin ? (
                  <>
                    <GhostIconButton
                      icon={Pencil}
                      aria-label={`Edit ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboards/${d.path}/edit`);
                      }}
                    />
                    <GhostIconButton
                      icon={Trash2}
                      tone="danger"
                      aria-label={`Delete ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(d);
                      }}
                    />
                  </>
                ) : null
              }
            />
          ))}
        </SettingsRowGroup>
      )}
    </div>
  );
}
