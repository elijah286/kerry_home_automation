'use client';

// ---------------------------------------------------------------------------
// CameraCard — single-camera tile.
//
// Matches the new cameras-page model (see packages/frontend/src/app/cameras/
// page.tsx): MJPEG for live and 500 ms snapshot polling for the rest. HLS/MSE
// was removed upstream — those paths no longer exist on the backend.
//
//   - mode: 'live'     — MJPEG stream (keeps a single multipart HTTP connection
//                        open and updates as JPEG frames arrive).
//   - mode: 'snapshot' — /snapshot polled at ~2 Hz.
//   - mode: 'auto'     — snapshot, matching the low-bandwidth default the
//                        dashboard page uses for grid tiles.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type { CameraCard as CameraCardDescriptor, CameraState } from '@ha/shared';
import { useDevice } from '@/hooks/useDevice';
import { token } from '@/lib/tokens';
import { getApiBase, authQueryParam } from '@/lib/api-base';
import { withEntityBoundary } from '../EntityBoundary';

export function CameraCard({ card }: { card: CameraCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type !== 'camera') return <div />;
    return <CameraBody card={card} device={d} />;
  }, { title: card.name });
}

function CameraBody({ card, device }: { card: CameraCardDescriptor; device: CameraState }) {
  const label = card.name ?? device.displayName ?? device.name;
  const showLive = card.mode === 'live';

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="camera"
    >
      {/* The camera name is used directly as the path parameter — matches the
          /cameras page contract. */}
      {showLive ? (
        <MjpegImage cameraName={device.name} fit={card.fit} />
      ) : (
        <SnapshotImage cameraName={device.name} fit={card.fit} />
      )}

      {card.showStatus && (
        <div
          className="absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: device.online ? token('--color-success') : token('--color-danger'),
              boxShadow: device.online ? '0 0 4px currentColor' : 'none',
            }}
          />
          {showLive ? 'LIVE' : 'snapshot'}
        </div>
      )}
      <div
        className="truncate px-2 py-1 text-[11px] font-medium"
        style={{
          background: token('--color-bg-secondary'),
          color: token('--color-text'),
          borderTop: `1px solid ${token('--color-border')}`,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Snapshot mode — 500 ms polling matches the grid tile on /cameras.
function SnapshotImage({ cameraName, fit }: { cameraName: string; fit: 'cover' | 'contain' }) {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setRev((r) => r + 1), 500);
    return () => clearInterval(t);
  }, []);
  const url = `${getApiBase()}/api/cameras/${encodeURIComponent(cameraName)}/snapshot?r=${rev}${authQueryParam(true)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="block w-full"
      style={{ aspectRatio: '16 / 9', objectFit: fit, background: token('--color-bg-hover') }}
    />
  );
}

// Live mode — MJPEG multipart stream. The browser keeps the HTTP connection
// open; unmount (`key` change or component removal) disconnects.
function MjpegImage({ cameraName, fit }: { cameraName: string; fit: 'cover' | 'contain' }) {
  const url = `${getApiBase()}/api/cameras/${encodeURIComponent(cameraName)}/mjpeg${authQueryParam(false)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url}
      alt=""
      className="block w-full"
      style={{ aspectRatio: '16 / 9', objectFit: fit, background: token('--color-bg-hover') }}
    />
  );
}
