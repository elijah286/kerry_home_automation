"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  Server,
  Activity,
  WifiOff,
  Wifi,
  Radio,
  Cpu,
  Clock,
  Hash,
  Loader2,
  CheckCircle2,
  XCircle,
  Palette,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fetchStats } from "@/lib/api";
import { useSystemMode } from "@/hooks/useSystemMode";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useTheme, type Theme } from "@/providers/ThemeProvider";
import type { StatsResponse, SystemMode } from "@/types";

const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: "default", label: "Default", description: "Modern dark interface" },
  { id: "lcars", label: "LCARS", description: "Star Trek TNG computer" },
];

const MODES: { id: SystemMode; label: string }[] = [
  { id: "night", label: "Night" },
  { id: "morning", label: "Morning" },
  { id: "day", label: "Day" },
  { id: "evening", label: "Evening" },
  { id: "late_evening", label: "Late Evening" },
  { id: "late_night", label: "Late Night" },
];

interface BridgeInfo {
  id: string;
  label: string;
  protocol: string;
  icon: typeof Radio;
}

const BRIDGES: BridgeInfo[] = [
  { id: "mqtt", label: "MQTT Broker", protocol: "mqtt", icon: Radio },
  { id: "zwave", label: "Z-Wave", protocol: "zwave", icon: Cpu },
  { id: "lutron", label: "Lutron Caseta", protocol: "lutron", icon: Server },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function BridgeCard({ bridge }: { bridge: BridgeInfo }) {
  const { entityStates } = useWebSocket();

  const isConnected = (() => {
    for (const [, entity] of entityStates) {
      if (
        entity.entity_id.includes(bridge.protocol) &&
        entity.entity_id.includes("status")
      ) {
        return entity.state === "on" || entity.state === "connected";
      }
    }
    return null;
  })();

  const BridgeIcon = bridge.icon;
  const connected = isConnected === true;
  const unknown = isConnected === null;

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-xl ${
            connected
              ? "bg-green-500/15"
              : unknown
                ? "bg-white/5"
                : "bg-red-500/15"
          }`}
        >
          <BridgeIcon
            className={`size-5 ${
              connected
                ? "text-green-400"
                : unknown
                  ? "text-zinc-500"
                  : "text-red-400"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{bridge.label}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {connected ? (
              <>
                <CheckCircle2 className="size-3 text-green-400" />
                <span className="text-xs text-green-400">Connected</span>
              </>
            ) : unknown ? (
              <>
                <Hash className="size-3 text-zinc-500" />
                <span className="text-xs text-muted">Not detected</span>
              </>
            ) : (
              <>
                <XCircle className="size-3 text-red-400" />
                <span className="text-xs text-red-400">Disconnected</span>
              </>
            )}
          </div>
        </div>
        <Badge
          variant={connected ? "success" : unknown ? "default" : "danger"}
          size="sm"
        >
          {bridge.protocol.toUpperCase()}
        </Badge>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { connected, initialSyncDone } = useWebSocket();
  const { mode, setMode } = useSystemMode();
  const { theme, setTheme } = useTheme();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [modeLoading, setModeLoading] = useState<SystemMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchStats()
        .then((s) => {
          if (!cancelled) {
            setStats(s);
            setStatsLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setStatsLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleModeChange = async (m: SystemMode) => {
    setModeLoading(m);
    try {
      await setMode(m);
    } catch {
      // mode change failed silently
    } finally {
      setModeLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <Settings size={20} strokeWidth={1.8} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted">System configuration & status</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Connection Status */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              {connected ? (
                <Activity className="size-4 text-green-400" />
              ) : (
                <WifiOff className="size-4 text-red-400" />
              )}
              <h3 className="text-sm font-semibold text-foreground">
                Backend Connection
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`flex size-10 items-center justify-center rounded-xl ${
                  connected ? "bg-green-500/15" : "bg-red-500/15"
                }`}
              >
                {connected ? (
                  <Wifi className="size-5 text-green-400" />
                ) : (
                  <WifiOff className="size-5 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {connected
                    ? initialSyncDone
                      ? "Connected & Synced"
                      : "Connected — Syncing..."
                    : "Disconnected"}
                </p>
                <p className="text-xs text-muted">
                  WebSocket{" "}
                  {connected ? "active" : "reconnecting..."}
                </p>
              </div>
              <Badge
                variant={connected ? "success" : "danger"}
                className="ml-auto"
                size="sm"
              >
                {connected ? "Online" : "Offline"}
              </Badge>
            </div>
          </Card>

          {/* System Info */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Server className="size-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">
                System Information
              </h3>
            </div>
            {statsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-muted" />
              </div>
            ) : stats ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface/50 px-3 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {stats.entity_count.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">Entities</p>
                  </div>
                  <div className="rounded-lg bg-surface/50 px-3 py-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {stats.device_count.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">Devices</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-surface/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Clock className="size-3.5 text-muted" />
                      <span className="text-xs text-muted">Uptime</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {formatUptime(stats.uptime_seconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Activity className="size-3.5 text-muted" />
                      <span className="text-xs text-muted">Event Bus</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {stats.event_bus.eventCount.toLocaleString()} events ·{" "}
                      {stats.event_bus.listenerCount} listeners
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted py-4 text-center">
                Unable to load system stats
              </p>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Theme */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Palette className="size-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">
                Theme
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    disabled={isActive}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-border bg-card text-muted hover:border-accent/20 hover:text-foreground"
                    } disabled:opacity-90`}
                  >
                    <span>{t.label}</span>
                    <span className="text-[10px] opacity-60">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* System Mode */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">
                  System Mode
                </h3>
              </div>
              {mode && (
                <Badge variant="info" size="sm">
                  {mode.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map((m) => {
                const isActive = mode === m.id;
                const isLoading = modeLoading === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id)}
                    disabled={isLoading || isActive}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-border bg-card text-muted hover:border-accent/20 hover:text-foreground"
                    } disabled:opacity-50`}
                  >
                    {isLoading && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Bridge Status */}
          <Card padding="none">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">
                  Bridge Status
                </h3>
              </div>
            </div>
            <div className="space-y-0 divide-y divide-border">
              {BRIDGES.map((bridge) => (
                <div key={bridge.id} className="px-4 py-3">
                  <BridgeCard bridge={bridge} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
