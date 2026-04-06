"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  Camera,
  Thermometer,
  Lightbulb,
  Lock,
  LockOpen,
  Moon,
  Sunrise,
  Sunset,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useSystemMode } from "@/hooks/useSystemMode";
import { useEntity } from "@/hooks/useEntity";
import { useSendCommand } from "@/hooks/useSendCommand";
import type { SystemMode } from "@/types";

const MODE_ICONS: Record<SystemMode, typeof Sun> = {
  night: Moon,
  morning: Sunrise,
  day: Sun,
  evening: Sunset,
  late_evening: Moon,
  late_night: Moon,
};

function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const dateStr = time.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="text-center">
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-8xl font-bold tabular-nums tracking-tight text-foreground lg:text-9xl">
          {displayHours}:{minutes.toString().padStart(2, "0")}
        </span>
        <span className="text-2xl font-medium text-muted lg:text-3xl">
          {ampm}
        </span>
      </div>
      <p className="mt-2 text-lg text-muted">{dateStr}</p>
    </div>
  );
}

function WeatherSummary() {
  const weatherEntity = useEntity("weather.home");
  const tempEntity = useEntity("sensor.outdoor_temperature");

  const condition = weatherEntity.state ?? "unknown";
  const temp = tempEntity.state;
  const attrs = weatherEntity.attributes;
  const humidity = attrs.humidity as number | undefined;
  const forecast = (attrs.forecast as Array<{ condition: string; temperature: number }>) ?? [];

  const WeatherIcon =
    condition === "sunny" || condition === "clear"
      ? Sun
      : condition.includes("rain")
        ? CloudRain
        : Cloud;

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <WeatherIcon className="size-12 text-yellow-400" />
          <div>
            <p className="text-sm text-muted capitalize">{condition.replace(/_/g, " ")}</p>
            {humidity != null && (
              <p className="text-xs text-muted mt-0.5">
                Humidity: {humidity}%
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {temp ?? "—"}°
          </p>
          {forecast.length > 0 && (
            <p className="text-xs text-muted mt-0.5">
              Next: {forecast[0].temperature}° {forecast[0].condition}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function CameraFeed() {
  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="size-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">Cameras</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["Front Porch", "Backyard", "Garage", "Driveway"].map((cam) => (
          <div
            key={cam}
            className="flex aspect-video items-center justify-center rounded-lg border border-border bg-black/40"
          >
            <div className="flex flex-col items-center gap-1.5">
              <Camera className="size-6 text-zinc-600" />
              <span className="text-[10px] font-medium text-zinc-500">
                {cam}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuickControl({
  entityId,
  label,
  type,
}: {
  entityId: string;
  label: string;
  type: "light" | "lock";
}) {
  const { state } = useEntity(entityId);
  const sendCommand = useSendCommand();

  const isOn = state === "on" || state === "locked";
  const isLock = type === "lock";

  const handleTap = () => {
    if (isLock) {
      sendCommand(entityId, state === "locked" ? "unlock" : "lock");
    } else {
      sendCommand(entityId, "toggle");
    }
  };

  const Icon = isLock
    ? state === "locked"
      ? Lock
      : LockOpen
    : Lightbulb;

  return (
    <button
      onClick={handleTap}
      className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-5 transition-all active:scale-95 ${
        isOn
          ? "border-accent/30 bg-accent/15 text-accent"
          : "border-border bg-card/80 text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-8" strokeWidth={1.5} />
      <span className="text-xs font-medium">{label}</span>
      <span
        className={`text-[10px] ${isOn ? "text-accent" : "text-zinc-600"}`}
      >
        {isLock
          ? state === "locked"
            ? "Locked"
            : "Unlocked"
          : state ?? "—"}
      </span>
    </button>
  );
}

function RoomControls() {
  const QUICK_CONTROLS = [
    { entityId: "light.kitchen", label: "Kitchen", type: "light" as const },
    { entityId: "light.living_room", label: "Living Room", type: "light" as const },
    { entityId: "light.main_bedroom", label: "Bedroom", type: "light" as const },
    { entityId: "lock.front_door", label: "Front Door", type: "lock" as const },
    { entityId: "lock.back_door", label: "Back Door", type: "lock" as const },
    { entityId: "light.porch", label: "Porch", type: "light" as const },
  ];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Quick Controls
      </h3>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {QUICK_CONTROLS.map((ctrl) => (
          <QuickControl
            key={ctrl.entityId}
            entityId={ctrl.entityId}
            label={ctrl.label}
            type={ctrl.type}
          />
        ))}
      </div>
    </Card>
  );
}

function ClimateStrip() {
  const { entityStates } = useWebSocket();

  const climateEntities = useMemo(() => {
    const items: Array<{ name: string; temp: string; action: string }> = [];
    for (const [, entity] of entityStates) {
      if (entity.domain === "climate") {
        const currentTemp = entity.attributes.current_temperature as
          | number
          | undefined;
        items.push({
          name:
            (entity.attributes.friendly_name as string) ?? entity.entity_id,
          temp: currentTemp != null ? `${Math.round(currentTemp)}°` : "—",
          action:
            (entity.attributes.hvac_action as string) ?? entity.state ?? "idle",
        });
      }
    }
    return items;
  }, [entityStates]);

  if (climateEntities.length === 0) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Thermometer className="size-4 text-muted" />
          <span className="text-sm text-muted">
            Climate data awaiting bridge connection
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Thermometer className="size-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">Climate</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {climateEntities.map((c) => (
          <div
            key={c.name}
            className="rounded-xl bg-surface/50 px-3 py-3 text-center"
          >
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {c.temp}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">{c.name}</p>
            <Badge
              variant={
                c.action === "heating"
                  ? "warning"
                  : c.action === "cooling"
                    ? "info"
                    : "default"
              }
              size="sm"
              className="mt-1"
            >
              {c.action}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function KioskPage() {
  const { mode } = useSystemMode();

  const ModeIcon = mode ? MODE_ICONS[mode] : Sun;

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="mx-auto max-w-[1600px] space-y-8">
        {/* Top bar: mode badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode && (
              <Badge variant="info">
                <ModeIcon className="mr-1.5 inline size-3.5" />
                {mode.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <Badge variant="default" size="sm">
            Kiosk Mode
          </Badge>
        </div>

        {/* Clock */}
        <DigitalClock />

        {/* Weather + Camera row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <WeatherSummary />
          <ClimateStrip />
        </div>

        {/* Camera feeds */}
        <CameraFeed />

        {/* Quick controls */}
        <RoomControls />
      </div>
    </div>
  );
}
