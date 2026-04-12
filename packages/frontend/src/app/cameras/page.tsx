'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { X } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const WS_BASE = typeof window !== 'undefined'
  ? `ws://${window.location.hostname}:3000`
  : 'ws://localhost:3000';

// ---------------------------------------------------------------------------
// MSE stream — lightweight MP4-over-WebSocket via backend proxy
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !window.MediaSource) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let sourceBuffer: SourceBuffer | null = null;
    let ws: WebSocket | null = null;
    let queue: ArrayBuffer[] = [];
    let disposed = false;

    ms.addEventListener('sourceopen', () => {
      if (disposed) return;

      ws = new WebSocket(`${WS_BASE}/api/cameras/${encodeURIComponent(name)}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        if (disposed) return;
        const data = ev.data as ArrayBuffer;

        if (!sourceBuffer) {
          // First message from go2rtc is the MP4 init segment — detect codec from it
          // go2rtc sends fMP4 with codecs like avc1/hevc + aac/opus
          try {
            // Try common codecs — go2rtc typically transcodes to H.264
            const codecs = ['video/mp4; codecs="avc1.640029,mp4a.40.2"', 'video/mp4; codecs="avc1.640029"', 'video/mp4; codecs="avc1.42e01e"'];
            const supported = codecs.find((c) => MediaSource.isTypeSupported(c));
            if (!supported) {
              console.warn('No supported MSE codec found');
              return;
            }
            sourceBuffer = ms.addSourceBuffer(supported);
            sourceBuffer.mode = 'segments';
            sourceBuffer.addEventListener('updateend', () => {
              if (disposed || !sourceBuffer) return;
              // Append queued buffers
              if (queue.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(queue.shift()!);
              }
              // Keep buffer trimmed to last 5 seconds to prevent memory growth
              if (sourceBuffer.buffered.length > 0) {
                const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
                if (end > 10) {
                  try { sourceBuffer.remove(0, end - 5); } catch { /* ignore */ }
                }
              }
            });
          } catch (err) {
            console.warn('MSE source buffer creation failed:', err);
            return;
          }
        }

        if (sourceBuffer.updating || queue.length > 0) {
          // Drop old frames if queue gets too long (prevent lag buildup)
          if (queue.length > 10) queue.splice(0, queue.length - 5);
          queue.push(data);
        } else {
          try {
            sourceBuffer.appendBuffer(data);
          } catch {
            queue.push(data);
          }
        }
      };

      ws.onerror = () => ws?.close();
    });

    video.addEventListener('playing', () => onPlayingRef.current?.(), { once: true });

    return () => {
      disposed = true;
      ws?.close();
      queue = [];
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [name]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      style={{ zIndex: 2 }}
    />
  );
}

// ---------------------------------------------------------------------------
// WebRTC stream — high quality, single camera (fullscreen only)
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

    // SDP exchange through backend proxy (not direct to go2rtc)
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

    video.addEventListener('playing', () => onPlayingRef.current?.(), { once: true });

    return () => {
      pc.close();
    };
  }, [name]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      style={{ zIndex: 3 }}
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
// Camera tile — snapshot → MSE (no WebRTC in grid)
// ---------------------------------------------------------------------------

const CameraTile = memo(function CameraTile({
  cam,
  onSelect,
}: {
  cam: CameraInfo;
  onSelect: () => void;
}) {
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [mseReady, setMseReady] = useState(false);
  const [error, setError] = useState(false);

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
          {!snapshotLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
            </div>
          )}

          {/* Layer 1: Cached snapshot (instant) */}
          {!mseReady && (
            <img
              src={`${API_BASE}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?ts=${Date.now()}`}
              alt={cam.label}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 1 }}
              onLoad={() => setSnapshotLoaded(true)}
              onError={() => setError(true)}
            />
          )}

          {/* Layer 2: MSE stream (replaces snapshot) */}
          <MSEStream
            name={cam.name}
            onPlaying={() => setMseReady(true)}
          />
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 pointer-events-none z-20">
        <span className="text-xs font-medium text-white drop-shadow-sm">{cam.label}</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Fullscreen camera — MSE → WebRTC upgrade
// ---------------------------------------------------------------------------

function FullscreenCamera({ cam, onClose }: { cam: CameraInfo; onClose: () => void }) {
  const [webrtcPlaying, setWebrtcPlaying] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1">
        {/* MSE stream — immediate */}
        {!webrtcPlaying && (
          <MSEStream name={cam.name} />
        )}

        {/* WebRTC upgrade — single connection, replaces MSE when ready */}
        <WebRTCStream
          name={cam.name}
          onPlaying={() => setWebrtcPlaying(true)}
        />

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-30">
          <span className="text-sm font-medium text-white drop-shadow-sm">{cam.label}</span>
          <button
            onClick={onClose}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom bar */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 pointer-events-none z-30">
          <span className="text-[11px] text-white/60">
            {webrtcPlaying ? 'Live' : 'Connecting...'}
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

  // Fetch camera list from backend (no longer hardcoded)
  useEffect(() => {
    fetch(`${API_BASE}/api/cameras`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { cameras: CameraInfo[] }) => setCameras(data.cameras))
      .catch(() => {
        // Fallback to known cameras if API fails
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
        <div className="grid gap-1 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
