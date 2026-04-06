"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Maximize2,
  Minimize2,
  Circle,
  Video,
  Eye,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { fetchEntities } from "@/lib/api";
import type { EntityState } from "@/types";

const GO2RTC_URL =
  process.env.NEXT_PUBLIC_GO2RTC_URL ?? "http://192.168.68.203:1984";

function cameraStreamName(entity: EntityState): string {
  const friendlyName = entity.attributes.friendly_name as string | undefined;
  if (friendlyName) {
    return friendlyName.toLowerCase().replace(/\s+/g, "_");
  }
  const parts = entity.entity_id.split(".");
  return parts[parts.length - 1];
}

function statusVariant(
  state: string,
): "success" | "warning" | "default" | "danger" {
  switch (state) {
    case "recording":
      return "danger";
    case "streaming":
      return "success";
    case "idle":
      return "default";
    default:
      return "warning";
  }
}

function StatusIcon({ state }: { state: string }) {
  switch (state) {
    case "recording":
      return <Circle className="size-3 fill-red-400 text-red-400" />;
    case "streaming":
      return <Video className="size-3 text-green-400" />;
    default:
      return <Circle className="size-3 text-zinc-500" />;
  }
}

type StreamMode = "mse" | "webrtc" | "mjpeg" | "snapshot";

function Go2rtcStream({
  src,
  mode,
  onError,
}: {
  src: string;
  mode: StreamMode;
  onError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (mode === "mjpeg" || mode === "snapshot") return;

    const video = videoRef.current;
    if (!video) return;

    if (mode === "mse") {
      if (!("MediaSource" in window)) {
        onError();
        return;
      }

      const wsUrl = `${GO2RTC_URL.replace(/^http/, "ws")}/api/ws?src=${encodeURIComponent(src)}`;
      const ms = new MediaSource();
      video.src = URL.createObjectURL(ms);

      ms.addEventListener("sourceopen", () => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";

        let sb: SourceBuffer | null = null;
        const queue: ArrayBuffer[] = [];
        let mimeType = "";

        ws.onmessage = (ev) => {
          if (typeof ev.data === "string") {
            const msg = JSON.parse(ev.data);
            if (msg.type === "mse") {
              mimeType = msg.value;
              try {
                sb = ms.addSourceBuffer(mimeType);
                sb.mode = "segments";
                sb.addEventListener("updateend", () => {
                  if (queue.length > 0 && sb && !sb.updating) {
                    sb.appendBuffer(queue.shift()!);
                  }
                });
              } catch {
                onError();
              }
            }
          } else if (ev.data instanceof ArrayBuffer && sb) {
            if (sb.updating || queue.length > 0) {
              queue.push(ev.data);
            } else {
              try {
                sb.appendBuffer(ev.data);
              } catch {
                onError();
              }
            }
          }
        };

        ws.onerror = () => onError();
        ws.onclose = () => {};
      });

      return () => {
        wsRef.current?.close();
        wsRef.current = null;
        if (video.src) URL.revokeObjectURL(video.src);
      };
    }

    if (mode === "webrtc") {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (ev) => {
        if (ev.streams[0]) video.srcObject = ev.streams[0];
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          return fetch(
            `${GO2RTC_URL}/api/webrtc?src=${encodeURIComponent(src)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/sdp" },
              body: pc.localDescription!.sdp,
            },
          );
        })
        .then((res) => {
          if (!res.ok) throw new Error("WebRTC negotiate failed");
          return res.text();
        })
        .then((sdp) =>
          pc.setRemoteDescription({ type: "answer", sdp }),
        )
        .catch(() => onError());

      return () => {
        pc.close();
        pcRef.current = null;
      };
    }
  }, [src, mode, onError]);

  if (mode === "snapshot") {
    return (
      <img
        src={`${GO2RTC_URL}/api/frame.jpeg?src=${encodeURIComponent(src)}`}
        alt={src}
        className="absolute inset-0 size-full object-cover"
        onError={onError}
      />
    );
  }

  if (mode === "mjpeg") {
    return (
      <img
        src={`${GO2RTC_URL}/api/stream.mjpeg?src=${encodeURIComponent(src)}`}
        alt={src}
        className="absolute inset-0 size-full object-cover"
        onError={onError}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 size-full object-cover"
    />
  );
}

function CameraCard({
  entity,
  expanded,
  onToggleExpand,
}: {
  entity: EntityState;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const name =
    (entity.attributes.friendly_name as string) ?? entity.entity_id;
  const state = entity.state;
  const hasFrigate =
    entity.entity_id.includes("frigate") ||
    entity.attributes.integration === "frigate";
  const detecting =
    entity.attributes.detect_state === "ON" ||
    entity.attributes.detecting === true;

  const streamName = cameraStreamName(entity);

  const [streamMode, setStreamMode] = useState<StreamMode>("mse");
  const [streamError, setStreamError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleError = () => setStreamError(true);
  const handleRetry = () => {
    setStreamError(false);
    setRetryKey((k) => k + 1);
  };

  const cycleModes: StreamMode[] = ["mse", "webrtc", "mjpeg", "snapshot"];

  return (
    <Card className="overflow-hidden" padding="none">
      <div
        className={`relative bg-zinc-900/80 ${expanded ? "aspect-auto min-h-[400px]" : "aspect-video"}`}
      >
        {streamError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <AlertTriangle className="size-6 text-yellow-500" />
            <span className="text-xs text-zinc-500">
              Stream unavailable ({streamMode})
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
              >
                <RefreshCw className="size-3" /> Retry
              </button>
              <button
                onClick={() => {
                  const idx = cycleModes.indexOf(streamMode);
                  setStreamMode(cycleModes[(idx + 1) % cycleModes.length]);
                  setStreamError(false);
                  setRetryKey((k) => k + 1);
                }}
                className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
              >
                Try {cycleModes[(cycleModes.indexOf(streamMode) + 1) % cycleModes.length]}
              </button>
            </div>
          </div>
        ) : (
          <Go2rtcStream
            key={`${streamName}-${streamMode}-${retryKey}`}
            src={streamName}
            mode={streamMode}
            onError={handleError}
          />
        )}

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <StatusIcon state={state} />
          <Badge variant={statusVariant(state)} size="sm">
            {state}
          </Badge>
        </div>

        {hasFrigate && (
          <div className="absolute right-3 top-3">
            <Badge variant={detecting ? "warning" : "default"} size="sm">
              <Eye className="mr-1 inline size-3" />
              {detecting ? "Detecting" : "Idle"}
            </Badge>
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <select
            value={streamMode}
            onChange={(e) => {
              setStreamMode(e.target.value as StreamMode);
              setStreamError(false);
              setRetryKey((k) => k + 1);
            }}
            className="rounded-lg bg-black/50 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur-sm outline-none"
          >
            <option value="mse">MSE</option>
            <option value="webrtc">WebRTC</option>
            <option value="mjpeg">MJPEG</option>
            <option value="snapshot">Snapshot</option>
          </select>
          <button
            onClick={onToggleExpand}
            className="flex size-8 items-center justify-center rounded-lg bg-black/50 text-zinc-400 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-zinc-200"
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted">
            {entity.last_changed
              ? `Updated ${new Date(entity.last_changed).toLocaleTimeString()}`
              : "No updates"}
            {" · "}
            <span className="text-zinc-600">{streamName}</span>
          </p>
        </div>
        {hasFrigate && detecting && (
          <ShieldAlert className="size-4 shrink-0 text-yellow-400" />
        )}
      </div>
    </Card>
  );
}

export default function CamerasPage() {
  const { entityStates, connected, initialSyncDone } = useWebSocket();
  const [entityList, setEntityList] = useState<EntityState[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEntities({ domain: "camera" })
      .then((res) => {
        if (!cancelled) setEntityList(res.entities);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cameras = useMemo(() => {
    const live: EntityState[] = [];
    for (const [, entity] of entityStates) {
      if (entity.domain === "camera") {
        live.push(entity);
      }
    }
    if (live.length === 0) return entityList;
    return live;
  }, [entityStates, entityList]);

  if (loading && !initialSyncDone) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-accent" />
          <span className="text-sm text-muted">Loading cameras...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15">
            <Camera className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cameras</h1>
            <p className="text-sm text-muted">
              {cameras.length} camera{cameras.length !== 1 && "s"}
              {!connected && " · Disconnected"}
              {" · "}
              <span className="text-zinc-600 font-mono text-xs">
                {GO2RTC_URL}
              </span>
            </p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {cameras.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <Camera className="size-10 text-zinc-600" />
            <p className="text-sm text-muted">No cameras discovered yet</p>
            <p className="text-xs text-zinc-600">
              Cameras will appear when entities with domain &quot;camera&quot;
              are reported via MQTT or the bridge layer.
            </p>
            <Badge variant="default">Awaiting Frigate / UniFi Protect</Badge>
          </div>
        </Card>
      ) : (
        <div
          className={
            expandedId
              ? "grid gap-4 grid-cols-1"
              : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }
        >
          {cameras
            .filter((cam) => !expandedId || cam.entity_id === expandedId)
            .map((cam) => (
              <CameraCard
                key={cam.entity_id}
                entity={cam}
                expanded={expandedId === cam.entity_id}
                onToggleExpand={() =>
                  setExpandedId(
                    expandedId === cam.entity_id ? null : cam.entity_id,
                  )
                }
              />
            ))}
        </div>
      )}
    </div>
  );
}
