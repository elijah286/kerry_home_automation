"use client";

import { useCallback, useMemo } from "react";
import {
  Sparkles,
  Battery,
  Play,
  Square,
  Home as HomeIcon,
  Trash2,
  Droplets,
  Clock,
  Bot,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Gauge } from "@/components/ui/Gauge";
import { useEntity } from "@/hooks/useEntity";
import { useSendCommand } from "@/hooks/useSendCommand";
import { useWebSocket } from "@/providers/WebSocketProvider";

const ROOMS = [
  "Kitchen",
  "Living Room",
  "Office",
  "Main Bedroom",
  "Game Room",
  "Movie Room",
  "Dining Room",
  "Hallway",
  "Laundry Room",
  "Garage",
  "Boys Room",
  "Sloane's Room",
] as const;

function VacuumCard({
  entityId,
  name,
  model,
}: {
  entityId: string;
  name: string;
  model: string;
}) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();

  const battery = typeof attributes.battery_level === "number"
    ? (attributes.battery_level as number)
    : null;
  const status = (attributes.status as string) ?? state ?? "unknown";
  const dustBin = attributes.dust_bin_full === true;
  const waterTank = attributes.water_tank_empty === true;
  const fanSpeed = attributes.fan_speed as string | undefined;

  const isActive = state === "cleaning" || state === "returning";
  const isDocked = state === "docked" || state === "idle";

  const handleStart = useCallback(() => {
    sendCommand(entityId, "start");
  }, [entityId, sendCommand]);

  const handleStop = useCallback(() => {
    sendCommand(entityId, "stop");
  }, [entityId, sendCommand]);

  const handleDock = useCallback(() => {
    sendCommand(entityId, "return_to_base");
  }, [entityId, sendCommand]);

  const statusVariant = isActive
    ? "success"
    : isDocked
      ? "info"
      : state === "error"
        ? "danger"
        : "default";

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="space-y-3">
          <div className="h-5 w-40 rounded bg-white/5" />
          <div className="h-4 w-28 rounded bg-white/5" />
          <div className="h-20 w-full rounded bg-white/5" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-accent/15" : "bg-white/5"}`}>
          <Bot
            className={`size-5 ${isActive ? "text-accent" : "text-zinc-600"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted">{model}</p>
        </div>
        <Badge variant={statusVariant}>{status}</Badge>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center">
          {battery !== null ? (
            <Gauge
              value={battery}
              min={0}
              max={100}
              size="sm"
              unit="%"
              label="Battery"
              color={battery > 50 ? "#22c55e" : battery > 20 ? "#eab308" : "#ef4444"}
            />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Battery className="size-6 text-zinc-600" />
              <span className="text-xs text-muted">—</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <Trash2
            className={`size-6 ${dustBin ? "text-yellow-400" : "text-zinc-600"}`}
          />
          <span className="text-xs text-muted">Dust Bin</span>
          <Badge
            variant={dustBin ? "warning" : "default"}
            size="sm"
          >
            {dustBin ? "Full" : state ? "OK" : "—"}
          </Badge>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <Droplets
            className={`size-6 ${waterTank ? "text-red-400" : "text-zinc-600"}`}
          />
          <span className="text-xs text-muted">Water Tank</span>
          <Badge
            variant={waterTank ? "danger" : "default"}
            size="sm"
          >
            {waterTank ? "Empty" : state ? "OK" : "—"}
          </Badge>
        </div>
      </div>

      {/* Fan Speed */}
      {fanSpeed && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-muted">Fan Speed:</span>
          <Badge variant="info" size="sm">{fanSpeed}</Badge>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <IconButton
          icon={Play}
          label="Start"
          variant="primary"
          active={isActive}
          onClick={handleStart}
          size="sm"
        />
        <IconButton
          icon={Square}
          label="Stop"
          variant="danger"
          onClick={handleStop}
          size="sm"
        />
        <IconButton
          icon={HomeIcon}
          label="Dock"
          active={isDocked}
          onClick={handleDock}
          size="sm"
        />
      </div>
    </Card>
  );
}

export default function CleaningPage() {
  const { connected, entityStates } = useWebSocket();
  const sendCommand = useSendCommand();

  const vacuums = useMemo(() => {
    const list: { entity_id: string; name: string }[] = [];
    for (const [, entity] of entityStates) {
      if (entity.domain === "vacuum") {
        list.push({
          entity_id: entity.entity_id,
          name: (entity.attributes.friendly_name as string) ?? entity.entity_id,
        });
      }
    }
    return list;
  }, [entityStates]);

  const handleRoomClean = useCallback(
    (room: string) => {
      const targetVacuum = vacuums[0]?.entity_id ?? "vacuum.roborock_s7";
      sendCommand(targetVacuum, "send_command", {
        command: "app_segment_clean",
        params: { rooms: [room.toLowerCase().replace(/['\s]/g, "_")] },
      });
    },
    [vacuums, sendCommand],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15">
            <Sparkles className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cleaning</h1>
            <p className="text-sm text-muted">Robot vacuum control</p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Vacuum Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <VacuumCard
          entityId="vacuum.roborock_s7"
          name="Roborock S7"
          model="Roborock S7 MaxV Ultra"
        />
        <VacuumCard
          entityId="vacuum.saros_z70"
          name="Saros Z70"
          model="Roborock Saros Z70"
        />
      </div>

      {/* Discovered Vacuums */}
      {vacuums.length > 0 && !vacuums.some((v) => v.entity_id === "vacuum.roborock_s7") && (
        <div className="grid gap-4 sm:grid-cols-2">
          {vacuums.map((v) => (
            <VacuumCard
              key={v.entity_id}
              entityId={v.entity_id}
              name={v.name}
              model="Discovered Vacuum"
            />
          ))}
        </div>
      )}

      {/* Room Selection */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Room Cleaning
        </h3>
        <p className="mb-3 text-xs text-muted">
          Select a room to start targeted cleaning
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ROOMS.map((room) => (
            <button
              key={room}
              onClick={() => handleRoomClean(room)}
              className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-foreground transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
            >
              <HomeIcon className="size-4 text-muted" />
              {room}
            </button>
          ))}
        </div>
      </Card>

      {/* Schedule Placeholder */}
      <Card>
        <div className="flex items-center gap-3">
          <Clock className="size-5 text-accent" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Cleaning Schedule
            </p>
            <p className="text-xs text-muted">
              Configure automated cleaning schedules
            </p>
          </div>
          <Badge variant="default" size="sm" className="ml-auto">
            Coming Soon
          </Badge>
        </div>
      </Card>
    </div>
  );
}
