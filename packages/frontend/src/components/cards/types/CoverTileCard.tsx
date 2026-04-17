'use client';

// ---------------------------------------------------------------------------
// CoverTileCard — cover / shade / blind / garage door.
//
// Two modes based on `showPositionControl`:
//   - `true`  → Full vertical-blind UI with drag-to-set position. The default
//               for shades/blinds/shutters — users want fine-grained control,
//               not just open/close.
//   - `false` → Compact binary tile (Open/Close button). Garage doors + simple
//               blinds that don't report position.
//
// Both modes are entity-bound: if the device disappears or the bridge goes
// offline, the `EntityBoundary` wrapper shows a muted placeholder instead of
// a crash.
//
// The drag interaction lives inline rather than being pulled out as a
// reusable "VerticalBlindControl" — the existing `CoverControl` component
// (used on the device detail page) has nearly-identical logic; consolidating
// both is worth its own ticket once the viz / card boundary settles.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from 'react';
import type {
  CoverTileCard as CoverTileCardDescriptor,
  CoverState,
  GarageDoorState,
} from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token } from '@/lib/tokens';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { withEntityBoundary } from '../EntityBoundary';

// ---------------------------------------------------------------------------
// Top-level card component — splits by device.type and renders the right body
// ---------------------------------------------------------------------------

export function CoverTileCard({ card }: { card: CoverTileCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => {
      // `cover-tile` resolves for both `cover` and `garage_door` types —
      // render the matching body. Anything else is a configuration error;
      // the muted EntityBoundary is a safer default than a crash.
      if (d.type === 'cover') {
        return card.showPositionControl
          ? <CoverPositionBody card={card} device={d} />
          : <CoverBinaryBody card={card} device={d} />;
      }
      if (d.type === 'garage_door') {
        return <GarageDoorBody card={card} device={d} />;
      }
      return <div />;
    },
    { title: card.name },
  );
}

// ---------------------------------------------------------------------------
// Compact binary mode (no position slider) — for garage doors or simple covers
// ---------------------------------------------------------------------------

function CoverBinaryBody({
  card,
  device,
}: {
  card: CoverTileCardDescriptor;
  device: CoverState;
}) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const busy = isPending('tap');
  const isOpen = device.position >= 50;

  return (
    <button
      type="button"
      onClick={() =>
        void send('tap', { type: 'cover', action: isOpen ? 'close' : 'open' })
      }
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2"
      style={{
        background: isOpen ? token('--color-accent') : token('--color-bg-card'),
        color: isOpen ? '#fff' : token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.7 : 1,
      }}
      data-card-type="cover-tile"
    >
      {card.icon && <span aria-hidden>{card.icon}</span>}
      <span className="flex-1 truncate text-left text-sm font-medium">{label}</span>
      {busy ? (
        <ButtonSpinner />
      ) : (
        <span className="text-xs font-medium opacity-80">
          {device.moving === 'opening'
            ? 'Opening…'
            : device.moving === 'closing'
              ? 'Closing…'
              : isOpen
                ? `${Math.round(device.position)}%`
                : 'Closed'}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Garage door mode — open/close toggle, no position
// ---------------------------------------------------------------------------

function GarageDoorBody({
  card,
  device,
}: {
  card: CoverTileCardDescriptor;
  device: GarageDoorState;
}) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const busy = isPending('tap');

  return (
    <button
      type="button"
      onClick={() =>
        void send('tap', { type: 'garage_door', action: device.open ? 'close' : 'open' })
      }
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2"
      style={{
        background: device.open ? token('--color-danger') : token('--color-bg-card'),
        color: device.open ? '#fff' : token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        opacity: busy ? 0.7 : 1,
      }}
      data-card-type="cover-tile"
    >
      {card.icon && <span aria-hidden>{card.icon}</span>}
      <span className="flex-1 truncate text-left text-sm font-medium">{label}</span>
      {busy ? (
        <ButtonSpinner />
      ) : (
        <span className="text-xs font-medium opacity-80">
          {device.opening ? 'Opening…' : device.closing ? 'Closing…' : device.open ? 'Open' : 'Closed'}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Position-control mode — vertical blind UI with drag to set position
// ---------------------------------------------------------------------------

const SLAT_COUNT = 10;
const TRACK_HEIGHT = 150;

function CoverPositionBody({
  card,
  device,
}: {
  card: CoverTileCardDescriptor;
  device: CoverState;
}) {
  const { send, isPending } = useCommand(device.id);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const label = card.name ?? device.displayName ?? device.name;
  const currentPosition = device.position;
  const displayPosition = dragPosition ?? currentPosition;
  const openFraction = displayPosition / 100;

  const statusText =
    device.moving === 'opening'
      ? 'Opening…'
      : device.moving === 'closing'
        ? 'Closing…'
        : displayPosition >= 95
          ? 'Open'
          : displayPosition <= 5
            ? 'Closed'
            : `${Math.round(displayPosition)}%`;

  const statusVariant: 'success' | 'warning' | 'default' =
    displayPosition > 50 ? 'success' : displayPosition > 0 ? 'warning' : 'default';

  // Convert a pointer Y coordinate into a 0–100 position. The track runs
  // top=open → bottom=closed (matches the pull-down-to-close metaphor).
  const positionFromClientY = useCallback((clientY: number): number | null => {
    if (!trackRef.current) return null;
    const rect = trackRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const fraction = 1 - Math.max(0, Math.min(1, y / rect.height));
    return Math.round(fraction * 100);
  }, []);

  const handleDragStart = useCallback((clientY: number) => {
    draggingRef.current = true;
    const pos = positionFromClientY(clientY);
    if (pos !== null) setDragPosition(pos);
  }, [positionFromClientY]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!draggingRef.current) return;
    const pos = positionFromClientY(clientY);
    if (pos !== null) setDragPosition(pos);
  }, [positionFromClientY]);

  const handleDragEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pos = dragPosition;
    if (pos !== null) {
      send('position', { type: 'cover', action: 'set_position', position: pos });
      // Keep the drag indicator visible briefly; the real position will
      // arrive via WebSocket and `dragPosition` clears on the next snap.
      setTimeout(() => setDragPosition(null), 250);
    }
  }, [dragPosition, send]);

  // Build slat elements: when open, they compress upward and tilt near-vertical;
  // when closed, they're horizontal and overlap.
  const slatElements = [];
  for (let i = 0; i < SLAT_COUNT; i++) {
    const slatSpacing = (TRACK_HEIGHT - 16) / SLAT_COUNT;
    const top = 8 + i * (slatSpacing * (1 - openFraction * 0.7));
    const height = Math.max(2, 8 - openFraction * 5);
    const opacity = 1 - openFraction * 0.4;
    slatElements.push(
      <div
        key={i}
        className="absolute rounded-sm transition-all duration-150"
        style={{
          left: 10,
          right: 10,
          top,
          height,
          backgroundColor: token('--color-text-muted'),
          opacity,
          boxShadow: openFraction < 0.5 ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
        }}
      />,
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="cover-tile"
    >
      {/* Header: label + live status */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <Badge variant={statusVariant}>
          {device.moving !== 'stopped' && (
            <span
              className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ backgroundColor: 'currentColor' }}
            />
          )}
          {statusText}
        </Badge>
      </div>

      {/* Drag track — the vertical blind visual */}
      <div
        ref={trackRef}
        className="relative cursor-ns-resize select-none overflow-hidden rounded-md"
        style={{
          height: TRACK_HEIGHT,
          backgroundColor:
            openFraction > 0.3 ? token('--color-accent') : token('--color-bg-secondary'),
          opacity: openFraction > 0.3 ? 0.15 + openFraction * 0.15 : 1,
          border: `2px solid ${token('--color-border')}`,
          transition: 'background-color 0.3s',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          handleDragStart(e.clientY);
        }}
        onMouseMove={(e) => handleDragMove(e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => {
          if (draggingRef.current) handleDragEnd();
        }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => {
          e.preventDefault();
          handleDragMove(e.touches[0].clientY);
        }}
        onTouchEnd={handleDragEnd}
      >
        {/* Window-light gradient when open — sky bleeds through the slats */}
        <div
          className="absolute inset-2 rounded"
          style={{
            background:
              openFraction > 0.1
                ? `linear-gradient(180deg, rgba(56,189,248,${openFraction * 0.2}) 0%, rgba(56,189,248,${openFraction * 0.05}) 100%)`
                : 'transparent',
          }}
        />
        {slatElements}

        {/* Live drag indicator */}
        {dragPosition !== null && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: token('--color-accent'), color: '#fff' }}
          >
            {dragPosition}%
          </div>
        )}

        {/* Top rail — the "hardware" at the top of the blind */}
        <div
          className="absolute left-0 right-0 top-0 h-2 rounded-t"
          style={{ backgroundColor: token('--color-text-muted'), opacity: 0.6 }}
        />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => send('open', { type: 'cover', action: 'open' })}
          disabled={isPending('open')}
          className="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: token('--color-bg-secondary'),
            color: token('--color-text-secondary'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => send('close', { type: 'cover', action: 'close' })}
          disabled={isPending('close')}
          className="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: token('--color-bg-secondary'),
            color: token('--color-text-secondary'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
