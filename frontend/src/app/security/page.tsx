"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  LockOpen,
  DoorOpen,
  DoorClosed,
  Eye,
  Activity,
  Loader2,
  Hash,
  Delete,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EntityCard } from "@/components/entities/EntityCard";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useEntity } from "@/hooks/useEntity";
import { useSendCommand } from "@/hooks/useSendCommand";
import type { EntityState } from "@/types";

const ALARM_ENTITY = "alarm_control_panel.home_alarm";

const LOCK_IDS = [
  { id: "lock.front_door", label: "Front Door Lock" },
  { id: "lock.back_door", label: "Back Door Lock" },
];

function AlarmPanel() {
  const { state, attributes } = useEntity(ALARM_ENTITY);
  const sendCommand = useSendCommand();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  const isArmed = state?.startsWith("armed");
  const isDisarmed = state === "disarmed";
  const alarmLabel =
    (attributes.friendly_name as string) ?? "Home Alarm";

  const handleArm = useCallback(
    async (mode: string) => {
      setPending(true);
      sendCommand(ALARM_ENTITY, `arm_${mode}`, code ? { code } : undefined);
      setCode("");
      setTimeout(() => setPending(false), 2000);
    },
    [code, sendCommand],
  );

  const handleDisarm = useCallback(() => {
    setPending(true);
    sendCommand(ALARM_ENTITY, "disarm", code ? { code } : undefined);
    setCode("");
    setTimeout(() => setPending(false), 2000);
  }, [code, sendCommand]);

  const statusVariant = isArmed
    ? "danger"
    : isDisarmed
      ? "success"
      : "warning";

  const StatusIcon = isArmed ? ShieldAlert : ShieldCheck;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-12 items-center justify-center rounded-xl ${
              isArmed ? "bg-red-500/15" : "bg-green-500/15"
            }`}
          >
            <StatusIcon
              className={`size-6 ${isArmed ? "text-red-400" : "text-green-400"}`}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{alarmLabel}</p>
            <Badge variant={statusVariant} size="sm" className="mt-1">
              {state?.replace(/_/g, " ") ?? "Unknown"}
            </Badge>
          </div>
        </div>
        {pending && <Loader2 className="size-5 animate-spin text-muted" />}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface/50 px-3 py-2">
          <Hash className="size-4 text-muted" />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-zinc-600 outline-none"
          />
          {code && (
            <button onClick={() => setCode("")}>
              <Delete className="size-4 text-zinc-500 hover:text-foreground" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isArmed || state === "pending" ? (
            <button
              onClick={handleDisarm}
              disabled={pending}
              className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
            >
              <ShieldCheck className="size-4" />
              Disarm
            </button>
          ) : (
            <>
              <button
                onClick={() => handleArm("away")}
                disabled={pending}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                <ShieldAlert className="size-4" />
                Arm Away
              </button>
              <button
                onClick={() => handleArm("home")}
                disabled={pending}
                className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 disabled:opacity-50"
              >
                <Shield className="size-4" />
                Arm Home
              </button>
              <button
                onClick={() => handleArm("night")}
                disabled={pending}
                className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
              >
                <Shield className="size-4" />
                Arm Night
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function LockControl({
  entityId,
  label,
}: {
  entityId: string;
  label: string;
}) {
  const { state, attributes } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const isLocked = state === "locked";
  const displayName =
    label ?? (attributes.friendly_name as string) ?? entityId;

  return (
    <Card hoverable onClick={() => sendCommand(entityId, isLocked ? "unlock" : "lock")}>
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-xl ${
            isLocked ? "bg-green-500/15" : "bg-yellow-500/15"
          }`}
        >
          {isLocked ? (
            <Lock className="size-5 text-green-400" />
          ) : (
            <LockOpen className="size-5 text-yellow-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {displayName}
          </p>
          <Badge
            variant={isLocked ? "success" : "warning"}
            size="sm"
            className="mt-1"
          >
            {isLocked ? "Locked" : "Unlocked"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

function formatTimeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function SecurityPage() {
  const { entityStates, initialSyncDone } = useWebSocket();

  const { doors, motion, locks } = useMemo(() => {
    const d: EntityState[] = [];
    const m: EntityState[] = [];
    const l: EntityState[] = [];

    for (const [, entity] of entityStates) {
      if (entity.domain === "lock") {
        l.push(entity);
      } else if (entity.domain === "binary_sensor") {
        const dc = entity.attributes.device_class as string | undefined;
        if (dc === "door" || dc === "window" || dc === "garage_door") {
          d.push(entity);
        } else if (dc === "motion" || dc === "occupancy") {
          m.push(entity);
        }
      }
    }

    d.sort((a, b) =>
      ((a.attributes.friendly_name as string) ?? a.entity_id).localeCompare(
        (b.attributes.friendly_name as string) ?? b.entity_id,
      ),
    );
    m.sort((a, b) => (b.last_changed ?? 0) - (a.last_changed ?? 0));

    return { doors: d, motion: m, locks: l };
  }, [entityStates]);

  const openDoors = doors.filter((d) => d.state === "on");
  const activeMotion = motion.filter((m) => m.state === "on");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <Shield size={20} strokeWidth={1.8} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security</h1>
          <p className="text-sm text-muted">
            {initialSyncDone
              ? `${doors.length} sensors · ${locks.length} locks`
              : "Connecting..."}
          </p>
        </div>
      </div>

      {!initialSyncDone && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted" />
        </div>
      )}

      {initialSyncDone && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column — Alarm + Locks */}
          <div className="space-y-4">
            <AlarmPanel />

            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Lock className="size-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">Locks</h3>
              </div>
              {LOCK_IDS.length > 0 ? (
                <div className="space-y-3">
                  {LOCK_IDS.map((l) => (
                    <LockControl
                      key={l.id}
                      entityId={l.id}
                      label={l.label}
                    />
                  ))}
                </div>
              ) : locks.length > 0 ? (
                <div className="space-y-3">
                  {locks.map((l) => (
                    <LockControl
                      key={l.entity_id}
                      entityId={l.entity_id}
                      label={
                        (l.attributes.friendly_name as string) ?? l.entity_id
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  No lock devices discovered
                </p>
              )}
            </Card>
          </div>

          {/* Center Column — Door & Window Sensors */}
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DoorClosed className="size-4 text-accent" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Doors & Windows
                  </h3>
                </div>
                {openDoors.length > 0 ? (
                  <Badge variant="warning" size="sm">
                    {openDoors.length} Open
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm">
                    All Closed
                  </Badge>
                )}
              </div>

              {doors.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {doors.map((sensor) => {
                    const isOpen = sensor.state === "on";
                    const name =
                      (sensor.attributes.friendly_name as string) ??
                      sensor.entity_id;
                    return (
                      <div
                        key={sensor.entity_id}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                          isOpen
                            ? "bg-yellow-500/10 border border-yellow-500/20"
                            : "bg-surface/50"
                        }`}
                      >
                        {isOpen ? (
                          <DoorOpen className="size-4 shrink-0 text-yellow-400" />
                        ) : (
                          <DoorClosed className="size-4 shrink-0 text-green-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {name}
                          </p>
                          <p
                            className={`text-[10px] ${isOpen ? "text-yellow-400" : "text-green-400"}`}
                          >
                            {isOpen ? "Open" : "Closed"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <DoorClosed className="size-8 text-muted" />
                  <p className="text-xs text-muted">
                    No door/window sensors found
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column — Motion Detection */}
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-accent" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Motion Detection
                  </h3>
                </div>
                {activeMotion.length > 0 && (
                  <Badge variant="info" size="sm">
                    <Activity className="mr-1 inline size-3" />
                    {activeMotion.length} Active
                  </Badge>
                )}
              </div>

              {motion.length > 0 ? (
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                  {motion.map((sensor) => {
                    const isActive = sensor.state === "on";
                    const name =
                      (sensor.attributes.friendly_name as string) ??
                      sensor.entity_id;
                    return (
                      <div
                        key={sensor.entity_id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                          isActive
                            ? "bg-blue-500/10 border border-blue-500/20"
                            : "bg-surface/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`size-2 rounded-full ${
                              isActive
                                ? "bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.4)]"
                                : "bg-zinc-700"
                            }`}
                          />
                          <span className="truncate text-xs font-medium text-foreground">
                            {name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted">
                          {sensor.last_changed
                            ? formatTimeAgo(sensor.last_changed)
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Eye className="size-8 text-muted" />
                  <p className="text-xs text-muted">
                    No motion sensors found
                  </p>
                </div>
              )}
            </Card>

            {/* Summary */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Security Summary
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Contact Sensors</span>
                  <span className="text-xs font-medium text-foreground">
                    {doors.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Open Doors/Windows</span>
                  <span
                    className={`text-xs font-medium ${openDoors.length > 0 ? "text-yellow-400" : "text-green-400"}`}
                  >
                    {openDoors.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Motion Sensors</span>
                  <span className="text-xs font-medium text-foreground">
                    {motion.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Active Motion</span>
                  <span
                    className={`text-xs font-medium ${activeMotion.length > 0 ? "text-blue-400" : "text-foreground"}`}
                  >
                    {activeMotion.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Locks</span>
                  <span className="text-xs font-medium text-foreground">
                    {locks.length || LOCK_IDS.length}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
