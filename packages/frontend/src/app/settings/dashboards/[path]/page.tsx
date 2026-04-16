'use client';

// ---------------------------------------------------------------------------
// Settings → Dashboards → [path]
//
// Edit visibility and sidebar flag for a single dashboard. Leaves the dashboard
// content (cards, layout) untouched — for that, use the dashboard editor at
// /dashboards/[path]/edit.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Save, Pencil } from 'lucide-react';
import type { DashboardDoc, User, UserRole, PermissionQuery } from '@ha/shared';
import { USER_ROLES } from '@ha/shared';
import { loadDashboard, updateDashboard } from '@/lib/api-dashboards';
import { getApiBase, apiFetch } from '@/lib/api-base';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Button';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  parent: 'Parent',
  user: 'User',
  kiosk: 'Kiosk',
  child: 'Child',
};

function emptyQuery(): PermissionQuery {
  return {};
}

function hasAnyRestriction(q: PermissionQuery | undefined): boolean {
  if (!q) return false;
  return Boolean(q.roles?.length || q.userIds?.length || q.permissions?.length || q.requiresElevation);
}

export default function DashboardAccessPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = use(params);
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();

  const [doc, setDoc] = useState<DashboardDoc | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state (derived from doc on load)
  const [mode, setMode] = useState<'everyone' | 'restricted'>('everyone');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [requiresElevation, setRequiresElevation] = useState(false);
  const [hiddenFromSidebar, setHiddenFromSidebar] = useState(false);

  const hydrateForm = (d: DashboardDoc) => {
    const v = d.visibility;
    setMode(hasAnyRestriction(v) ? 'restricted' : 'everyone');
    setSelectedRoles(v?.roles ?? []);
    setSelectedUserIds(v?.userIds ?? []);
    setRequiresElevation(v?.requiresElevation ?? false);
    setHiddenFromSidebar(d.hiddenFromSidebar ?? false);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, uResp] = await Promise.all([
        loadDashboard(path),
        apiFetch(`${getApiBase()}/api/users`).then((r) => r.json() as Promise<{ users: User[] }>),
      ]);
      setDoc(d);
      hydrateForm(d);
      setUsers(uResp.users ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!authLoading && isAdmin) void loadAll();
  }, [authLoading, isAdmin, loadAll]);

  const toggleRole = (role: UserRole) => {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };
  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  };

  const buildVisibility = (): PermissionQuery | undefined => {
    if (mode === 'everyone') return undefined;
    const q: PermissionQuery = emptyQuery();
    if (selectedRoles.length) q.roles = selectedRoles;
    if (selectedUserIds.length) q.userIds = selectedUserIds;
    if (requiresElevation) q.requiresElevation = true;
    return hasAnyRestriction(q) ? q : undefined;
  };

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDashboard(doc.path, {
        visibility: buildVisibility(),
        hiddenFromSidebar,
        expectedRevision: doc.revision,
      });
      setDoc(updated);
      hydrateForm(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
        title={doc?.title ?? path}
        subtitle={`/dashboards/${path}`}
        back="/settings/dashboards"
        actions={
          <SecondaryButton
            icon={Pencil}
            onClick={() => router.push(`/dashboards/${path}/edit`)}
          >
            Edit layout
          </SecondaryButton>
        }
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

      {loading || !doc ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Sidebar visibility */}
          <section
            className="rounded-[var(--radius)] border p-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
          >
            <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Sidebar
            </h2>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={!hiddenFromSidebar}
                onChange={(e) => setHiddenFromSidebar(!e.target.checked)}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Show this dashboard in the sidebar
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  When off, the dashboard is still reachable at its URL but is omitted from navigation.
                </p>
              </div>
            </label>
          </section>

          {/* Access control */}
          <section
            className="rounded-[var(--radius)] border p-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
          >
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Who can access
            </h2>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {(['everyone', 'restricted'] as const).map((m) => {
                const selected = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      background: selected ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                      color: selected ? '#fff' : 'var(--color-text)',
                      border: '1px solid',
                      borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
                    }}
                  >
                    {m === 'everyone' ? 'Everyone' : 'Restricted'}
                  </button>
                );
              })}
            </div>

            {mode === 'restricted' && (
              <div className="space-y-4">
                {/* Roles */}
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    By role (any)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {USER_ROLES.map((role) => {
                      const active = selectedRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRole(role)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{
                            background: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                            color: active ? '#fff' : 'var(--color-text)',
                            border: '1px solid',
                            borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                          }}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Users */}
                {users.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      By specific user
                    </p>
                    <div className="space-y-1">
                      {users.map((u) => {
                        const active = selectedUserIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleUser(u.id)}
                              className="h-4 w-4"
                            />
                            <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                              {u.displayName}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              @{u.username} · {u.role}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Elevation */}
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={requiresElevation}
                    onChange={(e) => setRequiresElevation(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      Require PIN elevation
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Users must enter their elevation PIN each session before viewing.
                    </p>
                  </div>
                </label>

                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Leave everything unchecked to match no-one (effectively admin-only, since admins always see all dashboards).
                </p>
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <Link href="/settings/dashboards">
              <SecondaryButton>Cancel</SecondaryButton>
            </Link>
            <PrimaryButton
              icon={Save}
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
