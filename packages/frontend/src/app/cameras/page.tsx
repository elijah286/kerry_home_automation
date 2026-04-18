'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings2, Eye, EyeOff } from 'lucide-react';
import { getApiBase, apiFetch, authQueryParam, authHeaders } from '@/lib/api-base';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { useBreadcrumbOverride } from '@/providers/BreadcrumbOverrideProvider';

/**
 * Push a log line into the system terminal / status window. Fire-and-forget —
 * we never block the UI on logging, and we don't surface network failures.
 *
 * `integration` is the key that drives the status-window source filter.
 * All camera log lines use 'unifi' so they group under the existing
 * UniFi filter in the panel — that way the user can downselect to just
 * camera/UniFi events when diagnosing a stream.
 */
const CAMERAS_LOG_INTEGRATION = 'cameras';

function logToStatus(
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
// Camera live player with tiered fallback:
//   1. HLS          — 3–6s latency, works through any HTTP proxy / poor network
//   2. Snapshot     — 2 fps JPEG polling, always works if go2rtc can produce frames
//
// WebRTC stays available as a manual override (useful on LAN with direct go2rtc
// reachability) but is NOT part of the auto fallback — in this deployment ICE
// negotiation through the proxy hasn't been working, and falling through it
// just added ~10s of wait before HLS could start. Auto mode skips it.
//
// While a video tier (HLS/WebRTC) is connecting we keep a snapshot underlay so
// the user sees *something* immediately rather than staring at a black frame
// for the 10+ s HLS cold-start.
// ---------------------------------------------------------------------------

type Tier = 'webrtc' | 'hls' | 'snapshot';
type PlayerMode = 'auto' | Tier;
type PlayerStatus = 'connecting' | 'live' | 'failed';

const AUTO_TIER_ORDER: Tier[] = ['hls', 'snapshot'];
const WEBRTC_WATCHDOG_MS = 10_000;
const HLS_WATCHDOG_MS = 15_000;

function nextAutoTier(t: Tier): Tier | null {
  const i = AUTO_TIER_ORDER.indexOf(t);
  return i >= 0 && i + 1 < AUTO_TIER_ORDER.length ? AUTO_TIER_ORDER[i + 1] : null;
}

function initialTier(mode: PlayerMode): Tier {
  return mode === 'auto' ? AUTO_TIER_ORDER[0] : (mode as Tier);
}

type Quality = 'sd' | 'hd';

function CameraPlayer({
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
          if (data.fatal && !cancelled) degrade();
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
    // 500ms while actively using snapshots as the primary tier; 2000ms (slow)
    // while connecting a video tier — that's just an underlay to cover the
    // black frame during HLS/WebRTC handshake, not a live feed.
    const intervalMs = activeTier === 'snapshot' ? 1000 : 2000;
    const id = window.setInterval(() => setSnapshotRev((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [pollSnapshots, activeTier]);

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
  const showUnderlay = pollSnapshots && activeTier !== 'snapshot';
  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain';

  if (activeTier === 'snapshot') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={snapshotSrc}
        alt=""
        className={`absolute inset-0 h-full w-full ${fitClass}`}
        onLoad={() => emit('snapshot', 'live')}
        onError={() => emit('snapshot', 'failed')}
      />
    );
  }

  return (
    <>
      {showUnderlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshotSrc}
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
// Camera data + settings persistence
// ---------------------------------------------------------------------------

interface CameraInfo {
  name: string;
  label: string;
  /** True when the backend has a registered `{name}_hd` stream available */
  hasHd?: boolean;
}

interface CameraSettings {
  columns: number;
  hidden: string[]; // camera names to hide from the grid
}

const SETTINGS_KEY = 'cameras-grid-settings';
const DEFAULT_SETTINGS: CameraSettings = { columns: 4, hidden: [] };
const COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

function loadSettings(): CameraSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CameraSettings>;
    const columns = COLUMN_OPTIONS.includes(parsed.columns as 1 | 2 | 3 | 4 | 5 | 6)
      ? (parsed.columns as number)
      : DEFAULT_SETTINGS.columns;
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((x): x is string => typeof x === 'string') : [];
    return { columns, hidden };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: CameraSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

// ---------------------------------------------------------------------------
// Camera tile — reuses CameraPlayer in auto mode, so every tile starts on HLS
// as soon as the stream is ready and shows a snapshot underlay while it warms
// up. Still gated by page + viewport visibility: off-screen / backgrounded
// tiles drop down to a single static snapshot so we're not running 9 live
// ffmpeg pipelines when the user isn't looking.
// ---------------------------------------------------------------------------

const CameraTile = memo(function CameraTile({
  cam,
  onSelect,
}: {
  cam: CameraInfo;
  onSelect: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [inView,  setInView]  = useState(true);
  const [tier,    setTier]    = useState<Tier>(() => initialTier('auto'));
  const [status,  setStatus]  = useState<PlayerStatus>('connecting');
  const [idleRev, setIdleRev] = useState(0);
  const tileRef = useRef<HTMLDivElement | null>(null);

  // Track page visibility (tab switched away / browser minimized)
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Track viewport visibility (scrolled off-screen)
  useEffect(() => {
    if (!tileRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01 },
    );
    obs.observe(tileRef.current);
    return () => obs.disconnect();
  }, []);

  const active = visible && inView;

  // When the tile is NOT active, refresh the static snapshot every 10s so
  // the grid doesn't show a completely frozen image after a long idle.
  useEffect(() => {
    if (active) return;
    const t = window.setInterval(() => setIdleRev((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, [active]);

  return (
    <div
      ref={tileRef}
      className="relative aspect-video cursor-pointer overflow-hidden rounded-sm bg-black"
      onClick={onSelect}
    >
      {active ? (
        <CameraPlayer
          name={cam.name}
          mode="auto"
          quality="sd"
          fit="cover"
          // Always-on fresh snapshot requests. CameraPlayer only polls snapshots
          // while HLS is warming up or has failed — so this is a no-op most of
          // the time. While it IS polling, `?fresh=500` tells the backend to
          // bypass its 1s cache and pull a new frame from go2rtc, pinning
          // tile-underlay update rate at ~2fps instead of being gated by the
          // shared poll cycle (which can slip past 1s under iGPU load).
          highFrequencySnapshots
          onTierChange={(t, s) => { setTier(t); setStatus(s); }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${idleRev}${authQueryParam(true)}`}
          alt={cam.label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {active && status === 'failed' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <span className="text-[11px] text-zinc-500">No signal</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
        <span className="text-xs font-medium text-white drop-shadow-sm">{cam.label}</span>
        {active && tier === 'hls' && status === 'live' && (
          <span className="rounded bg-red-500/85 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            Live
          </span>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Fullscreen player
// ---------------------------------------------------------------------------

const TIER_LABEL: Record<Tier, string> = {
  webrtc:   'WebRTC',
  hls:      'HLS',
  snapshot: 'Snapshot',
};

/**
 * Large in-page camera player. Renders inside the normal page chrome (no
 * fixed/overlay positioning) so the app shell, header, and status window
 * stay visible around it.
 *
 * Mode and quality are controlled externally (lifted to CamerasPage and
 * surfaced in the settings sidebar) so this component only handles playback.
 */
function InlineCameraPlayer({
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
      {/* Player — fills the content area vertically but never scrolls the page */}
      <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ height: 'calc(100vh - 12rem)', minHeight: '300px' }}>
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

      <div className="flex items-center gap-2 text-xs">
        <span className={status === 'failed' ? 'text-red-400' : 'text-zinc-400'}>
          {statusText}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings panel (right sidebar via SlidePanel)
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

function SettingsPanel({
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
                {(['auto', 'webrtc', 'hls', 'snapshot'] as PlayerMode[]).map((m) => (
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
                  {COLUMN_OPTIONS.map((n) => (
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
  const [showSettings,   setShowSettings]   = useState(false);
  const [settings,       setSettings]       = useState<CameraSettings>(DEFAULT_SETTINGS);
  const [playerMode,     setPlayerMode]     = useState<PlayerMode>('auto');
  const [playerQuality,  setPlayerQuality]  = useState<Quality>('sd');

  const { setExtra } = useBreadcrumbOverride();

  // Inject camera name as extra breadcrumb while a camera is open.
  useEffect(() => {
    if (fullscreenCam) {
      setExtra([{ href: '/cameras', label: fullscreenCam.label, current: true }]);
    } else {
      setExtra([]);
    }
    return () => setExtra([]);
  }, [fullscreenCam, setExtra]);

  // Reset mode/quality to defaults when switching cameras.
  useEffect(() => {
    setPlayerMode('auto');
    setPlayerQuality(fullscreenCam?.hasHd ? 'hd' : 'sd');
  }, [fullscreenCam]);

  // silence unused warning on helper re-exported for other callers
  void authHeaders;

  // Hydrate settings from localStorage after mount (avoids SSR mismatch).
  useEffect(() => { setSettings(loadSettings()); }, []);

  const updateSettings = useCallback((next: CameraSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

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

  // Open a camera in fullscreen when ?open=<name> is in the URL.
  // Lets the assistant navigate directly to a specific camera view, e.g.
  //   /cameras?open=living_room
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const target = searchParams.get('open');
    if (!target || cameras.length === 0) return;
    // Match by exact name, then case-insensitive name, then label contains.
    const needle = target.toLowerCase();
    const match =
      cameras.find((c) => c.name === target) ??
      cameras.find((c) => c.name.toLowerCase() === needle) ??
      cameras.find((c) => c.label.toLowerCase().includes(needle));
    if (match) {
      setFullscreenCam(match);
      // Strip the param from the URL so back/refresh doesn't re-trigger
      const params = new URLSearchParams(searchParams.toString());
      params.delete('open');
      const q = params.toString();
      router.replace(q ? `/cameras?${q}` : '/cameras');
    }
  }, [cameras, searchParams, router]);

  const onRecover = () => {
    setRecovering(true);
    apiFetch(`${getApiBase()}/api/cameras/recover`, { method: 'POST' })
      .finally(() => {
        setRecovering(false);
        loadCameras();
      });
  };

  const visibleCameras = useMemo(() => {
    const hidden = new Set(settings.hidden);
    return cameras.filter((c) => !hidden.has(c.name));
  }, [cameras, settings.hidden]);

  const showEmptyHint = cameras.length === 0 && !listError;
  const allHidden = cameras.length > 0 && visibleCameras.length === 0;

  return (
    <>
      <div className="p-2 lg:p-3">
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-[11px] text-zinc-500">
            {visibleCameras.length} of {cameras.length} shown · {settings.columns} cols
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
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
        {allHidden && !fullscreenCam && (
          <div className="mb-3 rounded-md border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
            All cameras are hidden. Open Settings to show some.
          </div>
        )}

        {fullscreenCam ? (
          <InlineCameraPlayer
            cam={fullscreenCam}
            onClose={() => setFullscreenCam(null)}
            mode={playerMode}
            quality={playerQuality}
          />
        ) : (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))` }}
          >
            {visibleCameras.map((cam) => (
              <CameraTile
                key={cam.name}
                cam={cam}
                onSelect={() => setFullscreenCam(cam)}
              />
            ))}
          </div>
        )}
      </div>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        cameras={cameras}
        settings={settings}
        onChange={updateSettings}
        selectedCam={fullscreenCam}
        mode={playerMode}
        quality={playerQuality}
        onModeChange={setPlayerMode}
        onQualityChange={setPlayerQuality}
      />
    </>
  );
}
