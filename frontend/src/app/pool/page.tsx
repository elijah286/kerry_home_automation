"use client";

import { useCallback } from "react";
import {
  Waves,
  Thermometer,
  Flame,
  Wind,
  Droplets,
  Filter,
  Power,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { IconButton } from "@/components/ui/IconButton";
import { Gauge } from "@/components/ui/Gauge";
import { useEntity } from "@/hooks/useEntity";
import { useSendCommand } from "@/hooks/useSendCommand";
import { useWebSocket } from "@/providers/WebSocketProvider";

function TemperatureDisplay({
  entityId,
  label,
  icon: Icon,
  color,
}: {
  entityId: string;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const { state } = useEntity(entityId);
  const temp = state ? parseFloat(state) : null;
  const hasValue = temp !== null && !isNaN(temp);

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}26` }}
        >
          <Icon className="size-5" style={{ color }} />
        </div>
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      {hasValue ? (
        <Gauge
          value={temp}
          min={50}
          max={110}
          size="md"
          unit="°F"
          label={label}
          color={color}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 py-4">
          <span className="text-3xl font-bold text-foreground">—</span>
          <Badge variant="default" size="sm">Awaiting Pentair</Badge>
        </div>
      )}
    </Card>
  );
}

function EquipmentToggle({
  entityId,
  label,
}: {
  entityId: string;
  label: string;
}) {
  const { state } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const isOn = state === "on";

  const handleToggle = useCallback(
    (checked: boolean) => {
      sendCommand(entityId, checked ? "turn_on" : "turn_off");
    },
    [entityId, sendCommand],
  );

  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {state === undefined && (
          <Badge variant="default" size="sm">Awaiting Pentair</Badge>
        )}
        <Toggle checked={isOn} onChange={handleToggle} size="sm" />
      </div>
    </div>
  );
}

function HeaterControl({
  entityId,
  targetEntityId,
}: {
  entityId: string;
  targetEntityId: string;
}) {
  const { state } = useEntity(entityId);
  const { state: targetState } = useEntity(targetEntityId);
  const sendCommand = useSendCommand();
  const isOn = state === "on" || state === "heating";
  const targetTemp = targetState ? parseFloat(targetState) : null;
  const hasTarget = targetTemp !== null && !isNaN(targetTemp);

  const handleToggle = useCallback(
    (checked: boolean) => {
      sendCommand(entityId, checked ? "turn_on" : "turn_off");
    },
    [entityId, sendCommand],
  );

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
          <Flame className="size-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Heater</p>
          <p className="text-xs text-muted">
            {isOn ? "Heating" : "Off"}
            {hasTarget && ` · Target ${targetTemp}°F`}
          </p>
        </div>
        {state === undefined ? (
          <Badge variant="default" size="sm">Awaiting Pentair</Badge>
        ) : (
          <Toggle checked={isOn} onChange={handleToggle} />
        )}
      </div>
      {hasTarget && (
        <div className="flex items-center gap-3 mt-2">
          <Gauge
            value={targetTemp}
            min={70}
            max={104}
            size="sm"
            unit="°F"
            label="Target"
            color="#f97316"
          />
        </div>
      )}
    </Card>
  );
}

export default function PoolPage() {
  const { connected } = useWebSocket();
  const sendCommand = useSendCommand();

  const pumpEntity = useEntity("switch.pool_pump");
  const pumpOn = pumpEntity.state === "on";

  const handlePumpToggle = useCallback(
    (checked: boolean) => {
      sendCommand("switch.pool_pump", checked ? "turn_on" : "turn_off");
    },
    [sendCommand],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/15">
            <Waves className="size-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Pool &amp; Spa
            </h1>
            <p className="text-sm text-muted">Pentair IntelliCenter controls</p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Temperatures */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TemperatureDisplay
          entityId="sensor.pool_temperature"
          label="Pool Temperature"
          icon={Thermometer}
          color="#06b6d4"
        />
        <TemperatureDisplay
          entityId="sensor.spa_temperature"
          label="Spa Temperature"
          icon={Thermometer}
          color="#f97316"
        />
      </div>

      {/* Heater */}
      <HeaterControl
        entityId="switch.pool_heater"
        targetEntityId="number.pool_heater_target"
      />

      {/* Pump */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
            <Power className="size-5 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Pool Pump</p>
            <p className="text-xs text-muted">
              {pumpEntity.state === undefined
                ? "Unknown"
                : pumpOn
                  ? "Running"
                  : "Off"}
            </p>
          </div>
          {pumpEntity.state === undefined ? (
            <Badge variant="default" size="sm">Awaiting Pentair</Badge>
          ) : (
            <Toggle checked={pumpOn} onChange={handlePumpToggle} />
          )}
        </div>
      </Card>

      {/* Equipment Controls */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Equipment Controls
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IconButton
            icon={Filter}
            label="Cleaner"
            variant="primary"
            onClick={() => sendCommand("switch.pool_cleaner", "toggle")}
          />
          <IconButton
            icon={Waves}
            label="Waterfall"
            variant="primary"
            onClick={() => sendCommand("switch.pool_waterfall", "toggle")}
          />
          <IconButton
            icon={Wind}
            label="Air Blower"
            variant="primary"
            onClick={() => sendCommand("switch.spa_air_blower", "toggle")}
          />
          <IconButton
            icon={Sparkles}
            label="Spa Jets"
            variant="primary"
            onClick={() => sendCommand("switch.spa_jets", "toggle")}
          />
        </div>
      </Card>

      {/* Additional Toggles */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Auxiliary Equipment
        </h3>
        <div className="space-y-1.5">
          <EquipmentToggle entityId="switch.pool_light" label="Pool Light" />
          <EquipmentToggle entityId="switch.spa_light" label="Spa Light" />
          <EquipmentToggle entityId="switch.pool_cleaner" label="Cleaner" />
          <EquipmentToggle entityId="switch.pool_waterfall" label="Waterfall" />
          <EquipmentToggle entityId="switch.spa_air_blower" label="Air Blower" />
          <EquipmentToggle entityId="switch.spa_jets" label="Spa Jets" />
        </div>
      </Card>

      {/* Chemistry placeholder */}
      <Card>
        <div className="flex items-center gap-3">
          <Droplets className="size-5 text-cyan-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Water Chemistry
            </p>
            <p className="text-xs text-muted">
              pH, ORP, and chlorine levels
            </p>
          </div>
          <Badge variant="default" size="sm" className="ml-auto">
            Awaiting Pentair
          </Badge>
        </div>
      </Card>
    </div>
  );
}
