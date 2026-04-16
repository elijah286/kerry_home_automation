'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import { loadDashboard } from '@/lib/api-dashboards';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { useAuth } from '@/providers/AuthProvider';
import { token } from '@/lib/tokens';

export default function DashboardPage() {
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
          Failed to load dashboard &quot;{path}&quot;: {error}
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
      {user?.role === 'admin' && (
        <div className="flex justify-end px-4 pt-4 lg:px-6">
          <button
            type="button"
            onClick={() => router.push(`/dashboards/${doc.path}/edit`)}
            className="rounded px-3 py-1 text-xs"
            style={{
              background: token('--color-bg-secondary'),
              color: token('--color-text'),
              border: `1px solid ${token('--color-border')}`,
            }}
          >
            Edit
          </button>
        </div>
      )}
      <DashboardView
        doc={doc}
        handlers={{
          onNavigate: (p) => router.push(p),
          onMoreInfo: (entityId) => router.push(`/devices/${encodeURIComponent(entityId)}`),
        }}
      />
    </div>
  );
}
