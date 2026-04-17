'use client';

import { useState, useEffect, useRef, useCallback, memo, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { getApiBase, apiFetch, authQueryParam, authHeaders } from '@/lib/api-base';
import { useLCARSFrame } from '@/components/lcars/LCARSFrameContext';

// ---------------------------------------------------------------------------
// Camera live player with tiered fallback:
//   1. WebRTC       — sub-second latency, native codec, no transcoding
//   2. HLS          — 3–6s latency, works through any HTTP proxy / poor network
//   3. Snapshot     — 2 fps JPEG polling, last-resort so user always sees *something*
//
// The player starts at whatever tier the user picked (default auto = 1), and
// on stall / error automatically degrades. Watchdogs are generous because
// go2rtc HLS cold-start can take 10+ s to produce the first segment.
// ---------------------------------------------------------------------------

type Tier = 'webrtc' | 'hls' | 'snapshot';
type PlayerMode = 'auto' | Tier;
type PlayerStatus = 'connecting' | 'live' | 'failed';

const TIER_ORDER: Tier[] = ['webrtc', 'hls', 'snapshot'];
const WEBRTC_WATCHDOG_MS = 10_000;
const HLS_WATCHDOG_MS = 15_000;

function nextTier(t: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(t);
  return i >= 0 && i + 1 < TIER_ORDER.length ? TIER_ORDER[i + 1] : null;
}

function CameraPlayer({
  name,
  mode,
  onTierChange,
  onError,
}: {
  name: string;
  mode: PlayerMode;
  onTierChange?: (tier: Tier, status: PlayerStatus) => void;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTier, setActiveTier] = useState<Tier>(
    mode === 'auto' ? 'webrtc' : (mode as Tier),
  );
  const [snapshotRev, setSnapshotRev] = useState(0);
  const tierRef = useRef(activeTier);
  tierRef.current = activeTier;

  // Stabilize callbacks so tier effects don't re-run on every parent re-render
  // (parent re-renders every 500 ms during snapshot polling).
  const onTierChangeRef = useRef(onTierChange);
  onTierChangeRef.current = onTierChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const emit = useCallback((t: Tier, s: PlayerStatus) => {
    onTierChangeRef.current?.(t, s);
    if (process.env.NODE_ENV !== 'production') {
      // Helps diagnose which tier is actually failing in the field.
      // eslint-disable-next-line no-console
      console.info(`[camera:${name}] ${t} → ${s}`);
    }
  }, [name]);

  // Reset to the user-selected starting tier whenever name or mode changes.
  useEffect(() => {
    setActiveTier(mode === 'auto' ? 'webrtc' : (mode as Tier));
  }, [name, mode]);

  // Degrade one tier. In 'auto' mode drops to the next fallback; in a forced
  // mode the user asked for a specific tier so we don't override their choice.
  const degrade = useCallback(() => {
    if (mode !== 'auto') {
      emit(tierRef.current, 'failed');
      onErrorRef.current?.();
      return;
    }
    const next = nextTier(tierRef.current);
    if (next) {
      setActiveTier(next);
    } else {
      emit(tierRef.current, 'failed');
      onErrorRef.current?.();
    }
  }, [mode, emit]);

  // -------------------------------------------------------------------------
  // Tier 1: WebRTC
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeTier !== 'webrtc') return;

    emit('webrtc', 'connecting');

    let pc: RTCPeerConnection | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let stalledCheck: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (!cancelled) degrade(); }, WEBRTC_WATCHDOG_MS);
    };

    const clearWatchdog = () => {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    };

    (async () => {
      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          bundlePolicy: 'max-bundle',
        });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (ev) => {
          const video = videoRef.current;
          if (!video) return;
          if (!video.srcObject) video.srcObject = new MediaStream();
          const stream = video.srcObject as MediaStream;
          stream.addTrack(ev.track);
        };

        pc.oniceconnectionstatechange = () => {
          const s = pc?.iceConnectionState;
          if (s === 'failed' || s === 'disconnected' || s === 'closed') {
            if (!cancelled) degrade();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        armWatchdog();

        const res = await apiFetch(`${getApiBase()}/api/cameras/${encodeURIComponent(name)}/webrtc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp ?? '',
        });
        if (!res.ok) throw new Error(`WebRTC SDP ${res.status}`);
        const answerSdp = await res.text();
        if (cancelled) return;

        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        // Consider the tier "live" once the video element actually paints a frame.
        const video = videoRef.current;
        if (video) {
          const onPlaying = () => {
            clearWatchdog();
            if (!cancelled) emit('webrtc', 'live');
          };
          video.addEventListener('playing', onPlaying, { once: true });

          // Detect stall: time should advance. If currentTime freezes for 6s, degrade.
          let lastTime = 0;
          let stalledSince = 0;
          stalledCheck = setInterval(() => {
            if (!video) return;
            if (video.currentTime > lastTime) {
              lastTime = video.currentTime;
              stalledSince = 0;
            } else if (video.readyState >= 2) {
              stalledSince += 1;
              if (stalledSince >= 6 && !cancelled) degrade();
            }
          }, 1000);
        }
      } catch {
        if (!cancelled) degrade();
      }
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      if (stalledCheck) clearInterval(stalledCheck);
      if (pc) { try { pc.close(); } catch { /* noop */ } }
      const video = videoRef.current;
      if (video && video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    };
  }, [activeTier, name, degrade, emit]);

  // -------------------------------------------------------------------------
  // Tier 2: HLS
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeTier !== 'hls') return;

    emit('hls', 'connecting');

    const video = videoRef.current;
    if (!video) return;

    const src = `${getApiBase()}/api/cameras/${encodeURIComponent(name)}/hls/stream.m3u8${authQueryParam(false)}`;
    let hls: import('hls.js').default | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const armWatchdog = () => {
      watchdog = setTimeout(() => { if (!cancelled) degrade(); }, HLS_WATCHDOG_MS);
    };
    const clearWatchdog = () => {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    };

    const onPlaying = () => {
      clearWatchdog();
      if (!cancelled) emit('hls', 'live');
    };
    video.addEventListener('playing', onPlaying);

    armWatchdog();

    // Native HLS (Safari / iOS)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => { if (!cancelled) degrade(); });
    } else {
      // hls.js
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { degrade(); return; }
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 10,
          maxBufferLength: 10,
          liveSyncDurationCount: 2,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal && !cancelled) degrade();
        });
        video.play().catch(() => { /* ignore autoplay rejections; user can tap */ });
      }).catch(() => { if (!cancelled) degrade(); });
    }

    return () => {
      cancelled = true;
      clearWatchdog();
      video.removeEventListener('playing', onPlaying);
      if (hls) { try { hls.destroy(); } catch { /* noop */ } }
      video.removeAttribute('src');
      try { video.load(); } catch { /* noop */ }
    };
  }, [activeTier, name, degrade, emit]);

  // -------------------------------------------------------------------------
  // Tier 3: Snapshot polling (last resort)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeTier !== 'snapshot') return;
    emit('snapshot', 'connecting');
    const id = window.setInterval(() => setSnapshotRev((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [activeTier, emit]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (activeTier === 'snapshot') {
    const src = `${getApiBase()}/api/cameras/${encodeURIComponent(name)}/snapshot?r=${snapshotRev}${authQueryParam(true)}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        onLoad={() => emit('snapshot', 'live')}
        onError={() => emit('snapshot', 'failed')}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-contain bg-black"
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

  useEffect(() => {
    if (error) return;
    const t = window.setInterval(() => setRev((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [error]);

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
// Fullscreen player with tier selector
// ---------------------------------------------------------------------------

const TIER_LABEL: Record<Tier, string> = {
  webrtc:   'WebRTC',
  hls:      'HLS',
  snapshot: 'Snapshot',
};

function FullscreenCamera({ cam, onClose }: { cam: CameraInfo; onClose: () => void }) {
  const [mode,       setMode]       = useState<PlayerMode>('auto');
  const [tier,       setTier]       = useState<Tier>('webrtc');
  const [status,     setStatus]     = useState<'connecting' | 'live' | 'failed'>('connecting');
  const frame = useLCARSFrame();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setTier(mode === 'auto' ? 'webrtc' : (mode as Tier));
    setStatus('connecting');
  }, [cam.name, mode]);

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

  const statusText =
    status === 'live'       ? `Live · ${TIER_LABEL[tier]}` :
    status === 'connecting' ? `Connecting · ${TIER_LABEL[tier]}…` :
    `No stream — all tiers failed. Check Diagnostics.`;

  return (
    <div className="flex flex-col bg-black" style={overlayStyle}>
      <div className="relative flex-1">
        {status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          </div>
        )}

        <CameraPlayer
          key={`${cam.name}:${mode}`}
          name={cam.name}
          mode={mode}
          onTierChange={(t, s) => { setTier(t); setStatus(s); }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
          <span className="text-sm font-medium text-white drop-shadow-sm">{cam.label}</span>
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/40 text-[11px] text-white/80 backdrop-blur-sm">
              {(['auto', 'webrtc', 'hls', 'snapshot'] as PlayerMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 transition-colors ${
                    mode === m ? 'bg-white/15 text-white' : 'hover:bg-white/10'
                  }`}
                >
                  {m === 'auto' ? 'Auto' : TIER_LABEL[m as Tier]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
          <span className={`text-[11px] ${status === 'failed' ? 'text-red-300' : 'text-white/60'}`}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics drawer
// ---------------------------------------------------------------------------

interface DiagnosticEntry {
  entryId: string;
  label: string;
  go2rtcUrl: string;
  reachable: boolean;
  httpStatus?: number;
  streamCount: number;
  streamNames: string[];
  error?: string;
  hint?: string;
  autoDiscovery: boolean;
  protectCameraCount?: number;
}

function DiagnosticsPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<DiagnosticEntry[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`${getApiBase()}/api/cameras/diagnostics`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { entries: DiagnosticEntry[] };
        setEntries(data.entries);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="mt-12 w-full max-w-2xl overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2.5">
          <h2 className="text-sm font-semibold">Camera Diagnostics</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 text-sm">
          {error && (
            <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              Could not load diagnostics: {error}
            </div>
          )}

          {!error && entries && entries.length === 0 && (
            <p className="text-xs text-zinc-400">
              No UniFi integration entries configured. Add one in Integrations.
            </p>
          )}

          {!error && entries?.map((e) => (
            <div key={e.entryId} className="mb-3 rounded border border-zinc-700/80 bg-zinc-800/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{e.label}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    e.reachable ? 'bg-emerald-900/60 text-emerald-200' : 'bg-red-900/60 text-red-200'
                  }`}
                >
                  {e.reachable ? 'Reachable' : 'Unreachable'}
                </span>
              </div>
              <dl className="space-y-1 text-xs text-zinc-300">
                <div className="flex gap-2"><dt className="w-28 text-zinc-500">go2rtc URL</dt><dd className="font-mono">{e.go2rtcUrl}</dd></div>
                {e.httpStatus !== undefined && (
                  <div className="flex gap-2"><dt className="w-28 text-zinc-500">HTTP status</dt><dd>{e.httpStatus}</dd></div>
                )}
                <div className="flex gap-2"><dt className="w-28 text-zinc-500">Streams</dt><dd>{e.streamCount}</dd></div>
                <div className="flex gap-2">
                  <dt className="w-28 text-zinc-500">Auto-discovery</dt>
                  <dd>{e.autoDiscovery ? `on (${e.protectCameraCount ?? 0} Protect cameras)` : 'off'}</dd>
                </div>
                {e.streamNames.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-28 text-zinc-500">Stream names</dt>
                    <dd className="font-mono break-all">{e.streamNames.join(', ')}</dd>
                  </div>
                )}
                {e.error && (
                  <div className="mt-2 rounded bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200">
                    {e.error}
                  </div>
                )}
                {e.hint && (
                  <div className="mt-2 rounded bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">
                    {e.hint}
                  </div>
                )}
              </dl>
            </div>
          ))}
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
  const [cameras,        setCameras]        = useState<CameraInfo[]>([]);
  const [fullscreenCam,  setFullscreenCam]  = useState<CameraInfo | null>(null);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [listError,      setListError]      = useState(false);
  const [recovering,     setRecovering]     = useState(false);
  const [showDiag,       setShowDiag]       = useState(false);

  // silence unused warnings on helpers imported but only used transitively
  void authHeaders;

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
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowDiag(true)}
            className="rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Diagnostics
          </button>
        </div>

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

      {showDiag && <DiagnosticsPanel onClose={() => setShowDiag(false)} />}
    </>
  );
}
