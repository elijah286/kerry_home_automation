'use client';

// ---------------------------------------------------------------------------
// DeviceDefaultCardPanel — the "front door" of a device detail page.
//
// Renders the user's effective card for this device (override → default
// mapping → generic fallback) via `useDeviceCard`. When an override is
// present, a small "Reset to default" control lets the user revert.
//
// Changing the card type / tuning descriptor fields is explicitly out of
// scope here — that's a full picker + form editor that will live in its
// own component. This panel is the *render* of the resolved card; the
// *edit* path hangs off the "Change card" button which, for now, is a
// placeholder until the picker lands.
// ---------------------------------------------------------------------------

import { Sparkles, RotateCcw, Loader2 } from 'lucide-react';
import { useDeviceCard } from '@/hooks/useDeviceCard';
import { CardRenderer } from '@/components/cards/CardRenderer';
import { Card } from '@/components/ui/Card';

interface DeviceDefaultCardPanelProps {
  deviceId: string;
}

export function DeviceDefaultCardPanel({ deviceId }: DeviceDefaultCardPanelProps) {
  const { card, isOverridden, isLoading, error, clearOverride } = useDeviceCard(deviceId);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          <h2
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {isOverridden ? 'Your custom card' : 'Default card'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          )}
          {isOverridden && (
            <button
              type="button"
              onClick={() => void clearOverride()}
              title="Revert to the default card for this device type"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-2 text-xs" style={{ color: 'var(--color-danger)' }}>
          {error.message}
        </p>
      )}

      {card ? (
        <CardRenderer card={card} />
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Device not available.
        </p>
      )}
    </Card>
  );
}
