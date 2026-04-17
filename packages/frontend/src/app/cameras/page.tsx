'use client';

import { useState, useEffect, useRef, memo, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { getApiBase, apiFetch, authQueryParam } from '@/lib/api-base';
import { useLCARSFrame } from '@/components/lcars/LCARSFrameContext';

// ---------------------------------------------------------------------------
// MJPEG stream — a plain <img> pointed at a multipart/x-mixed-replace endpoint.
// The browser keeps the HTTP connection open and updates the image as new JPEG
// frames arrive.  Pausing is done by clearing the src (disconnects the stream).
// ---------------------------------------------------------------------------

function MJPEGStream({
  name,
  active,
  contain,
  onLoad,
  onError,
}: {
  name: string;
  /** When false the src is blanked so the browser drops the HTTP connection. */
  active: boolean;
  contain?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const src = active
    ? `${getApiBase()}/api/cameras/${encodeURIComponent(name)}/mjpeg${authQueryParam(false)}`
    : '';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}          // remount when src changes so browser reconnects cleanly
      src={src}
      alt=""
      className={`absolute inset-0 h-full w-full ${contain ? 'object-contain' : 'object-cover'}`}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

// ---------------------------------------------------------------------------
// Camera data
// ---------------------------------------------------------------------------

interface CameraInfo {
  name: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Camera tile — snapshot polling at 500 ms (~2 fps), works for any grid size
// ---------------------------------------------------------------------------

const CameraTile = memo(function CameraTile({
  cam,
  onSelect,
}: {
  cam: CameraInfo;
  onSelect: () => void;
}) {
  const [rev,    setRev]    = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);

  // Poll every 500 ms while healthy.
  useEffect(() => {
    if (error) return;
    const t = window.setInterval(() => setRev((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [error]);

  // Auto-recover after 10 s on hard error.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => { setError(false); setLoaded(false); }, 10_000);
    return () => window.clearTimeout(t);
  }, [error]);

  return (
    <div
      className="relative aspect-video cursor-pointer overflow-hidden rounded-sm bg-black"
      onClick={onSelect}
    >
      {error ? (
        <div className="flex h-full items-center justify-center">
          <span className="text-[11px] text-zinc-500">No signal</span>
        </div>
      ) : (
        <>
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${rev}${authQueryParam(true)}`}
            alt={cam.label}
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => { setError(true); setLoaded(false); }}
          />
        </>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
        <span className="text-xs font-medium text-white drop-shadow-sm">{cam.label}</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Fullscreen — full MJPEG stream, no fallback needed
// ---------------------------------------------------------------------------

function FullscreenCamera({ cam, onClose }: { cam: CameraInfo; onClose: () => void }) {
  const [loaded,    setLoaded]    = useState(false);
  const [error,     setError]     = useState(false);
  const frame = useLCARSFrame();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [cam.name]);

  const overlayStyle: CSSProperties = frame
    ? {
        position: 'fixed',
        top: frame.contentTop,
        left: frame.contentLeft,
        right: frame.contentRight,
        bottom: frame.contentBottom,
        zIndex: 40,
        borderRadius: 8,
      }
    : { position: 'fixed', inset: 0, zIndex: 50 };

  return (
    <div className="flex flex-col bg-black" style={overlayStyle}>
      <div className="relative flex-1">
        {!loaded && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          </div>
        )}

        <MJPEGStream
          name={cam.name}
          active={!error}
          contain
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(false); }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
          <span className="text-sm font-medium text-white drop-shadow-sm">{cam.label}</span>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
          <span className="text-[11px] text-white/60">
            {error ? 'No stream — check UniFi / go2rtc and backend logs' : loaded ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main cameras page
// ---------------------------------------------------------------------------

const FALLBACK_CAMERAS: CameraInfo[] = [
  { name: 'back_door',   label: 'Back Door' },
  { name: 'living_room', label: 'Living Room' },
  { name: 'garage',      label: 'Garage' },
  { name: 'backyard',    label: 'Backyard' },
  { name: 'street',      label: 'Street' },
  { name: 'driveway',    label: 'Driveway' },
  { name: 'game_room',   label: 'Game Room' },
  { name: 'pool',        label: 'Pool' },
  { name: 'front_porch', label: 'Front Porch' },
];

export default function CamerasPage() {
  const [cameras,       setCameras]       = useState<CameraInfo[]>([]);
  const [fullscreenCam, setFullscreenCam] = useState<CameraInfo | null>(null);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [listError,     setListError]     = useState(false);
  const [recovering,    setRecovering]    = useState(false);

  const loadCameras = () => {
    apiFetch(`${getApiBase()}/api/cameras`)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((data: { cameras?: CameraInfo[]; recover?: { pendingEntries?: number } }) => {
        setCameras(data.cameras ?? []);
        setPendingEntries(data.recover?.pendingEntries ?? 0);
        setListError(false);
      })
      .catch(() => {
        setListError(true);
        setCameras(FALLBACK_CAMERAS);
        setPendingEntries(0);
      });
  };

  useEffect(() => {
    loadCameras();
    const id = window.setInterval(loadCameras, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const onRecover = () => {
    setRecovering(true);
    apiFetch(`${getApiBase()}/api/cameras/recover`, { method: 'POST' })
      .finally(() => {
        setRecovering(false);
        loadCameras();
      });
  };

  const showEmptyHint = cameras.length === 0 && !listError;

  return (
    <>
      <div className="p-2 lg:p-3">
        {showEmptyHint && (
          <div className="mb-3 rounded-md border border-zinc-700/80 bg-zinc-900/50 px-3 py-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">No cameras listed yet</p>
            <p className="mt-1 text-xs text-zinc-400">
              The backend pulls this list from go2rtc (UniFi Protect). If go2rtc was offline when the server
              started, names stay empty until it reconnects. This page rechecks every 15 seconds, and the
              server retries automatically.
            </p>
            {pendingEntries > 0 && (
              <p className="mt-2 text-xs text-amber-200/90">
                {pendingEntries} UniFi integration {pendingEntries === 1 ? 'entry has' : 'entries have'} not
                finished connecting to go2rtc — still retrying.
              </p>
            )}
            <button
              type="button"
              onClick={onRecover}
              disabled={recovering}
              className="mt-3 rounded border border-zinc-500 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {recovering ? 'Reconnecting…' : 'Retry connection now'}
            </button>
          </div>
        )}
        {listError && (
          <div className="mb-3 rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
            Could not reach the camera API — showing a static list. Check that the backend on port 3000 is running.
          </div>
        )}
        <div className="grid grid-cols-2 gap-1 lg:grid-cols-3 xl:grid-cols-4">
          {cameras.map((cam) => (
            <CameraTile
              key={cam.name}
              cam={cam}
              onSelect={() => setFullscreenCam(cam)}
            />
          ))}
        </div>
      </div>

      {fullscreenCam && (
        <FullscreenCamera
          cam={fullscreenCam}
          onClose={() => setFullscreenCam(null)}
        />
      )}
    </>
  );
}
