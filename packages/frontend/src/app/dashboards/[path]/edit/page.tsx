'use client';

// ---------------------------------------------------------------------------
// /dashboards/[path]/edit — admin-gated dashboard editor route.
// Loads the dashboard once, then hands the draft to <DashboardEditor>.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import { Pencil } from 'lucide-react';
import { loadDashboard } from '@/lib/api-dashboards';
import { DashboardEditor } from '@/components/dashboard/DashboardEditor';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';

export default function DashboardEditPage() {
  const { path } = useParams<{ path: string }>();
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
      <div className="p-6 text-sm" style={{ color: 'var(--color-danger)' }}>
        Only administrators can edit dashboards.
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-[var(--radius)] p-4 text-sm"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-danger)',
            border: '1px solid var(--color-border)',
          }}
        >
          Failed to load &quot;{path}&quot;: {error}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-4 lg:px-6">
        <PageHeader
          icon={Pencil}
          title={`Edit ${doc.title}`}
          subtitle={`/${doc.path} · rev ${doc.revision}`}
          back={`/dashboards/${doc.path}`}
        />
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
