'use client';

import { token } from '@/lib/tokens';

export function UnknownCard({ type, reason }: { type: string; reason: 'not-implemented' | 'unknown-type' }) {
  const label = reason === 'not-implemented' ? 'Card not yet implemented' : 'Unknown card type';
  return (
    <div
      role="status"
      className="rounded-lg p-3 text-sm"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text-muted'),
        border: `1px dashed ${token('--color-border')}`,
      }}
      data-card-type="unknown"
    >
      <div className="font-medium" style={{ color: token('--color-text') }}>{label}</div>
      <div className="font-mono text-xs">{type}</div>
    </div>
  );
}
