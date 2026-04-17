'use client';

// ---------------------------------------------------------------------------
// ThermostatCard — compact tile for a climate / thermostat device.
//
// What it shows:
//   - Device name + a live HVAC-action badge (Heating / Cooling / Idle / Off)
//   - Current indoor temperature and (if available) humidity
//   - Setpoint row(s) with − / + controls, chosen from `device.hvacMode`:
//       * heat → heat setpoint only
//       * cool → cool setpoint only
//       * auto → both
//       * auxHeatOnly → heat setpoint (aux runs on heat call)
//       * off → "System off" placeholder
//   - Optional mode selector (hidden when `card.showModeControl === false`)
//
// What it deliberately *doesn't* cover:
//   - Fan-mode, vacation, ventilator, presets, per-sensor climate assignment —
//     those live on the full-page `ThermostatControl` on the device detail
//     view. The card is meant to live on a dashboard next to eight other
//     tiles; anything requiring a sub-menu belongs upstream.
//
// Optimistic setpoint UX: tapping − / + immediately moves the displayed
// value and fires `set_{heat,cool}_setpoint`. We keep the optimistic value
// until the next WebSocket echo (or a short timeout after the command
// resolves), so rapid tapping feels instant rather than waiting for each
// round-trip. This is the same pattern `CoverTileCard` uses for position
// drag release.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type {
  ThermostatCard as ThermostatCardDescriptor,
  ThermostatState,
  ThermostatMode,
} from '@ha/shared';
import { Flame, Snowflake, Wind, Power, CircleDot, Minus, Plus } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { Select } from '@/components/ui/Select';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

// HA-parity modes; `auxHeatOnly` is ecobee-only, others are universal.
const HVAC_OPTIONS: { value: ThermostatMode; label: string }[] = [
  { value: 'heat', label: 'Heat' },
  { value: 'cool', label: 'Cool' },
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
  { value: 'auxHeatOnly', label: 'Aux' },
];

// Minimum allowed setpoint — matches the full-page control (packages/
// frontend/src/components/ThermostatControl.tsx). Covers are centred on
// Fahrenheit; a future pass will localize once the device model exposes
// temperature units.
const HEAT_MIN = 45;
const HEAT_MAX = 85;
const COOL_MIN = 45;
const COOL_MAX = 95;

// The `info` severity maps to `--color-accent` (see packages/shared/src/
// themes/tokens.ts :: SEVERITY_TO_TOKEN). It's the closest theme-aware
// "not danger, not success, not warning" we have — so cooling gets the
// accent colour, which reads as blue/teal in most themes. On the rose/
// crimson themes where accent is red, the snowflake icon still carries the
// semantics; the pop just fades.
const COOL_COLOR = severityVar('info');

// ---------------------------------------------------------------------------
// Top-level card — dispatches to the body via EntityBoundary
// ---------------------------------------------------------------------------

export function ThermostatCard({ card }: { card: ThermostatCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => {
      if (d.type !== 'thermostat') return <div />;
      return <ThermostatCardBody card={card} device={d} />;
    },
    { title: card.name },
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function ThermostatCardBody({
  card,
  device,
}: {
  card: ThermostatCardDescriptor;
  device: ThermostatState;
}) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;
  const visual = hvacActionVisual(device);
  const HvacIcon = visual.Icon;

  // Optimistic setpoints: shown while a tap hasn't round-tripped yet. Each
  // − / + press sets `pending{Heat,Cool}` immediately and clears it once the
  // server echoes the new value (or a grace period after the command
  // resolves, whichever is first).
  const [pendingHeat, setPendingHeat] = useState<number | null>(null);
  const [pendingCool, setPendingCool] = useState<number | null>(null);

  // When the server's value catches up to the optimistic target, drop the
  // override so drift-on-stale-state is impossible. Without this the card
  // would show the stale pending value if the server silently overrode (e.g.
  // a vacation schedule kicking in).
  useEffect(() => {
    if (pendingHeat !== null && device.heatSetpoint === pendingHeat) setPendingHeat(null);
  }, [device.heatSetpoint, pendingHeat]);
  useEffect(() => {
    if (pendingCool !== null && device.coolSetpoint === pendingCool) setPendingCool(null);
  }, [device.coolSetpoint, pendingCool]);

  const heatDisplay = pendingHeat ?? device.heatSetpoint;
  const coolDisplay = pendingCool ?? device.coolSetpoint;

  const bumpHeat = (delta: number) => {
    const target = clamp(heatDisplay + delta, HEAT_MIN, HEAT_MAX);
    setPendingHeat(target);
    void send('heat', { type: 'thermostat', action: 'set_heat_setpoint', temperature: target })
      .then(() => {
        // Brief grace window for the WebSocket echo. If the server came back
        // with something different (mode boundary, vacation, etc.), the
        // useEffect above won't match and we fall back to the server value.
        setTimeout(() => setPendingHeat((p) => (p === target ? null : p)), 400);
      });
  };

  const bumpCool = (delta: number) => {
    const target = clamp(coolDisplay + delta, COOL_MIN, COOL_MAX);
    setPendingCool(target);
    void send('cool', { type: 'thermostat', action: 'set_cool_setpoint', temperature: target })
      .then(() => {
        setTimeout(() => setPendingCool((p) => (p === target ? null : p)), 400);
      });
  };

  // Which setpoints make sense for the current mode. The full-page control
  // always shows both; here we hide the irrelevant one to keep the tile
  // compact and avoid implying the other is settable.
  const showHeat =
    device.hvacMode === 'heat' ||
    device.hvacMode === 'auto' ||
    device.hvacMode === 'auxHeatOnly';
  const showCool = device.hvacMode === 'cool' || device.hvacMode === 'auto';

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="thermostat"
    >
      {/* Header: name + live HVAC-action badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            color: visual.color,
            border: `1px solid ${visual.color}`,
          }}
          title={`HVAC action: ${device.hvacAction}`}
        >
          <HvacIcon className="h-3 w-3" />
          {visual.label}
        </span>
      </div>

      {/* Current reading + setpoints */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold leading-none tabular-nums">
            {device.temperature != null ? `${device.temperature.toFixed(1)}°` : '—'}
          </div>
          {device.humidity != null && (
            <div className="mt-1 text-xs" style={{ color: token('--color-text-muted') }}>
              {device.humidity}% RH
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {showHeat && (
            <SetpointRow
              label="Heat"
              Icon={Flame}
              color={token('--color-danger')}
              value={heatDisplay}
              busy={isPending('heat')}
              onMinus={() => bumpHeat(-1)}
              onPlus={() => bumpHeat(1)}
            />
          )}
          {showCool && (
            <SetpointRow
              label="Cool"
              Icon={Snowflake}
              color={COOL_COLOR}
              value={coolDisplay}
              busy={isPending('cool')}
              onMinus={() => bumpCool(-1)}
              onPlus={() => bumpCool(1)}
            />
          )}
          {!showHeat && !showCool && (
            <div
              className="rounded-md px-2 py-1 text-xs"
              style={{
                color: token('--color-text-muted'),
                backgroundColor: token('--color-bg-hover'),
              }}
            >
              System off
            </div>
          )}
        </div>
      </div>

      {/* Mode selector — opt-in via card descriptor */}
      {card.showModeControl && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: token('--color-text-muted') }}>
            Mode
          </span>
          <Select
            value={device.hvacMode}
            disabled={isPending('hvac')}
            onValueChange={(v) =>
              void send('hvac', {
                type: 'thermostat',
                action: 'set_hvac_mode',
                hvacMode: v as ThermostatMode,
              })
            }
            options={HVAC_OPTIONS}
            className="flex-1"
            size="xs"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setpoint row — a compact pill with − / + and the current value
// ---------------------------------------------------------------------------

function SetpointRow({
  label,
  Icon,
  color,
  value,
  busy,
  onMinus,
  onPlus,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  value: number;
  busy: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
      style={{
        backgroundColor: token('--color-bg-hover'),
        opacity: busy ? 0.7 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span
        className="text-[10px] uppercase tracking-wide"
        style={{ color: token('--color-text-muted') }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onMinus}
        disabled={busy}
        aria-label={`Decrease ${label.toLowerCase()} setpoint`}
        className="rounded p-0.5 disabled:opacity-50"
        style={{ color: token('--color-text-secondary') }}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums">
        {value.toFixed(0)}°
      </span>
      <button
        type="button"
        onClick={onPlus}
        disabled={busy}
        aria-label={`Increase ${label.toLowerCase()} setpoint`}
        className="rounded p-0.5 disabled:opacity-50"
        style={{ color: token('--color-text-secondary') }}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hvacActionVisual(device: ThermostatState): {
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
} {
  switch (device.hvacAction) {
    case 'heating':
      return { Icon: Flame, color: token('--color-danger'), label: 'Heating' };
    case 'cooling':
      return { Icon: Snowflake, color: COOL_COLOR, label: 'Cooling' };
    case 'fan':
      return { Icon: Wind, color: token('--color-text-secondary'), label: 'Fan' };
    case 'drying':
      return { Icon: Wind, color: token('--color-text-secondary'), label: 'Dry' };
    case 'idle':
    default:
      // When idle, we disambiguate between "idle because the system is off"
      // and "idle because the setpoint is satisfied" — the badge colour and
      // icon should match user expectations.
      return device.hvacMode === 'off'
        ? { Icon: Power, color: token('--color-text-muted'), label: 'Off' }
        : { Icon: CircleDot, color: token('--color-text-muted'), label: 'Idle' };
  }
}
