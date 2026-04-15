'use client';

import { useState, useCallback } from 'react';
import { Shield, Delete } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/providers/AuthProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';

type Variant = 'default' | 'lcars';

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

function PinDots({ length, max = 6 }: { length: number; max?: number }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-3">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className="h-3.5 w-3.5 rounded-full transition-all duration-150"
          style={{
            backgroundColor: i < length ? 'var(--color-accent)' : 'transparent',
            border: `2px solid ${i < length ? 'var(--color-accent)' : 'var(--color-border)'}`,
            transform: i < length ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );
}

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
  const { user, elevated, elevatedSecondsRemaining, hasPin, pinElevationAvailable, submitPin } = useAuth();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isTouch = useMediaQuery('(pointer: coarse)');

  const close = useCallback(() => {
    setOpen(false);
    setPin('');
    setError('');
  }, []);

  const handleSubmit = useCallback(async (value: string) => {
    setError('');
    setBusy(true);
    try {
      await submitPin(value.trim());
      setOpen(false);
      setPin('');
      setError('');
    } catch (err) {
      setError((err as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }, [submitPin]);

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit(pin);
  };

  const onNumpadKey = useCallback((key: string) => {
    setError('');
    if (key === 'del') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    setPin((prev) => {
      const next = prev + key;
      if (next.length > 6) return prev;
      // Auto-submit when PIN reaches 4+ digits and a key is pressed after a pause
      // (natural "done" signal). We auto-submit at 6 (max length).
      if (next.length === 6) {
        setTimeout(() => void handleSubmit(next), 80);
      }
      return next;
    });
  }, [handleSubmit]);

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

  // Show the PIN button when ANY admin/parent has a PIN (not just the current user),
  // so children/kiosk users can enter a parent's PIN to elevate their session.
  if (!pinElevationAvailable && !hasPin) return null;

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
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className={clsx(
              'w-full rounded-xl border shadow-lg',
              isTouch ? 'max-w-xs p-5' : 'max-w-sm p-4',
            )}
            style={{
              backgroundColor: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
            }}
          >
            <h2 id="pin-elevation-title" className="text-sm font-semibold mb-1 text-center">
              Elevated access
            </h2>
            <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
              Enter an admin or parent PIN
            </p>

            {isTouch ? (
              /* ── Numpad for touch devices ── */
              <div className="space-y-3">
                <PinDots length={pin.length} />
                {error && (
                  <p className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>
                    {error}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {NUMPAD_KEYS.map((key, idx) => {
                    if (key === '') return <div key={idx} />;
                    if (key === 'del') {
                      return (
                        <button
                          key="del"
                          type="button"
                          onClick={() => onNumpadKey('del')}
                          disabled={busy}
                          className="flex items-center justify-center rounded-xl py-3.5 text-sm font-medium transition-colors active:scale-95"
                          style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            color: 'var(--color-text-secondary)',
                          }}
                          aria-label="Delete"
                        >
                          <Delete className="h-5 w-5" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onNumpadKey(key)}
                        disabled={busy}
                        className="rounded-xl py-3.5 text-lg font-semibold transition-colors active:scale-95"
                        style={{
                          backgroundColor: 'var(--color-bg-secondary)',
                          color: 'var(--color-text)',
                        }}
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 rounded-lg py-2 text-sm font-medium border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmit(pin)}
                    disabled={busy || pin.length < 4}
                    className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                  >
                    {busy ? '…' : 'Unlock'}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Text input for keyboard devices ── */
              <form onSubmit={onFormSubmit} className="space-y-3">
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
