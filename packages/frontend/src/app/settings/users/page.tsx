'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import type { User, UserRole } from '@ha/shared';
import { Users, Plus, Trash2, Shield, Monitor, UserIcon, Pencil, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const ROLE_LABELS: Record<UserRole, { label: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', icon: Shield },
  user: { label: 'User', icon: UserIcon },
  kiosk: { label: 'Kiosk', icon: Monitor },
};

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
  const [formRole, setFormRole] = useState<UserRole>('user');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const resetForm = () => {
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('user');
    setFormError('');
    setShowCreate(false);
    setEditingUser(null);
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
        body: JSON.stringify({ username: formUsername, displayName: formDisplayName, password: formPassword, role: formRole }),
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
    setFormError('');
    setShowCreate(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-1 rounded-lg hover:bg-[var(--color-bg-hover)]">
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
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
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
              <div className="flex gap-2">
                {(['admin', 'user', 'kiosk'] as UserRole[]).map((r) => {
                  const { label, icon: RoleIcon } = ROLE_LABELS[r];
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
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const { label, icon: RoleIcon } = ROLE_LABELS[u.role];
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
                      title={u.enabled ? 'Disable' : 'Enable'}
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: u.enabled ? 'var(--color-success)' : 'var(--color-danger)' }}
                      />
                    </button>
                    <button
                      onClick={() => startEdit(u)}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={isSelf}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-30"
                      title="Delete"
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
    </div>
  );
}
