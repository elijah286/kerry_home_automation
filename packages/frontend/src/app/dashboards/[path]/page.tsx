'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DashboardDoc } from '@ha/shared';
import { Pencil } from 'lucide-react';
import { loadDashboard } from '@/lib/api-dashboards';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { useAuth } from '@/providers/AuthProvider';
import { SecondaryButton } from '@/components/ui/Button';

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
          className="rounded-[var(--radius)] p-4 text-sm"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-danger)',
            border: '1px solid var(--color-border)',
          }}
        >
          Failed to load dashboard &quot;{path}&quot;: {error}
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
      {user?.role === 'admin' && (
        <div className="flex justify-end px-4 pt-4 lg:px-6">
          <SecondaryButton
            icon={Pencil}
            onClick={() => router.push(`/dashboards/${doc.path}/edit`)}
          >
            Edit
          </SecondaryButton>
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
