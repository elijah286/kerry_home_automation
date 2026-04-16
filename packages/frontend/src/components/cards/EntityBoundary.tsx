'use client';

// ---------------------------------------------------------------------------
// EntityBoundary — graceful degradation for entity-bound cards.
//
// Shows a muted placeholder when a card references an entity that doesn't
// exist (yet / anymore) or is currently unavailable. The goal: a dashboard
// YAML that references a stale entity never takes down a whole section —
// the user sees *which* card is broken and can either edit or wait.
//
// Two states:
//   - `missing`: entity id is not in the store
//   - `unavailable`: entity is in the store but `available === false`
//
// The `title` prop lets callers label the boundary with the card's display
// name so users don't see a wall of "Unknown entity" messages.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';
import { token } from '@/lib/tokens';

export interface EntityBoundaryProps {
  entityId: string | undefined;
  state: 'missing' | 'unavailable';
  /** Human-friendly label from the card (name override or entity display name). */
  title?: string;
  /** Optional compact style for in-row renders (entity-list items). */
  compact?: boolean;
  /** Tiny override description for contextual hints. */
  reason?: string;
}

export function EntityBoundary({ entityId, state, title, compact, reason }: EntityBoundaryProps): ReactNode {
  const label = title || entityId || 'Unknown entity';
  const message = reason || (state === 'missing'
    ? 'Entity not found. Check the dashboard config.'
    : 'Entity unavailable. Integration may be offline.');

  if (compact) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
        style={{
          background: token('--color-bg-hover'),
          color: token('--color-text-muted'),
          border: `1px dashed ${token('--color-border')}`,
        }}
      >
        <span aria-hidden>⚠</span>
        <span className="font-medium">{label}</span>
        <span className="opacity-70">{state === 'missing' ? 'missing' : 'offline'}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-lg p-3 text-sm"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text-muted'),
        border: `1px dashed ${token('--color-border')}`,
      }}
      data-entity-boundary={state}
      data-entity-id={entityId}
    >
      <div className="flex items-center gap-2 font-medium" style={{ color: token('--color-text') }}>
        <span aria-hidden>⚠</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xs">{message}</div>
      {entityId && (
        <div className="text-xs font-mono opacity-60">{entityId}</div>
      )}
    </div>
  );
}

/**
 * Convenience wrapper for cards that need to do `if (!device) return <EntityBoundary/>`
 * in the common case.
 */
export function withEntityBoundary<T>(
  entityId: string | undefined,
  device: T | undefined,
  render: (device: T) => ReactNode,
  opts: { title?: string; compact?: boolean; requireAvailable?: boolean } = {},
): ReactNode {
  if (!entityId) {
    return (
      <EntityBoundary
        entityId={undefined}
        state="missing"
        title={opts.title}
        compact={opts.compact}
        reason="Card is missing an `entity` reference."
      />
    );
  }
  if (!device) {
    return (
      <EntityBoundary
        entityId={entityId}
        state="missing"
        title={opts.title}
        compact={opts.compact}
      />
    );
  }
  if (opts.requireAvailable && (device as { available?: boolean }).available === false) {
    return (
      <EntityBoundary
        entityId={entityId}
        state="unavailable"
        title={opts.title}
        compact={opts.compact}
      />
    );
  }
  return render(device);
}
