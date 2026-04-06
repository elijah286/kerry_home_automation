"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Thermometer,
  Droplets,
  Flame,
  Snowflake,
  Fan,
  Loader2,
  Wind,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClimateCard } from "@/components/entities/ClimateCard";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { fetchAreas } from "@/lib/api";
import type { EntityState, AreaWithFloor } from "@/types";

type HvacAction = "idle" | "heating" | "cooling" | "fan" | "drying" | "off";

const hvacBadge: Record<
  HvacAction,
  { variant: "default" | "success" | "warning" | "danger" | "info"; label: string; icon: typeof Flame }
> = {
  heating: { variant: "warning", label: "Heating", icon: Flame },
  cooling: { variant: "info", label: "Cooling", icon: Snowflake },
  fan: { variant: "success", label: "Fan", icon: Fan },
  idle: { variant: "default", label: "Idle", icon: Wind },
  drying: { variant: "warning", label: "Drying", icon: Droplets },
  off: { variant: "default", label: "Off", icon: Thermometer },
};

const FLOOR_ORDER = ["Main Floor", "Upstairs", "Outdoors", "Technology", "Attic"];

function floorSortKey(name: string): number {
  const idx = FLOOR_ORDER.indexOf(name);
  return idx >= 0 ? idx : FLOOR_ORDER.length;
}

function SensorTile({
  entity,
  icon: Icon,
  unit,
}: {
  entity: EntityState;
  icon: typeof Thermometer;
  unit: string;
}) {
  const val = parseFloat(entity.state);
  const name =
    (entity.attributes.friendly_name as string) ?? entity.entity_id;

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface/50 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="truncate text-xs font-medium text-foreground">
          {name}
        </span>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {isNaN(val) ? entity.state : `${Math.round(val * 10) / 10}${unit}`}
      </span>
    </div>
  );
}

export default function ClimatePage() {
  const { entityStates, initialSyncDone } = useWebSocket();
  const [areas, setAreas] = useState<AreaWithFloor[]>([]);

  useEffect(() => {
    fetchAreas()
      .then((r) => setAreas(r.areas))
      .catch(() => {});
  }, []);

  const areaMap = useMemo(() => {
    const m = new Map<string, AreaWithFloor>();
    for (const a of areas) m.set(a.id, a);
    return m;
  }, [areas]);

  const { climateEntities, tempSensors, humiditySensors, hvacCounts } =
    useMemo(() => {
      const climate: EntityState[] = [];
      const temp: EntityState[] = [];
      const humidity: EntityState[] = [];
      const counts: Record<HvacAction, number> = {
        heating: 0,
        cooling: 0,
        fan: 0,
        idle: 0,
        drying: 0,
        off: 0,
      };

      for (const [, entity] of entityStates) {
        if (entity.domain === "climate") {
          climate.push(entity);
          const action =
            (entity.attributes.hvac_action as HvacAction) ??
            (entity.state as HvacAction) ??
            "idle";
          if (action in counts) counts[action]++;
        } else if (entity.domain === "sensor") {
          const dc = entity.attributes.device_class as string | undefined;
          if (dc === "temperature") temp.push(entity);
          else if (dc === "humidity") humidity.push(entity);
        }
      }

      climate.sort((a, b) =>
        ((a.attributes.friendly_name as string) ?? a.entity_id).localeCompare(
          (b.attributes.friendly_name as string) ?? b.entity_id,
        ),
      );
      temp.sort((a, b) =>
        ((a.attributes.friendly_name as string) ?? a.entity_id).localeCompare(
          (b.attributes.friendly_name as string) ?? b.entity_id,
        ),
      );
      humidity.sort((a, b) =>
        ((a.attributes.friendly_name as string) ?? a.entity_id).localeCompare(
          (b.attributes.friendly_name as string) ?? b.entity_id,
        ),
      );

      return {
        climateEntities: climate,
        tempSensors: temp,
        humiditySensors: humidity,
        hvacCounts: counts,
      };
    }, [entityStates]);

  const groupedTemp = useMemo(() => {
    const map = new Map<string, EntityState[]>();
    for (const s of tempSensors) {
      const areaId = s.attributes.area_id as string | undefined;
      const area = areaId ? areaMap.get(areaId) : undefined;
      const floorName = area?.floor?.name ?? "Other";
      const list = map.get(floorName) ?? [];
      list.push(s);
      map.set(floorName, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => floorSortKey(a) - floorSortKey(b),
    );
  }, [tempSensors, areaMap]);

  const activeHvac = (Object.entries(hvacCounts) as [HvacAction, number][]).filter(
    ([action, count]) => count > 0 && action !== "idle" && action !== "off",
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <Thermometer size={20} strokeWidth={1.8} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Climate</h1>
          <p className="text-sm text-muted">
            {initialSyncDone
              ? `${climateEntities.length} thermostats · ${tempSensors.length} temp sensors`
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
        <>
          {/* HVAC Status Summary */}
          <div className="flex flex-wrap gap-2">
            {activeHvac.length > 0 ? (
              activeHvac.map(([action, count]) => {
                const cfg = hvacBadge[action];
                const BadgeIcon = cfg.icon;
                return (
                  <Badge key={action} variant={cfg.variant}>
                    <BadgeIcon className="mr-1 inline size-3" />
                    {count} {cfg.label}
                  </Badge>
                );
              })
            ) : (
              <Badge variant="default">All systems idle</Badge>
            )}
            <Badge variant="default">
              {tempSensors.length} temperature · {humiditySensors.length}{" "}
              humidity
            </Badge>
          </div>

          {/* Climate Entities */}
          {climateEntities.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Thermostats
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {climateEntities.map((entity) => (
                  <ClimateCard
                    key={entity.entity_id}
                    entityId={entity.entity_id}
                  />
                ))}
              </div>
            </section>
          )}

          {climateEntities.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Thermometer size={32} className="text-muted" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    No thermostats found
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Climate entities will appear once Z-Wave or other bridges
                    are connected
                  </p>
                </div>
                <Badge variant="default">Awaiting Bridge Connection</Badge>
              </div>
            </Card>
          )}

          {/* Temperature Sensors */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Temperature Sensors
            </h2>
            {tempSensors.length > 0 ? (
              groupedTemp.length > 1 ? (
                groupedTemp.map(([floorName, sensors]) => (
                  <div key={floorName} className="space-y-2">
                    <h3 className="text-xs font-medium text-zinc-500">
                      {floorName}
                    </h3>
                    <Card padding="sm">
                      <div className="space-y-1">
                        {sensors.map((s) => (
                          <SensorTile
                            key={s.entity_id}
                            entity={s}
                            icon={Thermometer}
                            unit="°F"
                          />
                        ))}
                      </div>
                    </Card>
                  </div>
                ))
              ) : (
                <Card padding="sm">
                  <div className="space-y-1">
                    {tempSensors.map((s) => (
                      <SensorTile
                        key={s.entity_id}
                        entity={s}
                        icon={Thermometer}
                        unit="°F"
                      />
                    ))}
                  </div>
                </Card>
              )
            ) : (
              <Card>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Thermometer className="size-8 text-muted" />
                  <p className="text-xs text-muted">
                    No temperature sensors found
                  </p>
                </div>
              </Card>
            )}
          </section>

          {/* Humidity Sensors */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Humidity Sensors
            </h2>
            {humiditySensors.length > 0 ? (
              <Card padding="sm">
                <div className="space-y-1">
                  {humiditySensors.map((s) => (
                    <SensorTile
                      key={s.entity_id}
                      entity={s}
                      icon={Droplets}
                      unit="%"
                    />
                  ))}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Droplets className="size-8 text-muted" />
                  <p className="text-xs text-muted">
                    No humidity sensors found
                  </p>
                </div>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
