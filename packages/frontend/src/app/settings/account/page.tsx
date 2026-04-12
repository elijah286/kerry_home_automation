'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, LogOut, Palette, ChevronRight, Settings } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = () => {
    if (!window.confirm('Sign out of HomeOS?')) return;
    void logout().then(() => {
      window.location.href = '/login';
    });
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(isAdmin ? '/settings' : '/')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          aria-label={isAdmin ? 'Back to settings' : 'Back to dashboard'}
        >
          <ChevronRight className="h-4 w-4 rotate-180" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <User className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">My account</h1>
      </div>

      <div
        className="rounded-[var(--radius)] border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <p className="text-sm font-medium">{user.displayName}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          @{user.username}
        </p>
      </div>

      <div
        className="rounded-[var(--radius)] border overflow-hidden"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <button
          type="button"
          onClick={() => router.push('/settings/appearance')}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ borderBottom: isAdmin ? '1px solid var(--color-border)' : undefined }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
          >
            <Palette className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
              Theme, light/dark mode, font size, LCARS options
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </button>

        {isAdmin && (
          <Link
            href="/settings"
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
            >
              <Settings className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">All settings</p>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                System, users, integrations, and more
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          </Link>
        )}
      </div>

      <div
        className="rounded-[var(--radius)] border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          End your session on this device. You can sign in again at any time.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-danger)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
