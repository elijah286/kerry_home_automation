'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Camera,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';

const GO2RTC_URL = process.env.NEXT_PUBLIC_GO2RTC_URL ?? 'http://192.168.68.203:1984';

type StreamMode = 'mse' | 'webrtc' | 'mjpeg' | 'snapshot';
const MODES: StreamMode[] = ['mse', 'webrtc', 'mjpeg', 'snapshot'];

interface CameraInfo {
  name: string;
  label: string;
}

function Go2rtcStream({ src, mode, onError }: { src: string; mode: StreamMode; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (mode === 'mjpeg' || mode === 'snapshot') return;

    const video = videoRef.current;
    if (!video) return;

    let cleanup = () => {};

    if (mode === 'mse') {
      if (!('MediaSource' in window)) { onError(); return; }
      const wsUrl = `${GO2RTC_URL.replace(/^http/, 'ws')}/api/ws?src=${encodeURIComponent(src)}`;
      const ms = new MediaSource();
      video.src = URL.createObjectURL(ms);

      ms.addEventListener('sourceopen', () => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';
        let sb: SourceBuffer | null = null;
        const queue: ArrayBuffer[] = [];

        ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'mse') {
              try { sb = ms.addSourceBuffer(msg.value); } catch { onError(); }
              sb?.addEventListener('updateend', () => {
                if (queue.length > 0 && sb && !sb.updating) sb.appendBuffer(queue.shift()!);
              });
            }
          } else if (sb) {
            if (sb.updating) queue.push(ev.data);
            else try { sb.appendBuffer(ev.data); } catch { /* buffer full */ }
          }
        };
        ws.onerror = () => onError();
        ws.onclose = () => {};
        cleanup = () => { ws.close(); };
      });
    } else if (mode === 'webrtc') {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (ev) => {
        if (ev.track.kind === 'video') video.srcObject = ev.streams[0];
      };
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        return fetch(`${GO2RTC_URL}/api/webrtc?src=${encodeURIComponent(src)}`, {
          method: 'POST',
          body: offer.sdp,
        });
      }).then((res) => res.text()).then((sdp) => {
        pc.setRemoteDescription({ type: 'answer', sdp });
      }).catch(() => onError());
      cleanup = () => { pc.close(); };
    }

    return () => {
      cleanup();
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    };
  }, [src, mode, onError]);

  if (mode === 'snapshot') {
    return <img src={`${GO2RTC_URL}/api/frame.jpeg?src=${encodeURIComponent(src)}`} alt={src} className="w-full h-full object-cover" />;
  }

  if (mode === 'mjpeg') {
    return <img src={`${GO2RTC_URL}/api/stream.mjpeg?src=${encodeURIComponent(src)}`} alt={src} className="w-full h-full object-cover" />;
  }

  return <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />;
}

function CameraCard({
  cam,
  expanded,
  onToggleExpand,
}: {
  cam: CameraInfo;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [mode, setMode] = useState<StreamMode>('mse');
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => { setError(false); setRetryKey((k) => k + 1); };

  return (
    <Card className="overflow-hidden !p-0">
      <div className={`relative ${expanded ? 'aspect-video' : 'aspect-video'}`} style={{ backgroundColor: '#000' }}>
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Stream unavailable ({mode})
            </span>
            <div className="flex gap-2">
              <button onClick={handleRetry} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
              <button
                onClick={() => { const idx = MODES.indexOf(mode); setMode(MODES[(idx + 1) % MODES.length]); setError(false); setRetryKey((k) => k + 1); }}
                className="rounded-md px-2 py-1 text-xs"
                style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}
              >
                Try {MODES[(MODES.indexOf(mode) + 1) % MODES.length]}
              </button>
            </div>
          </div>
        ) : (
          <Go2rtcStream
            key={`${cam.name}-${mode}-${retryKey}`}
            src={cam.name}
            mode={mode}
            onError={() => setError(true)}
          />
        )}

        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value as StreamMode); setError(false); setRetryKey((k) => k + 1); }}
            className="rounded-lg bg-black/60 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur-sm outline-none"
          >
            {MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
          <button
            onClick={onToggleExpand}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-zinc-400 backdrop-blur-sm hover:text-zinc-200 transition-colors"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium">{cam.label}</span>
        <Badge variant="success" className="text-[10px]">Live</Badge>
      </div>
    </Card>
  );
}

// Camera list — hardcoded from go2rtc config for now
const CAMERAS: CameraInfo[] = [
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
  const [expandedCam, setExpandedCam] = useState<string | null>(null);

  return (
    <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
            <Camera className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Cameras</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {CAMERAS.length} camera{CAMERAS.length !== 1 ? 's' : ''} &middot; {GO2RTC_URL}
            </p>
          </div>
        </div>
        <Badge variant="success">Live</Badge>
      </div>

      <div className={expandedCam ? 'grid gap-4 grid-cols-1' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}>
        {CAMERAS.filter((c) => !expandedCam || c.name === expandedCam).map((cam) => (
          <CameraCard
            key={cam.name}
            cam={cam}
            expanded={expandedCam === cam.name}
            onToggleExpand={() => setExpandedCam(expandedCam === cam.name ? null : cam.name)}
          />
        ))}
      </div>
    </div>
  );
}
