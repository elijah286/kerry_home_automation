'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getApiBase, apiFetch, authQueryParam, authHeaders } from '@/lib/api-base';
import { SlidePanel } from '@/components/ui/SlidePanel';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export const CAMERAS_LOG_INTEGRATION = 'cameras';

export function logToStatus(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
  integration: string = CAMERAS_LOG_INTEGRATION,
): void {
  try {
    void apiFetch(`${getApiBase()}/api/system/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, integration, source: 'cameras-ui', message, meta }),
    }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 'webrtc' | 'hls' | 'snapshot';
export type PlayerMode = 'auto' | Tier;
export type PlayerStatus = 'connecting' | 'live' | 'failed';
export type Quality = 'sd' | 'hd';

export interface CameraInfo {
  name: string;
  label: string;
  /** True when the backend has a registered `{name}_hd` stream available */
  hasHd?: boolean;
}

export interface CameraSettings {
  columns: number;
  hidden: string[]; // camera names to hide from the grid
}

export interface DiagnosticEntry {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_TIER_ORDER: Tier[] = ['hls', 'snapshot'];
export const WEBRTC_WATCHDOG_MS = 10_000;
// go2rtc cold-starts ffmpeg on demand; waiting for the first keyframe on a
// 4K H.265 stream can take 20-30s. Give it 45s before giving up.
export const HLS_WATCHDOG_MS = 45_000;

export const TIER_LABEL: Record<Tier, string> = {
  webrtc:   'WebRTC',
  hls:      'HLS',
  snapshot: 'Snapshot',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nextAutoTier(t: Tier): Tier | null {
  const i = AUTO_TIER_ORDER.indexOf(t);
  return i >= 0 && i + 1 < AUTO_TIER_ORDER.length ? AUTO_TIER_ORDER[i + 1] : null;
}

export function initialTier(mode: PlayerMode): Tier {
  return mode === 'auto' ? AUTO_TIER_ORDER[0] : (mode as Tier);
}

/**
 * Module-level cache of the last successfully-loaded snapshot URL per camera.
 * Persists across component unmount/mount so navigating from a grid tile
 * (which has been polling snapshots for that camera) into the fullscreen
 * page mounts with a valid `<img src>` on the very first render — no
 * black-screen delay while we wait for the first tunnel round-trip.
 *
 * Key = camera name. Value = the full URL of the last frame that loaded.
 */
const lastGoodSnapshotUrl = new Map<string, string>();

/**
 * Keeps the last successfully-loaded snapshot URL so a transient fetch error
 * never blanks the display. Uses an off-DOM Image to pretest each new URL;
 * only swaps the visible src once the frame actually arrives.
 *
 * `cameraName` shares a cache across the grid tile and fullscreen player so
 * clicking into a camera shows the most recent good frame instantly while
 * the first live snapshot is still in flight.
 */
export function useStableSnapshotSrc(liveSrc: string, cameraName?: string): string {
  const [stable, setStable] = useState<string>(() =>
    cameraName ? (lastGoodSnapshotUrl.get(cameraName) ?? '') : '',
  );
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setStable(img.src);
      if (cameraName) lastGoodSnapshotUrl.set(cameraName, img.src);
    };
    img.src = liveSrc;
    return () => { cancelled = true; };
  }, [liveSrc, cameraName]);
  return stable;
}

// silence unused warning on helper re-exported for other callers
void authHeaders;

// ---------------------------------------------------------------------------
// CameraPlayer
// ---------------------------------------------------------------------------

export function CameraPlayer({
  name,
  mode,
  quality = 'sd',
  fit = 'contain',
  highFrequencySnapshots = false,
  onTierChange,
  onError,
}: {
  name: string;
  mode: PlayerMode;
  /** 'sd' = low-res sub-stream (default, low CPU); 'hd' = high-res main stream */
  quality?: Quality;
  /** 'contain' = letterbox (fullscreen); 'cover' = fill (grid tiles). */
  fit?: 'contain' | 'cover';
  /**
   * Fullscreen mode flag. When true, the snapshot underlay requests fresh
   * frames at 2fps (bypasses the shared 1s backend cache with ?fresh=500)
   * so the user gets responsive live updates while HLS is warming up.
   * Grid tiles leave this false to stay on the shared cached frames.
   */
  highFrequencySnapshots?: boolean;
  onTierChange?: (tier: Tier, status: PlayerStatus) => void;
  onError?: () => void;
}) {
  // The go2rtc stream name is the camera name with an `_hd` suffix for HD.
  // Snapshot endpoint intentionally uses the base name — snapshots are
  // served from the backend cache populated by low-res polling.
  const streamName = quality === 'hd' ? `${name}_hd` : name;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTier, setActiveTier] = useState<Tier>(() => initialTier(mode));
  const [status, setStatus] = useState<PlayerStatus>('connecting');
  const [snapshotRev, setSnapshotRev] = useState(0);
  const tierRef = useRef(activeTier);
  tierRef.current = activeTier;

  // Stabilize callbacks so tier effects don't re-run on every parent re-render.
  const onTierChangeRef = useRef(onTierChange);
  onTierChangeRef.current = onTierChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const emit = useCallback((t: Tier, s: PlayerStatus) => {
    setStatus(s);
    onTierChangeRef.current?.(t, s);
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info(`[camera:${streamName}] ${t} → ${s}`);
    }
  }, [streamName]);

  // Reset to the user-selected starting tier whenever stream or mode changes.
  useEffect(() => {
    setActiveTier(initialTier(mode));
  }, [streamName, mode]);

  // Degrade one tier. In 'auto' mode drops to the next auto fallback; in a
  // forced mode the user asked for a specific tier so we don't override it.
  const degrade = useCallback(() => {
    if (mode !== 'auto') {
      logToStatus('warn', `Camera ${streamName}: forced tier '${tierRef.current}' failed`, { camera: streamName, tier: tierRef.current });
      emit(tierRef.current, 'failed');
      onErrorRef.current?.();
      return;
    }
    const next = nextAutoTier(tierRef.current);
    if (next) {
      logToStatus('info', `Camera ${streamName}: ${tierRef.current} failed, falling back to ${next}`, { camera: streamName, from: tierRef.current, to: next });
      setActiveTier(next);
    } else {
      logToStatus('error', `Camera ${streamName}: all streaming tiers failed`, { camera: streamName });
      emit(tierRef.current, 'failed');
      onErrorRef.current?.();
    }
  }, [mode, streamName, emit]);

  // -------------------------------------------------------------------------
  // Tier 1 (manual only): WebRTC
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
          (video.srcObject as MediaStream).addTrack(ev.track);
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

        const res = await apiFetch(`${getApiBase()}/api/cameras/${encodeURIComponent(streamName)}/webrtc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp ?? '',
        });
        if (!res.ok) throw new Error(`WebRTC SDP ${res.status}`);
        const answerSdp = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        const video = videoRef.current;
        if (video) {
          const onPlaying = () => {
            clearWatchdog();
            if (!cancelled) emit('webrtc', 'live');
          };
          video.addEventListener('playing', onPlaying, { once: true });

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
  }, [activeTier, streamName, degrade, emit]);

  // -------------------------------------------------------------------------
  // Tier 1 (auto default): HLS
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeTier !== 'hls') return;
    emit('hls', 'connecting');

    const video = videoRef.current;
    if (!video) return;

    const src = `${getApiBase()}/api/cameras/${encodeURIComponent(streamName)}/hls/stream.m3u8${authQueryParam(false)}`;
    let hls: import('hls.js').default | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clearWatchdog = () => {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    };
    watchdog = setTimeout(() => { if (!cancelled) degrade(); }, HLS_WATCHDOG_MS);

    const onPlaying = () => {
      clearWatchdog();
      if (!cancelled) emit('hls', 'live');
    };
    video.addEventListener('playing', onPlaying);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => { if (!cancelled) degrade(); });
    } else {
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { degrade(); return; }
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 10,
          maxBufferLength: 10,
          liveSyncDurationCount: 2,
          // go2rtc cold-starts ffmpeg on demand — the first M3U8 may be empty
          // while ffmpeg is initialising. Give hls.js enough retries so it
          // stays patient through the warm-up window (each retry is ~2s apart,
          // so 20 retries × 2s = 40s, matching our 45s watchdog).
          manifestLoadingMaxRetry: 20,
          manifestLoadingRetryDelay: 2000,
          levelLoadingMaxRetry: 20,
          levelLoadingRetryDelay: 2000,
          fragLoadingMaxRetry: 20,
          fragLoadingRetryDelay: 2000,
          // Propagate auth (Bearer token for remote access, cookies for local)
          // to every segment/playlist request — hls.js does its own XHRs.
          xhrSetup: (xhr) => {
            const headers = authHeaders();
            for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
            xhr.withCredentials = true;
          },
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || cancelled) return;
          // For network errors, hls.js can recover by retrying — don't give up
          // immediately. Only degrade on media errors or if the library itself
          // has exhausted its own retry budget and marked the error fatal.
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else if (data.type !== Hls.ErrorTypes.NETWORK_ERROR) {
            degrade();
          }
          // NETWORK_ERROR: let hls.js retry via manifestLoadingMaxRetry above.
          // The 45s watchdog is the hard deadline.
        });
        video.play().catch(() => { /* autoplay restriction — user can tap */ });
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
  }, [activeTier, streamName, degrade, emit]);

  // -------------------------------------------------------------------------
  // Snapshot polling — used as tier 2 AND as an underlay while HLS/WebRTC
  // warm up, so the user never stares at a black frame.
  // -------------------------------------------------------------------------
  const pollSnapshots = activeTier === 'snapshot' || status === 'connecting';

  useEffect(() => {
    if (!pollSnapshots) return;
    // highFrequencySnapshots (fullscreen): 500ms for both underlay and snapshot tier
    // so the user gets ~2fps live preview while HLS is warming up.
    // Grid tiles (highFrequencySnapshots=false): 1s for snapshot tier, 2s underlay.
    const intervalMs = highFrequencySnapshots ? 500 : (activeTier === 'snapshot' ? 1000 : 2000);
    const id = window.setInterval(() => setSnapshotRev((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [pollSnapshots, activeTier, highFrequencySnapshots]);

  useEffect(() => {
    if (activeTier === 'snapshot') emit('snapshot', 'connecting');
  }, [activeTier, emit]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  // Fullscreen (highFrequencySnapshots=true) requests `fresh=500` so the
  // backend bypasses its 1s cache and fetches a new frame from go2rtc when
  // our 500ms polling rolls around — net effect: 2fps live preview while
  // HLS warms up, vs the cached ~1fps tiles get.
  const freshParam = highFrequencySnapshots ? '&fresh=500' : '';
  const snapshotSrc = `${getApiBase()}/api/cameras/${encodeURIComponent(name)}/snapshot?r=${snapshotRev}${freshParam}${authQueryParam(true)}`;
  const stableSnapshotSrc = useStableSnapshotSrc(snapshotSrc, name);
  const showUnderlay = pollSnapshots && activeTier !== 'snapshot';
  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain';

  // Emit 'live' whenever a fresh snapshot successfully loads while in snapshot tier.
  useEffect(() => {
    if (stableSnapshotSrc && activeTier === 'snapshot') emit('snapshot', 'live');
  }, [stableSnapshotSrc, activeTier, emit]);

  if (activeTier === 'snapshot') {
    return stableSnapshotSrc ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={stableSnapshotSrc}
        alt=""
        className={`absolute inset-0 h-full w-full ${fitClass}`}
      />
    ) : null;
  }

  return (
    <>
      {showUnderlay && stableSnapshotSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stableSnapshotSrc}
          alt=""
          className={`absolute inset-0 h-full w-full ${fitClass}`}
        />
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full ${fitClass} bg-black transition-opacity ${
          status === 'live' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// InlineCameraPlayer
// ---------------------------------------------------------------------------

/**
 * Large in-page camera player. Renders inside the normal page chrome (no
 * fixed/overlay positioning) so the app shell, header, and status window
 * stay visible around it.
 *
 * Mode and quality are controlled externally (lifted to the parent page and
 * surfaced in the settings sidebar) so this component only handles playback.
 */
export function InlineCameraPlayer({
  cam,
  onClose,
  mode,
  quality,
}: {
  cam: CameraInfo;
  onClose: () => void;
  mode: PlayerMode;
  quality: Quality;
}) {
  const [tier,   setTier]   = useState<Tier>(() => initialTier(mode));
  const [status, setStatus] = useState<PlayerStatus>('connecting');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setTier(initialTier(mode));
    setStatus('connecting');
  }, [cam.name, mode, quality]);

  const statusText =
    status === 'live'       ? `Live · ${TIER_LABEL[tier]}` :
    status === 'connecting' ? `Connecting · ${TIER_LABEL[tier]}…` :
    `No stream — all tiers failed. Check the status window for details.`;

  return (
    <div className="flex flex-col gap-2">
      {/* Player — aspect-ratio constrained so the full frame is always visible.
          max-height keeps it from overflowing on tall/narrow viewports. */}
      <div
        className="relative w-full overflow-hidden rounded-md bg-black"
        style={{ maxHeight: 'calc(100dvh - 9rem)' }}
      >
        <div className="aspect-video w-full relative">
          <CameraPlayer
            key={`${cam.name}:${mode}:${quality}`}
            name={cam.name}
            mode={mode}
            quality={quality}
            highFrequencySnapshots={status === 'connecting'}
            onTierChange={(t, s) => { setTier(t); setStatus(s); }}
          />

          {status === 'connecting' && (
            <div className="pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/90">Live in…</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className={status === 'failed' ? 'text-red-400' : 'text-zinc-400'}>
          {statusText}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

export function SettingsPanel({
  open,
  onClose,
  cameras,
  settings,
  onChange,
  selectedCam,
  mode,
  quality,
  onModeChange,
  onQualityChange,
  columnOptions,
}: {
  open: boolean;
  onClose: () => void;
  cameras: CameraInfo[];
  settings: CameraSettings;
  onChange: (s: CameraSettings) => void;
  selectedCam: CameraInfo | null;
  mode: PlayerMode;
  quality: Quality;
  onModeChange: (m: PlayerMode) => void;
  onQualityChange: (q: Quality) => void;
  columnOptions?: readonly number[];
}) {
  const hiddenSet = useMemo(() => new Set(settings.hidden), [settings.hidden]);
  const [diag, setDiag] = useState<DiagnosticEntry[] | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const setColumns = (n: number) => onChange({ ...settings, columns: n });
  const toggleHidden = (name: string) => {
    const next = new Set(hiddenSet);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange({ ...settings, hidden: [...next] });
  };
  const showAll  = () => onChange({ ...settings, hidden: [] });
  const hideAll  = () => onChange({ ...settings, hidden: cameras.map((c) => c.name) });

  const loadDiag = useCallback(() => {
    setDiagLoading(true);
    apiFetch(`${getApiBase()}/api/cameras/diagnostics`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { entries: DiagnosticEntry[] };
        setDiag(data.entries);
        setDiagError(null);
      })
      .catch((e) => setDiagError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDiagLoading(false));
  }, []);

  useEffect(() => { if (open) loadDiag(); }, [open, loadDiag]);

  const panelTitle = selectedCam ? selectedCam.label : 'Camera Settings';

  const colOpts = columnOptions ?? [1, 2, 3, 4, 5, 6];

  return (
    <SlidePanel open={open} onClose={onClose} title={panelTitle} size="md">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 text-sm">

          {selectedCam ? (
            /* ── Per-camera view: stream options only ─────────────────── */
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Stream Mode
              </h3>
              <div className="flex flex-wrap gap-1">
                {(['auto', 'hls', 'snapshot'] as PlayerMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onModeChange(m)}
                    className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === m
                        ? 'border-zinc-300 bg-zinc-100 text-zinc-900'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {m === 'auto' ? 'Auto' : TIER_LABEL[m as Tier]}
                  </button>
                ))}
              </div>

              {selectedCam.hasHd && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Quality
                  </h3>
                  <div className="flex gap-1">
                    {(['sd', 'hd'] as Quality[]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onQualityChange(q)}
                        className={`rounded border px-4 py-1.5 text-xs font-medium uppercase transition-colors ${
                          quality === q
                            ? 'border-zinc-300 bg-zinc-100 text-zinc-900'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            /* ── Grid view: columns + camera visibility ────────────────── */
            <>
              {/* Columns */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Grid Columns
                </h3>
                <div className="flex gap-1">
                  {colOpts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setColumns(n)}
                      className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                        settings.columns === n
                          ? 'border-zinc-300 bg-zinc-100 text-zinc-900'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </section>

              {/* Camera visibility */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Cameras ({cameras.length - hiddenSet.size}/{cameras.length})
                  </h3>
                  <div className="flex gap-1 text-[11px]">
                    <button type="button" onClick={showAll} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
                      Show all
                    </button>
                    <button type="button" onClick={hideAll} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800">
                      Hide all
                    </button>
                  </div>
                </div>
                {cameras.length === 0 ? (
                  <p className="text-xs text-zinc-500">No cameras discovered yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {cameras.map((cam) => {
                      const hidden = hiddenSet.has(cam.name);
                      return (
                        <li key={cam.name}>
                          <button
                            type="button"
                            onClick={() => toggleHidden(cam.name)}
                            className={`flex w-full items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors ${
                              hidden
                                ? 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
                            }`}
                          >
                            <span className="truncate">{cam.label}</span>
                            {hidden ? <EyeOff className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}

          {/* Diagnostics — always visible */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Diagnostics
              </h3>
              <button
                type="button"
                onClick={loadDiag}
                disabled={diagLoading}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {diagLoading ? 'Checking…' : 'Refresh'}
              </button>
            </div>
            {diagError && (
              <div className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200">
                {diagError}
              </div>
            )}
            {!diagError && diag && diag.length === 0 && (
              <p className="text-xs text-zinc-500">No UniFi entries configured.</p>
            )}
            {!diagError && diag?.map((e) => (
              <div key={e.entryId} className="mb-2 rounded border border-zinc-700/80 bg-zinc-800/40 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-100">{e.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    e.reachable ? 'bg-emerald-900/60 text-emerald-200' : 'bg-red-900/60 text-red-200'
                  }`}>
                    {e.reachable ? 'OK' : 'Down'}
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-zinc-400">
                  <div><span className="text-zinc-500">URL:</span> <span className="font-mono">{e.go2rtcUrl}</span></div>
                  <div><span className="text-zinc-500">Streams:</span> {e.streamCount}</div>
                  {e.autoDiscovery && (
                    <div><span className="text-zinc-500">Protect cams:</span> {e.protectCameraCount ?? 0}</div>
                  )}
                </div>
                {e.error && <div className="mt-1.5 rounded bg-red-950/40 px-2 py-1 text-[10px] text-red-200">{e.error}</div>}
                {e.hint && <div className="mt-1.5 rounded bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200">{e.hint}</div>}
              </div>
            ))}
          </section>
        </div>
      </div>
    </SlidePanel>
  );
}
