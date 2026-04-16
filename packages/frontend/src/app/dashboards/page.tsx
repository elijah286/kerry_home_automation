'use client';

// ---------------------------------------------------------------------------
// Dashboards list page — pick one to view, edit, or create a new one.
// Admin-only actions (create/delete) are gated at the backend; this page just
// shows/hides the buttons based on the session.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
} from '@/lib/api-dashboards';
import { useAuth } from '@/providers/AuthProvider';
import { token } from '@/lib/tokens';

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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: token('--color-text') }}>
          Dashboards
        </h1>
        {isAdmin && (
          <button
            type="button"
            onClick={handleCreate}
            className="rounded px-3 py-1 text-sm"
            style={{
              background: token('--color-accent'),
              color: token('--color-bg'),
            }}
          >
            New dashboard
          </button>
        )}
      </div>

      {error && (
        <div
          className="mb-3 rounded p-3 text-sm"
          style={{
            background: token('--color-bg-card'),
            color: token('--color-danger'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: token('--color-text-muted') }}>Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm" style={{ color: token('--color-text-muted') }}>
          No dashboards yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded p-3"
              style={{
                background: token('--color-bg-card'),
                border: `1px solid ${token('--color-border')}`,
              }}
            >
              <div className="flex-1">
                <a
                  href={`/dashboards/${d.path}`}
                  className="font-medium"
                  style={{ color: token('--color-text') }}
                >
                  {d.title}
                </a>
                <p className="text-xs" style={{ color: token('--color-text-muted') }}>
                  /{d.path} · rev {d.revision} · {d.owner.kind}
                </p>
              </div>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboards/${d.path}/edit`)}
                    className="rounded px-2 py-1 text-xs"
                    style={{
                      background: token('--color-bg-secondary'),
                      color: token('--color-text'),
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className="rounded px-2 py-1 text-xs"
                    style={{
                      background: token('--color-bg-secondary'),
                      color: token('--color-danger'),
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
