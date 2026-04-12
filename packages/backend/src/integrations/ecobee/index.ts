// ---------------------------------------------------------------------------
// Ecobee thermostat integration: cloud API polling
// Each entry = one Ecobee account (may contain multiple thermostats)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState, ThermostatCommand } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { EcobeeClient, type EcobeeThermostat } from './ecobee-client.js';
import { mapThermostat } from './mapper.js';
import { PRESET_AWAY_INDEFINITELY, PRESET_TEMPERATURE, PRESET_VACATION } from './preset.js';

const POLL_INTERVAL_MS = 60_000;
const COMMAND_REPOLL_DELAY_MS = 5_000;

interface EntryCtx {
  entryId: string;
  client: EcobeeClient;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastThermostatById: Map<string, EcobeeThermostat>;
}

function holdPreference(holdAction: string | undefined): string {
  const m: Record<string, string> = {
    useEndTime2hour: 'holdHours',
    useEndTime4hour: 'holdHours',
    indefinite: 'indefinite',
  };
  return m[holdAction ?? ''] ?? 'nextTransition';
}

function holdHoursVal(holdAction: string | undefined): number | undefined {
  const m: Record<string, number> = { useEndTime2hour: 2, useEndTime4hour: 4 };
  return m[holdAction ?? ''];
}

function hassPresetToClimateRef(presetMode: string, climates: { name: string; climateRef: string }[]): string {
  const hassToName: Record<string, string> = { away: 'Away', home: 'Home', sleep: 'Sleep' };
  const wantedName = hassToName[presetMode] ?? presetMode;
  const byName = climates.find((c) => c.name === wantedName);
  if (byName) return byName.climateRef;
  const byRef = climates.find((c) => c.climateRef === presetMode);
  if (byRef) return byRef.climateRef;
  throw new Error(`Unknown comfort preset: ${presetMode}`);
}

function tempHoldFromCurrent(t: EcobeeThermostat): { heat: number; cool: number } {
  const mode = t.settings.hvacMode;
  const cur = t.runtime.actualTemperature / 10;
  if (mode === 'heat' || mode === 'cool' || mode === 'auxHeatOnly' || mode === 'off') {
    return { heat: cur, cool: cur };
  }
  const delta = (t.settings.heatCoolMinDelta ?? 30) / 10;
  return { heat: cur - delta, cool: cur + delta };
}

export class EcobeeIntegration implements Integration {
  readonly id = 'ecobee' as const;
  private entries = new Map<string, EntryCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('ecobee');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.api_key || !entry.config.refresh_token) continue;
      const client = new EcobeeClient(
        entry.config.api_key as string,
        entry.config.refresh_token as string,
      );
      const ctx: EntryCtx = {
        entryId: entry.id,
        client,
        pollTimer: null,
        lastThermostatById: new Map(),
      };
      this.entries.set(entry.id, ctx);

      try {
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Ecobee: initial poll failed');
        this.lastError = String(err);
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.entries.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ entries: this.entries.size }, 'Ecobee integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.entries.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.entries.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'thermostat') return;
    const tcmd = cmd as ThermostatCommand;

    const parts = tcmd.deviceId.split('.');
    const entryId = parts[1];
    const thermostatId = parts[3];
    const ctx = this.entries.get(entryId);
    if (!ctx) throw new Error('Ecobee entry not found');

    let raw = ctx.lastThermostatById.get(thermostatId);
    if (!raw) {
      const list = await ctx.client.getThermostats();
      raw = list.find((t) => t.identifier === thermostatId);
      if (raw) ctx.lastThermostatById.set(thermostatId, raw);
    }
    if (!raw) throw new Error('Thermostat not found in Ecobee account');

    const hp = holdPreference(raw.settings.holdAction);
    const hh = hp === 'holdHours' ? holdHoursVal(raw.settings.holdAction) : undefined;
    const climates = raw.program?.climates ?? [];

    switch (tcmd.action) {
      case 'set_hvac_mode': {
        if (!tcmd.hvacMode) break;
        const apiMode = tcmd.hvacMode === 'auto' ? 'auto' : tcmd.hvacMode;
        await ctx.client.setHvacMode(thermostatId, apiMode);
        break;
      }
      case 'set_fan_mode': {
        if (!tcmd.fanMode) break;
        const fan = tcmd.fanMode === 'on' ? 'on' : 'auto';
        await ctx.client.setFanMode(
          thermostatId,
          fan,
          raw.runtime.desiredHeat / 10,
          raw.runtime.desiredCool / 10,
          hp,
          hh,
        );
        break;
      }
      case 'set_heat_setpoint':
        if (tcmd.temperature != null) {
          const current = stateStore.get(tcmd.deviceId);
          const coolSetpoint = current && current.type === 'thermostat' ? current.coolSetpoint : raw.runtime.desiredCool / 10;
          await ctx.client.setTemperature(thermostatId, tcmd.temperature, coolSetpoint);
        }
        break;
      case 'set_cool_setpoint':
        if (tcmd.temperature != null) {
          const current = stateStore.get(tcmd.deviceId);
          const heatSetpoint = current && current.type === 'thermostat' ? current.heatSetpoint : raw.runtime.desiredHeat / 10;
          await ctx.client.setTemperature(thermostatId, heatSetpoint, tcmd.temperature);
        }
        break;
      case 'resume_program':
        await ctx.client.resumeProgram(thermostatId, tcmd.resumeAll ?? false);
        break;

      case 'set_preset_mode': {
        if (!tcmd.presetMode) break;
        const device = stateStore.get(tcmd.deviceId);
        const vacName = device?.type === 'thermostat' ? device.ecobee?.vacationName : null;
        if (device?.type === 'thermostat' && device.ecobee?.presetMode === PRESET_VACATION && vacName && tcmd.presetMode !== PRESET_VACATION) {
          await ctx.client.deleteVacation(thermostatId, vacName);
        }

        if (tcmd.presetMode === PRESET_AWAY_INDEFINITELY) {
          await ctx.client.setClimateHold(thermostatId, 'away', 'indefinite', hh ?? null);
          break;
        }
        if (tcmd.presetMode === PRESET_TEMPERATURE) {
          const { heat, cool } = tempHoldFromCurrent(raw);
          await ctx.client.setHoldTemps(thermostatId, heat, cool, hp, hh != null ? String(hh) : undefined);
          break;
        }
        if (tcmd.presetMode === 'none') {
          await ctx.client.resumeProgram(thermostatId, true);
          break;
        }

        const ref = hassPresetToClimateRef(tcmd.presetMode, climates);
        await ctx.client.setClimateHold(thermostatId, ref, hp, hh ?? null);
        break;
      }

      case 'set_fan_min_on_time':
        if (tcmd.fanMinOnTime != null) {
          await ctx.client.setFanMinOnTime(thermostatId, tcmd.fanMinOnTime);
        }
        break;

      case 'set_target_humidity':
        if (tcmd.targetHumidity != null) {
          await ctx.client.setHumidityPercent(thermostatId, tcmd.targetHumidity);
        }
        break;

      case 'create_vacation': {
        const v = tcmd.vacation;
        if (!v) break;
        await ctx.client.createVacation(thermostatId, v.name, v.coolTempF, v.heatTempF, {
          startDate: v.startDate,
          startTime: v.startTime,
          endDate: v.endDate,
          endTime: v.endTime,
          fanMode: v.fanMode,
          fanMinOnTime: v.fanMinOnTime,
        });
        break;
      }

      case 'delete_vacation':
        if (tcmd.vacationName) await ctx.client.deleteVacation(thermostatId, tcmd.vacationName);
        break;

      case 'set_ventilator_timer':
        if (tcmd.ventilatorOn !== undefined) {
          await ctx.client.setVentilatorTimer(thermostatId, tcmd.ventilatorOn);
        }
        break;

      case 'set_ventilator_min_home':
        if (tcmd.ventilatorMinHome != null) {
          await ctx.client.setVentilatorMinOnTimeHome(thermostatId, tcmd.ventilatorMinHome);
        }
        break;

      case 'set_ventilator_min_away':
        if (tcmd.ventilatorMinAway != null) {
          await ctx.client.setVentilatorMinOnTimeAway(thermostatId, tcmd.ventilatorMinAway);
        }
        break;

      case 'set_compressor_min_temp':
        if (tcmd.compressorMinTempF != null) {
          await ctx.client.setCompressorProtectionMinTemp(thermostatId, tcmd.compressorMinTempF);
        }
        break;

      case 'set_aux_heat_only':
        if (tcmd.auxHeatOnly === true) {
          await ctx.client.setHvacMode(thermostatId, 'auxHeatOnly');
        } else if (tcmd.auxHeatOnly === false) {
          await ctx.client.setHvacMode(thermostatId, 'auto');
        }
        break;

      case 'set_dst_mode':
        if (tcmd.dstEnabled !== undefined) await ctx.client.setDstMode(thermostatId, tcmd.dstEnabled);
        break;

      case 'set_mic_mode':
        if (tcmd.micEnabled !== undefined) await ctx.client.setMicMode(thermostatId, tcmd.micEnabled);
        break;

      case 'set_occupancy_modes': {
        if (tcmd.autoAway === undefined && tcmd.followMe === undefined) break;
        await ctx.client.setOccupancyModes(thermostatId, {
          autoAway: tcmd.autoAway ?? Boolean(raw.settings.autoAway),
          followMeComfort: tcmd.followMe ?? Boolean(raw.settings.followMeComfort),
        });
        break;
      }

      case 'set_sensors_for_climate': {
        if (!tcmd.climateComfortName || !tcmd.sensorIds?.length || !raw.program) {
          throw new Error('climateComfortName and sensorIds required');
        }
        await ctx.client.updateClimateSensors(
          thermostatId,
          raw.program,
          tcmd.climateComfortName,
          tcmd.sensorIds,
          raw.remoteSensors ?? [],
        );
        break;
      }

      default:
        break;
    }

    setTimeout(() => void this.poll(ctx).catch(() => {}), COMMAND_REPOLL_DELAY_MS);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.entries.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: EntryCtx): Promise<void> {
    const thermostats = await ctx.client.getThermostats();
    for (const thermostat of thermostats) {
      ctx.lastThermostatById.set(thermostat.identifier, thermostat);
      stateStore.update(mapThermostat(ctx.entryId, thermostat));
    }
    this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
