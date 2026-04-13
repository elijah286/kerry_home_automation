'use client';

import { useState, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/providers/AuthProvider';

type Variant = 'default' | 'lcars';

export function PinElevationControls({
  variant = 'default',
  lcarsTextColor,
  lcarsAccentBg,
}: {
  variant?: Variant;
  /** LCARS header text color */
  lcarsTextColor?: string;
  /** LCARS button background (accent) */
  lcarsAccentBg?: string;
}) {
  const { user, elevated, elevatedSecondsRemaining, hasPin, submitPin } = useAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setPin('');
    setError('');
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitPin(pin.trim());
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  if (elevated) {
    const isLcars = variant === 'lcars';
    return (
      <span
        className={clsx(
          'shrink-0 tabular-nums font-semibold',
          !isLcars && 'rounded-md px-2.5 py-1 text-xs',
        )}
        style={
          isLcars
            ? {
                color: lcarsTextColor,
                fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }
            : {
                color: 'var(--color-accent)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)',
              }
        }
        aria-live="polite"
      >
        Elevated access ({elevatedSecondsRemaining}s)
      </span>
    );
  }

  if (!hasPin) return null;

  const isLcars = variant === 'lcars';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex shrink-0 items-center gap-1.5 rounded-md font-semibold transition-colors',
          isLcars ? 'px-2 py-1 text-[10px] uppercase tracking-[0.12em]' : 'px-2.5 py-1.5 text-xs',
        )}
        style={
          isLcars
            ? {
                background: lcarsAccentBg,
                color: lcarsTextColor,
                fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              }
            : {
                backgroundColor: 'var(--color-bg-hover)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }
        }
        aria-label="Unlock with PIN"
      >
        <Shield className={isLcars ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
        PIN
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-elevation-title"
        >
          <div
            className="w-full max-w-sm rounded-xl border p-4 shadow-lg"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
            }}
          >
            <h2 id="pin-elevation-title" className="text-sm font-semibold mb-1">
              Elevated access
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Enter your 4–6 digit PIN. Full access lasts 30 seconds after your last action.
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg px-3 py-2 text-sm tracking-widest outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                placeholder="••••"
                autoFocus
              />
              {error && (
                <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                  {error}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || pin.length < 4}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                >
                  {busy ? '…' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
