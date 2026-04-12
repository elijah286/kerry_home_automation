'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { X } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const WS_BASE = typeof window !== 'undefined'
  ? `ws://${window.location.hostname}:3000`
  : 'ws://localhost:3000';

// ---------------------------------------------------------------------------
// MSE stream — fMP4 over WebSocket (invisible until frames actually play)
// ---------------------------------------------------------------------------

function MSEStream({
  name,
  onPlaying,
}: {
  name: string;
  onPlaying?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !window.MediaSource) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let sourceBuffer: SourceBuffer | null = null;
    let ws: WebSocket | null = null;
    let queue: ArrayBuffer[] = [];
    let disposed = false;

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
          try {
            sourceBuffer.remove(0, end - 5);
          } catch {
            /* ignore */
          }
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

    ms.addEventListener('sourceopen', () => {
      if (disposed) return;

      ws = new WebSocket(`${WS_BASE}/api/cameras/${encodeURIComponent(name)}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        if (disposed) return;

        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data) as { type?: string; value?: unknown };
            if (msg.type === 'mse' && typeof msg.value === 'string') {
              ensureSourceBuffer(msg.value);
            } else if (msg.type === 'error') {
              console.warn('go2rtc:', msg.value);
            }
          } catch {
            /* ignore non-JSON text */
          }
          return;
        }

        appendBinary(ev.data as ArrayBuffer);
      };

      ws.onerror = () => ws?.close();
    });

    const onPlayingHandler = () => {
      setVisible(true);
      onPlayingRef.current?.();
    };
    video.addEventListener('playing', onPlayingHandler, { once: true });

    return () => {
      disposed = true;
      setVisible(false);
      ws?.close();
      queue = [];
      if (ms.readyState === 'open') {
        try {
          ms.endOfStream();
        } catch {
          /* ignore */
        }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [name]);

  if (typeof window !== 'undefined' && !window.MediaSource) {
    return null;
  }

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
// WebRTC — hidden until video actually plays (avoids black overlay)
// ---------------------------------------------------------------------------

function WebRTCStream({
  name,
  onPlaying,
}: {
  name: string;
  onPlaying?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      if (ev.streams[0]) video.srcObject = ev.streams[0];
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() =>
        fetch(`${API_BASE}/api/cameras/${encodeURIComponent(name)}/webrtc`, { credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription!.sdp,
        }),
      )
      .then((res) => res.text())
      .then((sdp) => pc.setRemoteDescription({ type: 'answer', sdp }))
      .catch(() => {});

    const onPlayingHandler = () => {
      setVisible(true);
      onPlayingRef.current?.();
    };
    video.addEventListener('playing', onPlayingHandler, { once: true });

    return () => {
      setVisible(false);
      pc.close();
    };
  }, [name]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
      style={{ zIndex: 3, opacity: visible ? 1 : 0 }}
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
// Camera tile — snapshot (always first) + MSE when it works
// ---------------------------------------------------------------------------

const CameraTile = memo(function CameraTile({
  cam,
  onSelect,
}: {
  cam: CameraInfo;
  onSelect: () => void;
}) {
  const [snapshotRev, setSnapshotRev] = useState(0);
  const [snapLoaded, setSnapLoaded] = useState(false);
  const [msePlaying, setMsePlaying] = useState(false);
  const [error, setError] = useState(false);

  const hideSpinner = snapLoaded || msePlaying;

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
              src={`${API_BASE}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${snapshotRev}`}
              alt={cam.label}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              onLoad={() => setSnapLoaded(true)}
              onError={() => setError(true)}
            />
          )}

          <MSEStream name={cam.name} onPlaying={() => setMsePlaying(true)} />
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
  const [snapRev, setSnapRev] = useState(0);
  const [webrtcPlaying, setWebrtcPlaying] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (webrtcPlaying) return;
    const t = window.setInterval(() => setSnapRev((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, [webrtcPlaying]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        {!webrtcPlaying && (
          <img
            src={`${API_BASE}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${snapRev}`}
            alt={cam.label}
            className="absolute inset-0 z-[2] h-full w-full object-contain"
          />
        )}

        <WebRTCStream name={cam.name} onPlaying={() => setWebrtcPlaying(true)} />

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
            {webrtcPlaying ? 'Live (WebRTC)' : 'Connecting…'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main cameras page
// ---------------------------------------------------------------------------

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [fullscreenCam, setFullscreenCam] = useState<CameraInfo | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/cameras`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { cameras: CameraInfo[] }) => setCameras(data.cameras))
      .catch(() => {
        setCameras([
          { name: 'back_door', label: 'Back Door' },
          { name: 'living_room', label: 'Living Room' },
          { name: 'garage', label: 'Garage' },
          { name: 'backyard', label: 'Backyard' },
          { name: 'street', label: 'Street' },
          { name: 'driveway', label: 'Driveway' },
          { name: 'game_room', label: 'Game Room' },
          { name: 'pool', label: 'Pool' },
          { name: 'front_porch', label: 'Front Porch' },
        ]);
      });
  }, []);

  return (
    <>
      <div className="p-2 lg:p-3">
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
