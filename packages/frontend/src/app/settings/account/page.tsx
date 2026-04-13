'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, LogOut, Palette, ChevronRight, Settings } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, logout, isAdmin, hasPin, setAccountPin } = useAuth();
  const [pinPassword, setPinPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

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
        className="rounded-[var(--radius)] border p-4 space-y-3"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        <div>
          <p className="text-sm font-medium">Elevation PIN</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {hasPin
              ? 'Use this 4–6 digit PIN in the header to unlock full access for 30 seconds after your last action.'
              : 'Set a PIN to use quick elevation in the header instead of typing your full password.'}
          </p>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPinError('');
            setPinSaving(true);
            void setAccountPin(pinPassword, newPin)
              .then(() => {
                setPinPassword('');
                setNewPin('');
              })
              .catch((err) => setPinError((err as Error).message))
              .finally(() => setPinSaving(false));
          }}
        >
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Account password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={pinPassword}
              onChange={(e) => setPinPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {hasPin ? 'New PIN (4–6 digits)' : 'PIN (4–6 digits)'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              autoComplete="off"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg px-3 py-2 text-sm tracking-widest outline-none"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              required
              placeholder="••••"
            />
          </div>
          {pinError && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {pinError}
            </p>
          )}
          <button
            type="submit"
            disabled={pinSaving || newPin.length < 4}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {pinSaving ? 'Saving…' : hasPin ? 'Update PIN' : 'Save PIN'}
          </button>
        </form>
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
