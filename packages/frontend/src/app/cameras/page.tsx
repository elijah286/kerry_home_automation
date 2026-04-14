'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { X } from 'lucide-react';
import { getApiBase, getWsBase } from '@/lib/api-base';

// ---------------------------------------------------------------------------
// MSE stream — fMP4 over WebSocket (invisible until frames actually play)
// Fault-tolerance:
//   • Unlimited retries with exponential backoff (capped at 60 s)
//   • Video-progress watchdog: reconnects if currentTime freezes for >12 s
//   • Page-visibility reconnect: wakes up when tab becomes active again
//   • 30 s data-silence timeout on the WebSocket itself
// ---------------------------------------------------------------------------

const MSE_BASE_DELAY    = 2_000;
const MSE_MAX_BACKOFF   = 60_000;
const MSE_DATA_TIMEOUT  = 30_000;
const PROGRESS_CHECK_MS = 5_000;
const PROGRESS_STALL_MS = 12_000;

function MSEStream({
  name,
  onPlaying,
  onOffline,
}: {
  name: string;
  onPlaying?: () => void;
  onOffline?: () => void;
}) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const onOfflineRef = useRef(onOffline);
  onOfflineRef.current = onOffline;

  const [visible,  setVisible]  = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retriesRef = useRef(0);
  /** Stays true while video is actively playing — readable from other effects. */
  const playingRef = useRef(false);

  // Page-visibility reconnect: if the stream died while the tab was hidden,
  // kick a fresh attempt as soon as the user comes back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !playingRef.current) {
        retriesRef.current = 0;
        setRetryKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !window.MediaSource) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let sourceBuffer: SourceBuffer | null = null;
    let ws: WebSocket | null = null;
    let queue: ArrayBuffer[] = [];
    let disposed = false;
    let dataTimeout: ReturnType<typeof setTimeout>   | null = null;
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let lastCurrentTime = -1;
    let lastProgressTime = 0;

    const clearDataTimeout = () => {
      if (dataTimeout) { clearTimeout(dataTimeout); dataTimeout = null; }
    };
    const resetDataTimeout = () => {
      clearDataTimeout();
      dataTimeout = setTimeout(() => {
        if (!disposed && ws?.readyState === WebSocket.OPEN) ws.close();
      }, MSE_DATA_TIMEOUT);
    };

    const flushQueue = () => {
      if (disposed || !sourceBuffer || sourceBuffer.updating || queue.length === 0) return;
      const chunk = queue.shift()!;
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch {
        queue.unshift(chunk);
      }
    };

    const onUpdateEnd = () => {
      if (disposed || !sourceBuffer) return;
      flushQueue();
      if (sourceBuffer.buffered.length > 0) {
        const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
        if (end > 10) {
          try { sourceBuffer.remove(0, end - 5); } catch { /* ignore */ }
        }
      }
    };

    const ensureSourceBuffer = (mime: string) => {
      if (disposed || sourceBuffer) return;
      if (!MediaSource.isTypeSupported(mime)) {
        console.warn('MSE codec not supported:', mime);
        return;
      }
      try {
        sourceBuffer = ms.addSourceBuffer(mime);
        sourceBuffer.mode = 'segments';
        sourceBuffer.addEventListener('updateend', onUpdateEnd);
        flushQueue();
        void video.play().catch(() => {});
      } catch (err) {
        console.warn('MSE source buffer creation failed:', err);
      }
    };

    const appendBinary = (data: ArrayBuffer) => {
      if (!sourceBuffer) {
        queue.push(data);
        return;
      }
      if (sourceBuffer.updating || queue.length > 0) {
        if (queue.length > 10) queue.splice(0, queue.length - 5);
        queue.push(data);
      } else {
        try {
          sourceBuffer.appendBuffer(data);
        } catch {
          queue.push(data);
        }
      }
      void video.play().catch(() => {});
    };

    /** Always retry — exponential backoff capped at MSE_MAX_BACKOFF. */
    const scheduleRetry = () => {
      if (disposed) return;
      const attempt = retriesRef.current;
      retriesRef.current = attempt + 1;
      const delay = Math.min(MSE_BASE_DELAY * 2 ** Math.min(attempt, 5), MSE_MAX_BACKOFF);
      setTimeout(() => { if (!disposed) setRetryKey((k) => k + 1); }, delay);
    };

    ms.addEventListener('sourceopen', () => {
      if (disposed) return;

      ws = new WebSocket(`${getWsBase()}/api/cameras/${encodeURIComponent(name)}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => resetDataTimeout();

      ws.onmessage = (ev) => {
        if (disposed) return;
        resetDataTimeout();
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data) as { type?: string; value?: unknown };
            if (msg.type === 'mse' && typeof msg.value === 'string') {
              ensureSourceBuffer(msg.value);
            } else if (msg.type === 'error') {
              console.warn('go2rtc:', msg.value);
            }
          } catch { /* ignore non-JSON text */ }
          return;
        }
        appendBinary(ev.data as ArrayBuffer);
      };

      ws.onerror = () => ws?.close();

      ws.onclose = () => {
        clearDataTimeout();
        if (disposed) return;
        playingRef.current = false;
        setVisible(false);
        onOfflineRef.current?.();
        scheduleRetry();
      };
    });

    // Once playing: reset retry counter, show video, start frozen-frame watchdog.
    const onPlayingHandler = () => {
      playingRef.current = true;
      setVisible(true);
      retriesRef.current = 0;
      onPlayingRef.current?.();

      lastCurrentTime  = video.currentTime;
      lastProgressTime = Date.now();

      progressInterval = setInterval(() => {
        if (disposed) return;

        // Re-kick play() if the browser suspended it (e.g. background tab policy).
        if (video.paused) {
          void video.play().catch(() => {});
          // Reset the stall clock so an autoplay resume doesn't look like a freeze.
          lastProgressTime = Date.now();
          return;
        }

        const ct  = video.currentTime;
        const now = Date.now();
        if (ct > lastCurrentTime) {
          lastCurrentTime  = ct;
          lastProgressTime = now;
        } else if (now - lastProgressTime > PROGRESS_STALL_MS) {
          // currentTime hasn't advanced — stream is frozen; force reconnect.
          ws?.close();
        }
      }, PROGRESS_CHECK_MS);
    };

    video.addEventListener('playing', onPlayingHandler, { once: true });

    return () => {
      disposed = true;
      playingRef.current = false;
      setVisible(false);
      // Let the tile show snapshot/MJPEG again during reconnect or name change — otherwise
      // msePlaying stays true while the new <video> is still at opacity 0 → black tiles.
      onOfflineRef.current?.();
      clearDataTimeout();
      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
      ws?.close();
      queue = [];
      video.removeEventListener('playing', onPlayingHandler);
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [name, retryKey]);

  if (typeof window !== 'undefined' && !window.MediaSource) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
      style={{ zIndex: 2, opacity: visible ? 1 : 0 }}
    />
  );
}

// ---------------------------------------------------------------------------
// WebRTC — hidden until video actually plays; retries on failure / ICE drop
// ---------------------------------------------------------------------------

const WEBRTC_BASE_DELAY  = 2_000;
const WEBRTC_MAX_BACKOFF = 45_000;

function WebRTCStream({
  name,
  onPlaying,
  onOffline,
}: {
  name: string;
  onPlaying?: () => void;
  onOffline?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const onOfflineRef = useRef(onOffline);
  onOfflineRef.current = onOffline;
  const [visible,  setVisible]  = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const playingRef = useRef(false);
  const retriesRef = useRef(0);
  const iceDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Page-visibility reconnect
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !playingRef.current) {
        retriesRef.current = 0;
        setRetryKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      if (ev.streams[0]) video.srcObject = ev.streams[0];
    };

    const scheduleRetry = () => {
      if (disposed) return;
      const attempt = retriesRef.current;
      retriesRef.current = attempt + 1;
      const delay = Math.min(WEBRTC_BASE_DELAY * 2 ** Math.min(attempt, 5), WEBRTC_MAX_BACKOFF);
      setTimeout(() => { if (!disposed) setRetryKey((k) => k + 1); }, delay);
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() =>
        fetch(`${getApiBase()}/api/cameras/${encodeURIComponent(name)}/webrtc`, {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription!.sdp,
        }),
      )
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          console.warn('Camera WebRTC:', res.status, text.slice(0, 200));
          throw new Error(`webrtc ${res.status}`);
        }
        return text;
      })
      .then((sdp) => pc.setRemoteDescription({ type: 'answer', sdp }))
      .catch((err) => {
        if (!disposed) {
          console.warn('Camera WebRTC negotiation failed:', err);
          scheduleRetry();
        }
      });

    pc.onconnectionstatechange = () => {
      if (disposed) return;
      const s = pc.connectionState;
      if (s === 'connected' || s === 'connecting') {
        retriesRef.current = 0;
      }
      if (s === 'failed') {
        playingRef.current = false;
        setVisible(false);
        onOfflineRef.current?.();
        scheduleRetry();
      }
    };

    // `disconnected` is often brief; only retry if it doesn't recover quickly.
    pc.oniceconnectionstatechange = () => {
      if (disposed) return;
      const ice = pc.iceConnectionState;
      if (ice === 'connected' || ice === 'completed') {
        if (iceDisconnectTimerRef.current) {
          clearTimeout(iceDisconnectTimerRef.current);
          iceDisconnectTimerRef.current = null;
        }
        return;
      }
      if (ice === 'disconnected' && !iceDisconnectTimerRef.current) {
        iceDisconnectTimerRef.current = setTimeout(() => {
          iceDisconnectTimerRef.current = null;
          if (disposed || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
          playingRef.current = false;
          setVisible(false);
          onOfflineRef.current?.();
          try { pc.close(); } catch { /* ignore */ }
          scheduleRetry();
        }, 8_000);
      }
      if (ice === 'failed') {
        playingRef.current = false;
        setVisible(false);
        onOfflineRef.current?.();
        scheduleRetry();
      }
    };

    const onPlayingHandler = () => {
      if (!disposed) {
        playingRef.current = true;
        retriesRef.current = 0;
        setVisible(true);
        onPlayingRef.current?.();
      }
    };
    video.addEventListener('playing', onPlayingHandler, { once: true });

    return () => {
      disposed = true;
      playingRef.current = false;
      setVisible(false);
      onOfflineRef.current?.();
      if (iceDisconnectTimerRef.current) {
        clearTimeout(iceDisconnectTimerRef.current);
        iceDisconnectTimerRef.current = null;
      }
      video.removeEventListener('playing', onPlayingHandler);
      try { video.srcObject = null; } catch { /* ignore */ }
      pc.close();
    };
  }, [name, retryKey]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
      style={{
        zIndex: 3,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
      }}
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
// Camera tile — snapshot fallback (always polling) + MSE when it works
// ---------------------------------------------------------------------------

const CameraTile = memo(function CameraTile({
  cam,
  onSelect,
}: {
  cam: CameraInfo;
  onSelect: () => void;
}) {
  const [snapshotRev, setSnapshotRev] = useState(0);
  const [snapLoaded,  setSnapLoaded]  = useState(false);
  const [msePlaying,  setMsePlaying]  = useState(false);
  const [error,       setError]       = useState(false);

  const hideSpinner = snapLoaded || msePlaying;

  // Periodic recovery when snapshot hard-errors — reduced to 10 s.
  useEffect(() => {
    if (!error) return;
    const t = window.setInterval(() => {
      setError(false);
      setSnapLoaded(false);
      setMsePlaying(false);
      setSnapshotRev((n) => n + 1);
    }, 10_000);
    return () => window.clearInterval(t);
  }, [error]);

  // Page-visibility: reset error + bump snapshot when tab becomes active.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && error) {
        setError(false);
        setSnapLoaded(false);
        setSnapshotRev((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [error]);

  // Snapshot polling (fallback while MSE is not playing).
  useEffect(() => {
    if (msePlaying) return;
    const t = window.setInterval(() => setSnapshotRev((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, [msePlaying]);

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
          {!hideSpinner && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
            </div>
          )}

          {!msePlaying && (
            <img
              src={`${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${snapshotRev}`}
              alt={cam.label}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              onLoad={() => setSnapLoaded(true)}
              onError={() => setError(true)}
            />
          )}

          <MSEStream
            name={cam.name}
            onPlaying={() => setMsePlaying(true)}
            onOffline={() => setMsePlaying(false)}
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
// Fullscreen — refreshing snapshot under WebRTC until WebRTC plays
// ---------------------------------------------------------------------------

function FullscreenCamera({ cam, onClose }: { cam: CameraInfo; onClose: () => void }) {
  const [snapRev,       setSnapRev]       = useState(0);
  const [webrtcPlaying, setWebrtcPlaying] = useState(false);
  const [snapError,     setSnapError]     = useState(false);
  const [mjpegError,    setMjpegError]    = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (webrtcPlaying) return;
    const t = window.setInterval(() => setSnapRev((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, [webrtcPlaying]);

  useEffect(() => {
    setSnapError(false);
    setMjpegError(false);
    setWebrtcPlaying(false);
  }, [cam.name]);

  const showFallbackHint = snapError && mjpegError;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        {!webrtcPlaying && (
          <>
            <img
              src={`${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${snapRev}`}
              alt={cam.label}
              className="absolute inset-0 z-[1] h-full w-full object-contain"
              onError={() => setSnapError(true)}
            />
            <img
              src={`${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/mjpeg`}
              alt=""
              className="absolute inset-0 z-[2] h-full w-full object-contain"
              onError={() => setMjpegError(true)}
            />
          </>
        )}

        <WebRTCStream
          name={cam.name}
          onPlaying={() => setWebrtcPlaying(true)}
          onOffline={() => setWebrtcPlaying(false)}
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
            {webrtcPlaying
              ? 'Live (WebRTC)'
              : showFallbackHint
                ? 'No stream — check UniFi / go2rtc and backend logs'
                : 'Live (MJPEG) · upgrading to WebRTC if available…'}
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
  { name: 'back_door', label: 'Back Door' },
  { name: 'living_room', label: 'Living Room' },
  { name: 'garage', label: 'Garage' },
  { name: 'backyard', label: 'Backyard' },
  { name: 'street', label: 'Street' },
  { name: 'driveway', label: 'Driveway' },
  { name: 'game_room', label: 'Game Room' },
  { name: 'pool', label: 'Pool' },
  { name: 'front_porch', label: 'Front Porch' },
];

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [fullscreenCam, setFullscreenCam] = useState<CameraInfo | null>(null);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [listError, setListError] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const loadCameras = () => {
    fetch(`${getApiBase()}/api/cameras`, { credentials: 'include' })
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
    fetch(`${getApiBase()}/api/cameras/recover`, { method: 'POST', credentials: 'include' })
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
              The backend pulls this list from go2rtc (UniFi Protect). If go2rtc was offline when the server started, names stay
              empty until it reconnects. This page rechecks every 15 seconds, and the server retries automatically.
            </p>
            {pendingEntries > 0 && (
              <p className="mt-2 text-xs text-amber-200/90">
                {pendingEntries} UniFi integration {pendingEntries === 1 ? 'entry has' : 'entries have'} not finished connecting to go2rtc — still retrying.
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
