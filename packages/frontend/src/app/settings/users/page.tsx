'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import type { User, UserRole, UiColorMode, UiPreferencesAdminPatch } from '@ha/shared';
import { USER_ROLES, Permission, PERMISSION_LABELS } from '@ha/shared';
import { themes } from '@/lib/themes';
import {
  Users, Plus, Trash2, Shield, Monitor, UserIcon, Baby,
  Pencil, ArrowLeft, Loader2, Check, X, ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const ROLE_META: Record<UserRole, { label: string; icon: typeof Shield; description: string }> = {
  admin: { label: 'Admin', icon: Shield, description: 'Full access to everything' },
  user: { label: 'User', icon: UserIcon, description: 'Standard household member' },
  kiosk: { label: 'Kiosk', icon: Monitor, description: 'Wall panel / tablet display' },
  child: { label: 'Child', icon: Baby, description: 'Limited access for kids' },
};

const ALL_PERMISSIONS = Object.values(Permission);

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('user');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Permissions matrix state
  const [rolePermissions, setRolePermissions] = useState<Record<string, Permission[]>>({});
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsSaving, setPermissionsSaving] = useState<string | null>(null);

  const [adminColorMode, setAdminColorMode] = useState<string>('');
  const [adminTheme, setAdminTheme] = useState<string>('');
  const [adminFontSize, setAdminFontSize] = useState<string>('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { users: User[] };
        setUsers(data.users);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/role-permissions`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { roles: Record<string, Permission[]> };
        setRolePermissions(data.roles);
      }
    } catch { /* ignore */ }
    setPermissionsLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPermissions();
  }, [fetchUsers, fetchPermissions]);

  const resetForm = () => {
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormPin('');
    setFormRole('user');
    setFormError('');
    setShowCreate(false);
    setEditingUser(null);
    setAdminColorMode('');
    setAdminTheme('');
    setAdminFontSize('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: formUsername,
          displayName: formDisplayName,
          password: formPassword,
          pin: formPin,
          role: formRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to create user');
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = { displayName: formDisplayName, role: formRole };
      if (formPassword) body.password = formPassword;
      if (formPin) body.pin = formPin;

      const uiPreferencesAdmin: UiPreferencesAdminPatch = {};
      const prev = editingUser.uiPreferencesAdmin;
      if (adminColorMode) {
        uiPreferencesAdmin.colorMode = adminColorMode as UiColorMode;
      } else if (prev?.colorMode) {
        uiPreferencesAdmin.colorMode = null;
      }
      if (adminTheme) {
        uiPreferencesAdmin.activeTheme = adminTheme;
      } else if (prev?.activeTheme) {
        uiPreferencesAdmin.activeTheme = null;
      }
      if (adminFontSize) {
        uiPreferencesAdmin.fontSize = parseInt(adminFontSize, 10);
      } else if (prev?.fontSize != null) {
        uiPreferencesAdmin.fontSize = null;
      }
      if (Object.keys(uiPreferencesAdmin).length > 0) {
        body.uiPreferencesAdmin = uiPreferencesAdmin;
      }

      const res = await fetch(`${API_BASE}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to update user');
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await fetch(`${API_BASE}/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  const handleToggleEnabled = async (u: User) => {
    try {
      await fetch(`${API_BASE}/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !u.enabled }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  const startEdit = (u: User) => {
    setEditingUser(u);
    setFormDisplayName(u.displayName);
    setFormRole(u.role);
    setFormPassword('');
    setFormPin('');
    setFormError('');
    setShowCreate(false);
    const adm = u.uiPreferencesAdmin;
    setAdminColorMode(adm?.colorMode ?? '');
    setAdminTheme(adm?.activeTheme ?? '');
    setAdminFontSize(adm?.fontSize != null ? String(adm.fontSize) : '');
  };

  const clearAdminAppearanceOverrides = async () => {
    if (!editingUser) return;
    if (!confirm('Remove all appearance overrides for this user? They will control their own theme again.')) return;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: editingUser.displayName,
          role: editingUser.role,
          uiPreferencesAdmin: {
            colorMode: null,
            activeTheme: null,
            fontSize: null,
            lcarsVariant: null,
            lcarsSoundsEnabled: null,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to clear overrides');
      }
      resetForm();
      fetchUsers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = async (role: UserRole, permission: Permission) => {
    if (role === 'admin') return;
    const current = rolePermissions[role] ?? [];
    const has = current.includes(permission);
    const updated = has
      ? current.filter((p) => p !== permission)
      : [...current, permission];

    // Optimistic update
    setRolePermissions((prev) => ({ ...prev, [role]: updated }));
    setPermissionsSaving(role);

    try {
      const res = await fetch(`${API_BASE}/api/role-permissions/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permissions: updated }),
      });
      if (!res.ok) {
        // Revert on failure
        setRolePermissions((prev) => ({ ...prev, [role]: current }));
      }
    } catch {
      setRolePermissions((prev) => ({ ...prev, [role]: current }));
    } finally {
      setPermissionsSaving(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-1 rounded-lg hover:bg-[var(--color-bg-hover)]">
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <Users className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold flex-1">Manage Users</h1>
        {!showCreate && !editingUser && (
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add User
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {(showCreate || editingUser) && (
        <Card>
          <h2 className="text-sm font-medium mb-4">
            {editingUser ? `Edit ${editingUser.username}` : 'Create User'}
          </h2>
          <form onSubmit={editingUser ? handleUpdate : handleCreate} className="space-y-3">
            {!editingUser && (
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Display Name</label>
              <input
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Password{editingUser ? ' (leave blank to keep current)' : ''}
              </label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                {...(!editingUser && { required: true })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Elevation PIN (4–6 digits){editingUser ? ' — leave blank to keep' : ''}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={formPin}
                onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg px-3 py-2 text-sm tracking-widest outline-none"
                style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                {...(!editingUser && { required: true })}
                placeholder="••••"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
              <div className="flex gap-2 flex-wrap">
                {USER_ROLES.map((r) => {
                  const { label, icon: RoleIcon } = ROLE_META[r];
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormRole(r)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
                      style={{
                        backgroundColor: formRole === r ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                        color: formRole === r ? '#fff' : 'var(--color-text-secondary)',
                        borderColor: formRole === r ? 'var(--color-accent)' : 'var(--color-border)',
                      }}
                    >
                      <RoleIcon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {editingUser && (
              <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Appearance overrides
                </p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Optional. Forced values replace this user&apos;s own appearance settings until cleared.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Color mode</label>
                    <select
                      value={adminColorMode}
                      onChange={(e) => setAdminColorMode(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <option value="">No override</option>
                      <option value="light">Force light</option>
                      <option value="dark">Force dark</option>
                      <option value="system">Force system</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Theme</label>
                    <select
                      value={adminTheme}
                      onChange={(e) => setAdminTheme(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <option value="">No override</option>
                      {themes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Font size</label>
                    <select
                      value={adminFontSize}
                      onChange={(e) => setAdminFontSize(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <option value="">No override</option>
                      <option value="13">13px</option>
                      <option value="14">14px</option>
                      <option value="16">16px</option>
                      <option value="18">18px</option>
                    </select>
                  </div>
                </div>
                {editingUser.uiPreferencesAdmin &&
                  Object.keys(editingUser.uiPreferencesAdmin).length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearAdminAppearanceOverrides()}
                    disabled={saving}
                    className="text-[11px] underline-offset-2 hover:underline disabled:opacity-50"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Clear all appearance overrides
                  </button>
                )}
              </div>
            )}

            {formError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{formError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                {saving ? 'Saving...' : editingUser ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg px-4 py-1.5 text-xs font-medium border"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No users found</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const { label, icon: RoleIcon } = ROLE_META[u.role];
            const isSelf = u.id === currentUser?.id;
            return (
              <Card key={u.id}>
                <div className="flex items-center gap-3">
                  <RoleIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.displayName}</span>
                      <span className="text-[10px] rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                        {label}
                      </span>
                      {!u.enabled && (
                        <span className="text-[10px] rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}>
                          Disabled
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          (you)
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      @{u.username}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleEnabled(u)}
                      disabled={isSelf}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-30"
                      aria-label={u.enabled ? 'Disable user' : 'Enable user'}
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: u.enabled ? 'var(--color-success)' : 'var(--color-danger)' }}
                      />
                    </button>
                    <button
                      onClick={() => startEdit(u)}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                      aria-label="Edit user"
                    >
                      <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={isSelf}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-30"
                      aria-label="Delete user"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Permissions Matrix */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="text-sm font-semibold">Role Permissions</h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Configure what each access level can do. Admin always has full access.
        </p>

        {permissionsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        ) : (
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Permission
                  </th>
                  {USER_ROLES.map((role) => {
                    const { label, icon: RoleIcon } = ROLE_META[role];
                    return (
                      <th key={role} className="py-3 px-3 font-medium text-center" style={{ color: 'var(--color-text-secondary)', minWidth: 80 }}>
                        <div className="flex flex-col items-center gap-1">
                          <RoleIcon className="h-3.5 w-3.5" />
                          <span>{label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ALL_PERMISSIONS.map((perm, idx) => (
                  <tr
                    key={perm}
                    style={{
                      borderBottom: idx < ALL_PERMISSIONS.length - 1 ? '1px solid var(--color-border)' : undefined,
                    }}
                  >
                    <td className="py-2.5 px-4" style={{ color: 'var(--color-text)' }}>
                      {PERMISSION_LABELS[perm]}
                    </td>
                    {USER_ROLES.map((role) => {
                      const perms = rolePermissions[role] ?? [];
                      const has = perms.includes(perm);
                      const isAdmin = role === 'admin';
                      const isSaving = permissionsSaving === role;
                      return (
                        <td key={role} className="py-2.5 px-3 text-center">
                          {isAdmin ? (
                            <div className="flex justify-center">
                              <Check className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
                            </div>
                          ) : (
                            <button
                              onClick={() => togglePermission(role, perm)}
                              disabled={isSaving}
                              className="inline-flex justify-center items-center h-6 w-6 rounded-md transition-colors mx-auto"
                              style={{
                                backgroundColor: has
                                  ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                                  : 'var(--color-bg-secondary)',
                                border: `1px solid ${has ? 'var(--color-success)' : 'var(--color-border)'}`,
                                opacity: isSaving ? 0.5 : 1,
                              }}
                              aria-label={has ? 'Remove permission' : 'Grant permission'}
                            >
                              {has ? (
                                <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
                              ) : (
                                <X className="h-3 w-3" style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
