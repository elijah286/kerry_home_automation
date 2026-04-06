"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Moon,
  Users,
  Plane,
  ArrowUpFromDot,
  Lightbulb,
  PartyPopper,
  Lock,
  DoorClosed,
  LayoutGrid,
  Radio,
  Bed,
  Camera,
  AlarmClock,
  Thermometer,
  Wifi,
  Zap,
  Waves,
  Sparkles,
  Play,
  Settings2,
  WifiOff,
  Activity,
  Eye,
  Sun,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Gauge } from "@/components/ui/Gauge";
import { Toggle } from "@/components/ui/Toggle";
import { AlertsFeed } from "@/components/dashboard/AlertsFeed";
import { WeatherCard } from "@/components/dashboard/WeatherCard";
import { EnergyFlowCard } from "@/components/dashboard/EnergyFlowCard";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useEntity } from "@/hooks/useEntity";
import type { StatsResponse } from "@/types";
import { fetchStats } from "@/lib/api";

const MODES = [
  { id: "night", label: "Night Mode", icon: Moon },
  { id: "guest", label: "Guest Mode", icon: Users },
  { id: "vacation", label: "Vacation", icon: Plane },
  { id: "upstairs_vacant", label: "Upstairs Vacant", icon: ArrowUpFromDot },
  { id: "keep_house_on", label: "Keep House On", icon: Lightbulb },
  { id: "party", label: "Party Mode", icon: PartyPopper },
];

const DOORS = [
  { id: "front_door", label: "Front Door", icon: Lock },
  { id: "back_door", label: "Back Door Lock", icon: Lock },
  { id: "outside_garage", label: "Outside Garage", icon: DoorClosed },
  { id: "inside_garage", label: "Inside Garage", icon: DoorClosed },
];

const PEOPLE = [
  { name: "Elijah", status: "Home", color: "bg-green-500" },
  { name: "Meghan", status: "Home", color: "bg-green-500" },
  { name: "Levi", status: "Home", color: "bg-green-500" },
  { name: "Asher", status: "Home", color: "bg-green-500" },
  { name: "Sloane", status: "Home", color: "bg-green-500" },
];

const CONTROLS = [
  { href: "/rooms", label: "Rooms", icon: LayoutGrid },
  { href: "/av", label: "A/V", icon: Radio },
  { href: "#", label: "BedJet", icon: Bed },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "#", label: "Wake-Up", icon: AlarmClock },
  { href: "/climate", label: "Climate", icon: Thermometer },
  { href: "#", label: "Network", icon: Wifi },
  { href: "/energy", label: "Power", icon: Zap },
  { href: "/pool", label: "Pool", icon: Waves },
];

const MOTION_AREAS = [
  { id: "garage", label: "Garage" },
  { id: "laundry_room", label: "Laundry" },
  { id: "office", label: "Office" },
  { id: "stairs", label: "Stairs" },
  { id: "front_porch", label: "Front Porch" },
  { id: "boys_bathroom", label: "Boys Bath" },
  { id: "sloanes_bathroom", label: "Sloane's Bath" },
];

const LIGHT_NEED_AREAS = [
  { id: "e5459ce674a2413db021c981cba209da", label: "Kitchen" },
  { id: "f9a4c709625e4bbeb1ed2738f553ced5", label: "Living Room" },
  { id: "office", label: "Office" },
  { id: "0d29420636684b359c5ae362eebcb218", label: "Main Bedroom" },
  { id: "stairs", label: "Stairs" },
  { id: "19ff4d3f107a40b6b9fb5d5d3286ba21", label: "Game Room" },
  { id: "efb3aec330e6471fa134e90fb3801cb8", label: "Movie Room" },
];

function MotionLightToggle({
  areaId,
  label,
}: {
  areaId: string;
  label: string;
}) {
  const entityId = `input_boolean.${areaId}_motion_lights_on`;
  const { state } = useEntity(entityId);
  const { sendCommand } = useWebSocket();

  const isOn = state === "on";

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface/50 px-3 py-2">
      <span className="text-xs text-muted truncate">{label}</span>
      <Toggle
        checked={isOn}
        onChange={() =>
          sendCommand(entityId, isOn ? "turn_off" : "turn_on")
        }
        label=""
      />
    </div>
  );
}

function LightNeedScore({ areaId, label }: { areaId: string; label: string }) {
  const entityId = `sensor.${areaId}_light_need_score`;
  const { state } = useEntity(entityId);
  const score = state ? parseFloat(state) : null;

  if (score === null || isNaN(score)) return null;

  const pct = Math.round(score * 100);
  const color =
    pct > 70
      ? "text-yellow-400"
      : pct > 40
        ? "text-amber-400"
        : "text-blue-400";

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface/50 px-3 py-2">
      <span className="text-xs text-muted truncate">{label}</span>
      <div className="flex items-center gap-1.5">
        <Sun className={`size-3.5 ${color}`} />
        <span className={`text-sm font-mono font-medium ${color}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function FrigateDetections() {
  const { entityStates } = useWebSocket();

  const activeCameras = useMemo(() => {
    const cameras = new Set<string>();
    for (const [, entity] of entityStates) {
      if (
        entity.entity_id.startsWith("frigate.") &&
        entity.entity_id.includes(".detect_state") &&
        entity.state === "ON"
      ) {
        const parts = entity.entity_id.split(".");
        if (parts[1])
          cameras.add(
            parts[1].replace("_frigate", "").replace(/_/g, " "),
          );
      }
    }
    return [...cameras];
  }, [entityStates]);

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Eye className="size-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">
          Frigate — Live Detection
        </h3>
      </div>
      {activeCameras.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {activeCameras.map((cam) => (
            <Badge key={cam} variant="success">
              <Camera className="mr-1 inline size-3" />
              {cam}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No active detections</p>
      )}
    </Card>
  );
}

function ConnectionStatus() {
  const { connected, initialSyncDone } = useWebSocket();
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    if (!connected) return;
    const load = () => {
      fetchStats().then(setStats).catch(() => {});
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        {connected ? (
          <Activity className="size-3.5 text-green-400" />
        ) : (
          <WifiOff className="size-3.5 text-red-400" />
        )}
        <span
          className={`text-xs font-medium ${connected ? "text-green-400" : "text-red-400"}`}
        >
          {connected
            ? initialSyncDone
              ? "Live"
              : "Syncing..."
            : "Disconnected"}
        </span>
      </div>
      {stats && (
        <span className="text-xs text-muted">
          {stats.entity_count} entities · {stats.device_count} devices
        </span>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "guest";
  const isAdminOrMember = role === "admin" || role === "member";

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
      <ConnectionStatus />

      {isAdminOrMember && (
        <div className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted transition-all hover:border-accent/30 hover:text-foreground"
            >
              <mode.icon className="size-4" />
              {mode.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {isAdminOrMember &&
          DOORS.map((door) => (
            <button
              key={door.id}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-card-hover"
            >
              <door.icon className="size-6 text-yellow-400" />
              <span className="text-xs font-medium text-foreground">
                {door.label}
              </span>
            </button>
          ))}
        {isAdminOrMember && (
          <div className="mx-2 hidden h-8 w-px bg-border lg:block" />
        )}
        <Badge variant="info">Late Evening</Badge>
        {PEOPLE.map((p) => (
          <div key={p.name} className="flex items-center gap-1.5">
            <div className={`size-2.5 rounded-full ${p.color}`} />
            <span className="text-xs font-medium text-foreground">
              {p.name}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <AlertsFeed />
          <FrigateDetections />

          {isAdminOrMember && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Motion Based Lighting
              </h3>
              <div className="space-y-1.5">
                {MOTION_AREAS.map((a) => (
                  <MotionLightToggle
                    key={a.id}
                    areaId={a.id}
                    label={a.label}
                  />
                ))}
              </div>
            </Card>
          )}

          {isAdminOrMember && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Security
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-green-500/10">
                  <Lock className="size-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Disarmed</p>
                  <p className="text-xs text-muted">All doors secured</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-foreground">
                  Main Floor
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">—</span>
                  <span className="text-sm text-muted">°F</span>
                </div>
                <Badge variant="default">Awaiting Z-Wave</Badge>
              </div>
              <div>
                <span className="text-sm font-medium text-foreground">
                  Upstairs
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">—</span>
                  <span className="text-sm text-muted">°F</span>
                </div>
                <Badge variant="default">Awaiting Z-Wave</Badge>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Ambient Light Need
            </h3>
            <div className="space-y-1.5">
              {LIGHT_NEED_AREAS.map((a) => (
                <LightNeedScore key={a.id} areaId={a.id} label={a.label} />
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Controls
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {CONTROLS.map((ctrl) => (
                <Link
                  key={ctrl.label}
                  href={ctrl.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card-hover/50 px-2 py-3 transition-colors hover:bg-accent/10 hover:text-accent"
                >
                  <ctrl.icon className="size-6 text-muted" />
                  <span className="text-xs font-medium">{ctrl.label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <WeatherCard />
          <EnergyFlowCard />

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Vehicles
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center gap-2">
                <Gauge
                  value={0}
                  min={0}
                  max={100}
                  size="sm"
                  unit="%"
                  label="Enterprise"
                />
                <Badge variant="default">Awaiting Tesla API</Badge>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Gauge
                  value={0}
                  min={0}
                  max={100}
                  size="sm"
                  unit="%"
                  label="Voyager"
                />
                <Badge variant="default">Awaiting Tesla API</Badge>
              </div>
            </div>
          </Card>

          {isAdminOrMember && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Cleaning
              </h3>
              <div className="flex gap-2">
                <IconButton icon={Sparkles} label="Clean" size="sm" />
                <IconButton icon={Settings2} label="Configure" size="sm" />
                <IconButton icon={Play} label="Auto Run" size="sm" />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
