'use client';

import { useState, useRef, useCallback } from 'react';
import type { CoverState, GarageDoorState } from '@ha/shared';
import { useCommand } from '@/hooks/useCommand';
import { Badge } from '@/components/ui/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverControlProps {
  device: CoverState | GarageDoorState;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLAT_COUNT = 12;
const CONTROL_HEIGHT = 220;
const CONTROL_WIDTH = 180;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CoverControl({ device, className }: CoverControlProps) {
  const { send, isPending } = useCommand(device.id);
  const isCover = device.type === 'cover';

  // Position: 0 = closed, 100 = fully open
  const currentPosition = isCover ? (device as CoverState).position : ((device as GarageDoorState).open ? 100 : 0);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayPosition = dragPosition ?? currentPosition;

  // Moving state
  const movingState = isCover
    ? (device as CoverState).moving
    : (device as GarageDoorState).opening ? 'opening' : (device as GarageDoorState).closing ? 'closing' : 'stopped';

  const statusText = movingState === 'opening' ? 'Opening...'
    : movingState === 'closing' ? 'Closing...'
    : displayPosition >= 95 ? 'Open'
    : displayPosition <= 5 ? 'Closed'
    : `${Math.round(displayPosition)}% Open`;

  const statusVariant = displayPosition > 50 ? 'success' : displayPosition > 0 ? 'warning' : 'default';

  // Convert position to visual representation
  // As position increases (more open), the blinds/door opens more
  const openFraction = displayPosition / 100;

  // Drag handling
  const positionFromEvent = useCallback((clientY: number) => {
    if (!trackRef.current) return null;
    const rect = trackRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    // Top = closed (0), bottom = open (100) — inverted for blind metaphor
    // Actually: top = open (100), bottom = closed (0) like pulling down
    const fraction = 1 - Math.max(0, Math.min(1, y / rect.height));
    return Math.round(fraction * 100);
  }, []);

  const handleDragStart = useCallback((clientY: number) => {
    if (!isCover) return; // Garage doors don't support position
    draggingRef.current = true;
    const pos = positionFromEvent(clientY);
    if (pos !== null) setDragPosition(pos);
  }, [isCover, positionFromEvent]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!draggingRef.current) return;
    const pos = positionFromEvent(clientY);
    if (pos !== null) setDragPosition(pos);
  }, [positionFromEvent]);

  const handleDragEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pos = dragPosition;
    if (pos !== null) {
      // Debounce command
      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = setTimeout(() => {
        send('position', { type: 'cover', action: 'set_position', position: pos });
        setDragPosition(null);
      }, 300);
    }
  }, [dragPosition, send]);

  // Render slats
  const slatElements = [];
  for (let i = 0; i < SLAT_COUNT; i++) {
    // Each slat tilts based on open amount
    // When closed: slats are horizontal (overlapping)
    // When open: slats tilt to near-vertical and compress upward
    const slatSpacing = (CONTROL_HEIGHT - 20) / SLAT_COUNT;
    const compressedTop = 10 + i * (slatSpacing * (1 - openFraction * 0.7));
    const slatHeight = Math.max(2, 10 - openFraction * 6);
    const opacity = 1 - openFraction * 0.4;

    slatElements.push(
      <div
        key={i}
        className="absolute rounded-sm transition-all duration-150"
        style={{
          left: 12,
          right: 12,
          top: compressedTop,
          height: slatHeight,
          backgroundColor: 'var(--color-text-muted)',
          opacity,
          boxShadow: openFraction < 0.5
            ? '0 1px 2px rgba(0,0,0,0.15)'
            : 'none',
        }}
      />,
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      {/* Status badge */}
      <div className="flex items-center justify-between w-full">
        <span className="text-sm font-medium">{device.displayName ?? device.name}</span>
        <Badge variant={statusVariant as 'success' | 'warning' | 'default'}>
          {movingState !== 'stopped' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{ backgroundColor: 'currentColor' }} />
          )}
          {statusText}
        </Badge>
      </div>

      {/* Blinds visual */}
      <div
        ref={trackRef}
        className="relative cursor-ns-resize select-none rounded-lg overflow-hidden"
        style={{
          width: CONTROL_WIDTH,
          height: CONTROL_HEIGHT,
          backgroundColor: openFraction > 0.3
            ? 'var(--color-accent)'
            : 'var(--color-bg-secondary)',
          opacity: openFraction > 0.3 ? 0.15 + openFraction * 0.15 : 1,
          border: '2px solid var(--color-border)',
          transition: 'background-color 0.3s',
        }}
        onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientY); }}
        onMouseMove={(e) => handleDragMove(e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => { if (draggingRef.current) handleDragEnd(); }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => { e.preventDefault(); handleDragMove(e.touches[0].clientY); }}
        onTouchEnd={handleDragEnd}
      >
        {/* Window "light" background */}
        <div
          className="absolute inset-3 rounded"
          style={{
            background: openFraction > 0.1
              ? `linear-gradient(180deg, rgba(56,189,248,${openFraction * 0.2}) 0%, rgba(56,189,248,${openFraction * 0.05}) 100%)`
              : 'transparent',
          }}
        />

        {/* Slats */}
        {slatElements}

        {/* Position indicator (when dragging) */}
        {dragPosition !== null && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-xs font-medium"
            style={{
              top: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {dragPosition}%
          </div>
        )}

        {/* Top rail */}
        <div
          className="absolute top-0 left-0 right-0 h-2.5 rounded-t"
          style={{ backgroundColor: 'var(--color-text-muted)', opacity: 0.6 }}
        />
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-2 w-full">
        {isCover ? (
          <>
            <button
              onClick={() => send('open', { type: 'cover', action: 'open' })}
              disabled={isPending('open')}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              Open
            </button>
            <button
              onClick={() => send('close', { type: 'cover', action: 'close' })}
              disabled={isPending('close')}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              Close
            </button>
          </>
        ) : (
          <button
            onClick={() => send('toggle', {
              type: 'garage_door',
              action: (device as GarageDoorState).open ? 'close' : 'open',
            })}
            disabled={isPending('toggle')}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: (device as GarageDoorState).open ? 'var(--color-danger)' : 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {(device as GarageDoorState).open ? 'Close' : 'Open'}
          </button>
        )}
      </div>
    </div>
  );
}
