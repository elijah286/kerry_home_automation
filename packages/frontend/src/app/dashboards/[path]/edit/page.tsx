'use client';

// ---------------------------------------------------------------------------
// /dashboards/[path]/edit — admin-gated dashboard editor route.
// Loads the dashboard once, then hands the draft to <DashboardEditor>.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import { loadDashboard } from '@/lib/api-dashboards';
import { DashboardEditor } from '@/components/dashboard/DashboardEditor';
import { useAuth } from '@/providers/AuthProvider';
import { token } from '@/lib/tokens';

export default function DashboardEditPage() {
  const { path } = useParams<{ path: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [doc, setDoc] = useState<DashboardDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null); setError(null);
    loadDashboard(path)
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [path]);

  if (user && user.role !== 'admin') {
    return (
      <div className="p-6 text-sm" style={{ color: token('--color-danger') }}>
        Only administrators can edit dashboards.
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-lg p-4 text-sm"
          style={{
            background: token('--color-bg-card'),
            color: token('--color-danger'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          Failed to load &quot;{path}&quot;: {error}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 text-sm" style={{ color: token('--color-text-muted') }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-4 lg:px-6">
        <button
          type="button"
          onClick={() => router.push(`/dashboards/${doc.path}`)}
          className="text-xs underline"
          style={{ color: token('--color-text-muted') }}
        >
          ← Back to dashboard
        </button>
      </div>
      <DashboardEditor
        initialDoc={doc}
        onSaved={(saved) => {
          // Navigate back to the live view once a save lands — the editor has
          // already swapped in the new revision so the save button disables.
          void saved;
        }}
      />
    </div>
  );
}
