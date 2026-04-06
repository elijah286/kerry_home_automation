"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Radio,
  Film,
  Music,
  Gamepad2,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { MediaPlayerCard } from "@/components/entities/MediaPlayerCard";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useSendCommand } from "@/hooks/useSendCommand";
import { fetchEntities, fetchAreas } from "@/lib/api";
import type { EntityState, AreaWithFloor } from "@/types";

const MACROS = [
  { id: "movie_night", label: "Movie Night", icon: Film },
  { id: "music_mode", label: "Music Mode", icon: Music },
  { id: "game_time", label: "Game Time", icon: Gamepad2 },
] as const;

export default function AVPage() {
  const { entityStates, connected, initialSyncDone } = useWebSocket();
  const sendCommand = useSendCommand();
  const [areas, setAreas] = useState<AreaWithFloor[]>([]);
  const [entityList, setEntityList] = useState<EntityState[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMacro, setActiveMacro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchEntities({ domain: "media_player" }),
      fetchAreas(),
    ])
      .then(([entRes, areaRes]) => {
        if (cancelled) return;
        setEntityList(entRes.entities);
        setAreas(areaRes.areas);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mediaPlayers = useMemo(() => {
    const players: EntityState[] = [];
    for (const [, entity] of entityStates) {
      if (entity.domain === "media_player") {
        players.push(entity);
      }
    }
    if (players.length === 0) return entityList;
    return players;
  }, [entityStates, entityList]);

  const areaMap = useMemo(() => {
    const map = new Map<string, AreaWithFloor>();
    for (const area of areas) {
      map.set(area.id, area);
    }
    return map;
  }, [areas]);

  const grouped = useMemo(() => {
    const groups = new Map<string, EntityState[]>();
    for (const entity of mediaPlayers) {
      const areaId = (entity.attributes.area_id as string) ?? "unassigned";
      const existing = groups.get(areaId) ?? [];
      existing.push(entity);
      groups.set(areaId, existing);
    }
    return groups;
  }, [mediaPlayers]);

  const handleMacro = (macroId: string) => {
    setActiveMacro(macroId);
    sendCommand(`script.${macroId}`, "turn_on");
    setTimeout(() => setActiveMacro(null), 3000);
  };

  if (loading && !initialSyncDone) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-accent" />
          <span className="text-sm text-muted">Loading A/V devices...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15">
            <Radio className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              A/V Control Center
            </h1>
            <p className="text-sm text-muted">
              {mediaPlayers.length} media player{mediaPlayers.length !== 1 && "s"}
              {!connected && " · Disconnected"}
            </p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Quick Macros */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Quick Macros
        </h3>
        <div className="flex flex-wrap gap-3">
          {MACROS.map((macro) => (
            <IconButton
              key={macro.id}
              icon={macro.icon}
              label={macro.label}
              variant="primary"
              active={activeMacro === macro.id}
              onClick={() => handleMacro(macro.id)}
            />
          ))}
        </div>
      </Card>

      {/* Media Players by Room */}
      {mediaPlayers.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <Radio className="size-10 text-zinc-600" />
            <p className="text-sm text-muted">No media players discovered yet</p>
            <Badge variant="default">Awaiting Bridge Connections</Badge>
          </div>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([areaId, players]) => {
          const area = areaMap.get(areaId);
          const areaName = area?.name ?? (areaId === "unassigned" ? "Unassigned" : areaId);

          return (
            <section key={areaId}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  {areaName}
                </h2>
                <Badge variant="default" size="sm">
                  {players.length}
                </Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((player) => (
                  <MediaPlayerCard
                    key={player.entity_id}
                    entityId={player.entity_id}
                    name={player.attributes.friendly_name as string | undefined}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
