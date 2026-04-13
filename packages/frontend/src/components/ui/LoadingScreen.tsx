'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { FederationEmblem } from '@/components/lcars/FederationEmblem';
import { Loader2 } from 'lucide-react';

/**
 * Themed loading screen shown during route transitions.
 * LCARS: UFP emblem + blue progress bar.
 * Other themes: spinner + accent-colored progress bar.
 */
export function LoadingScreen({ label }: { label?: string }) {
  const { activeTheme } = useTheme();
  const isLCARS = activeTheme === 'lcars';

  if (isLCARS) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          minHeight: '60vh',
          fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        <FederationEmblem size={100} />
        <div
          style={{
            marginTop: 14,
            color: '#a0c4f0',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.2em',
          }}
        >
          United Federation of Planets
        </div>

        {/* Indeterminate progress bar */}
        <div
          style={{
            width: 280,
            maxWidth: '60vw',
            height: 4,
            background: '#0a1428',
            borderRadius: 999,
            marginTop: 24,
            overflow: 'hidden',
            border: '1px solid #1a3060',
          }}
        >
          <div className="loading-bar-indeterminate" />
        </div>

        <div
          style={{
            marginTop: 14,
            color: '#cc99cc',
            fontSize: 10,
            letterSpacing: '0.18em',
            animation: 'loading-text-pulse 2s ease-in-out infinite',
          }}
        >
          {label || 'ACCESSING STARFLEET DATABASE\u2026'}
        </div>
      </div>
    );
  }

  // ── Non-LCARS themes ──
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '60vh' }}
    >
      <Loader2
        className="animate-spin"
        style={{ color: 'var(--color-accent)', width: 32, height: 32 }}
      />

      {/* Indeterminate progress bar */}
      <div
        style={{
          width: 240,
          maxWidth: '60vw',
          height: 3,
          background: 'var(--color-border)',
          borderRadius: 999,
          marginTop: 20,
          overflow: 'hidden',
          opacity: 0.6,
        }}
      >
        <div className="loading-bar-indeterminate loading-bar-accent" />
      </div>

      <div
        style={{
          marginTop: 12,
          color: 'var(--color-text-secondary)',
          fontSize: 12,
          animation: 'loading-text-pulse 2s ease-in-out infinite',
        }}
      >
        {label || 'Loading\u2026'}
      </div>
    </div>
  );
}
