"use client";

import {
  Zap,
  Sun,
  Battery,
  ArrowDownToLine,
  ArrowUpFromLine,
  Home,
  Car,
  PlugZap,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Gauge } from "@/components/ui/Gauge";
import { useEntity } from "@/hooks/useEntity";
import { useWebSocket } from "@/providers/WebSocketProvider";

function EnergyValue({
  label,
  entityId,
  unit,
  icon: Icon,
  color,
  awaitingLabel,
}: {
  label: string;
  entityId: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  awaitingLabel?: string;
}) {
  const { state, loading } = useEntity(entityId);
  const value = state ? parseFloat(state) : null;
  const hasValue = value !== null && !isNaN(value);

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}26` }}
        >
          <Icon className="size-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {!hasValue && !loading && awaitingLabel && (
            <Badge variant="default" size="sm">
              {awaitingLabel}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums text-foreground">
          {hasValue ? value.toFixed(1) : "—"}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </Card>
  );
}

function BatteryGauge({
  entityId,
  label,
}: {
  entityId: string;
  label: string;
}) {
  const { state, loading } = useEntity(entityId);
  const value = state ? parseFloat(state) : 0;
  const hasValue = state !== undefined && !isNaN(value);

  const gaugeColor =
    value > 60 ? "#22c55e" : value > 25 ? "#eab308" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <Gauge
        value={hasValue ? value : 0}
        min={0}
        max={100}
        size="lg"
        unit="%"
        label={label}
        color={gaugeColor}
      />
      {!hasValue && !loading && (
        <Badge variant="default" size="sm">
          Awaiting Tesla API
        </Badge>
      )}
    </div>
  );
}

function VehicleCard({
  name,
  batteryEntityId,
  chargingEntityId,
  rangeEntityId,
}: {
  name: string;
  batteryEntityId: string;
  chargingEntityId: string;
  rangeEntityId: string;
}) {
  const { state: batteryState } = useEntity(batteryEntityId);
  const { state: chargingState } = useEntity(chargingEntityId);
  const { state: rangeState } = useEntity(rangeEntityId);

  const battery = batteryState ? parseFloat(batteryState) : null;
  const hasBattery = battery !== null && !isNaN(battery);
  const isCharging = chargingState === "charging" || chargingState === "on";
  const range = rangeState ? parseFloat(rangeState) : null;
  const hasRange = range !== null && !isNaN(range);

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
          <Car className="size-5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <div className="flex items-center gap-2">
            {isCharging && (
              <Badge variant="success" size="sm">
                <PlugZap className="mr-1 inline size-3" />
                Charging
              </Badge>
            )}
            {!hasBattery && (
              <Badge variant="default" size="sm">
                Awaiting Tesla API
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Gauge
          value={hasBattery ? battery : 0}
          min={0}
          max={100}
          size="md"
          unit="%"
          label="Battery"
          color={
            hasBattery
              ? battery > 60
                ? "#22c55e"
                : battery > 25
                  ? "#eab308"
                  : "#ef4444"
              : "#3b82f6"
          }
        />
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {hasRange ? `${Math.round(range)}` : "—"}
          </p>
          <p className="text-xs text-muted">miles range</p>
        </div>
      </div>
    </Card>
  );
}

export default function EnergyPage() {
  const { connected } = useWebSocket();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-yellow-500/15">
            <Zap className="size-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Energy Dashboard
            </h1>
            <p className="text-sm text-muted">
              Solar, battery, grid &amp; EV charging
            </p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Energy Flow Overview */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Energy Flow
        </h3>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div className="flex flex-col items-center gap-2">
            <Sun className="size-8 text-yellow-400" />
            <p className="text-xs text-muted">Solar Production</p>
            <EnergyInlineValue entityId="sensor.solar_power" unit="kW" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Battery className="size-8 text-emerald-400" />
            <p className="text-xs text-muted">Powerwall</p>
            <EnergyInlineValue entityId="sensor.powerwall_charge" unit="%" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <ArrowDownToLine className="size-8 text-blue-400" />
            <p className="text-xs text-muted">Grid Import</p>
            <EnergyInlineValue entityId="sensor.grid_import_power" unit="kW" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Home className="size-8 text-purple-400" />
            <p className="text-xs text-muted">House Load</p>
            <EnergyInlineValue entityId="sensor.house_consumption" unit="kW" />
          </div>
        </div>
      </Card>

      {/* Detail Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EnergyValue
          label="Solar Production"
          entityId="sensor.solar_power"
          unit="kW"
          icon={Sun}
          color="#eab308"
          awaitingLabel="Awaiting Tesla API"
        />
        <EnergyValue
          label="Grid Export"
          entityId="sensor.grid_export_power"
          unit="kW"
          icon={ArrowUpFromLine}
          color="#22c55e"
          awaitingLabel="Awaiting Tesla API"
        />
        <EnergyValue
          label="Grid Import"
          entityId="sensor.grid_import_power"
          unit="kW"
          icon={ArrowDownToLine}
          color="#3b82f6"
          awaitingLabel="Awaiting Tesla API"
        />
        <EnergyValue
          label="House Consumption"
          entityId="sensor.house_consumption"
          unit="kW"
          icon={Home}
          color="#a855f7"
          awaitingLabel="Awaiting Tesla API"
        />
      </div>

      {/* Battery */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Powerwall Battery
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-8">
          <BatteryGauge entityId="sensor.powerwall_charge" label="State of Charge" />
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted">Battery Power</p>
              <EnergyInlineValue entityId="sensor.powerwall_power" unit="kW" />
            </div>
            <div>
              <p className="text-xs text-muted">Backup Reserve</p>
              <EnergyInlineValue entityId="sensor.powerwall_backup_reserve" unit="%" />
            </div>
          </div>
        </div>
      </Card>

      {/* EV Charging */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">
          EV Charging
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <VehicleCard
            name="Enterprise"
            batteryEntityId="sensor.enterprise_battery_level"
            chargingEntityId="sensor.enterprise_charging_state"
            rangeEntityId="sensor.enterprise_range"
          />
          <VehicleCard
            name="Voyager"
            batteryEntityId="sensor.voyager_battery_level"
            chargingEntityId="sensor.voyager_charging_state"
            rangeEntityId="sensor.voyager_range"
          />
        </div>
      </div>
    </div>
  );
}

function EnergyInlineValue({
  entityId,
  unit,
}: {
  entityId: string;
  unit: string;
}) {
  const { state } = useEntity(entityId);
  const value = state ? parseFloat(state) : null;
  const hasValue = value !== null && !isNaN(value);

  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-bold tabular-nums text-foreground">
        {hasValue ? value.toFixed(1) : "—"}
      </span>
      <span className="text-xs text-muted">{unit}</span>
      {!hasValue && (
        <Badge variant="default" size="sm" className="ml-1">
          Awaiting Tesla API
        </Badge>
      )}
    </div>
  );
}
