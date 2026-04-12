// ---------------------------------------------------------------------------
// Buffered state history writer with configurable retention
// ---------------------------------------------------------------------------

import type { DeviceState } from '@ha/shared';
import { query } from './pool.js';
import { eventBus } from '../state/event-bus.js';
import { logger } from '../logger.js';

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER_SIZE = 100;
const CLEANUP_INTERVAL_MS = 3_600_000; // hourly
const DEFAULT_RETENTION_DAYS = 3;

interface HistoryEntry {
  deviceId: string;
  state: Record<string, unknown>;
  changedAt: Date;
}

class HistoryWriter {
  private buffer: HistoryEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;

    eventBus.on('device_updated', ({ prev, current }) => {
      if (prev && this.isSignificantChange(prev, current)) {
        this.buffer.push({
          deviceId: current.id,
          state: this.extractStateSnapshot(current),
          changedAt: new Date(),
        });

        if (this.buffer.length >= MAX_BUFFER_SIZE) {
          void this.flush();
        }
      } else if (!prev) {
        this.buffer.push({
          deviceId: current.id,
          state: this.extractStateSnapshot(current),
          changedAt: new Date(),
        });
      }
    });

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);

    // Run initial cleanup
    void this.cleanup();

    logger.info('State history writer started');
  }

  stop(): void {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    void this.flush();
  }

  private isSignificantChange(prev: DeviceState, current: DeviceState): boolean {
    if (prev.type !== current.type) return true;
    if (prev.available !== current.available) return true;

    switch (current.type) {
      case 'light':
        return (prev as typeof current).on !== current.on
          || (prev as typeof current).brightness !== current.brightness;
      case 'switch':
        return (prev as typeof current).on !== current.on;
      case 'fan':
        return (prev as typeof current).on !== current.on
          || (prev as typeof current).speed !== current.speed;
      case 'cover':
        return (prev as typeof current).position !== current.position;
      case 'media_player':
        return (prev as typeof current).power !== current.power
          || (prev as typeof current).volume !== current.volume
          || (prev as typeof current).source !== current.source;
      case 'camera':
        return (prev as typeof current).online !== current.online;
      case 'recipe_library':
        return (prev as typeof current).recipeCount !== current.recipeCount;
      case 'energy_site': {
        const p = prev as typeof current;
        return p.solarPower !== current.solarPower
          || p.batteryPower !== current.batteryPower
          || p.gridPower !== current.gridPower
          || p.loadPower !== current.loadPower
          || p.batteryPercentage !== current.batteryPercentage
          || p.gridServicesPower !== current.gridServicesPower
          || p.generatorPower !== current.generatorPower
          || p.energyLeft !== current.energyLeft
          || p.gridStatus !== current.gridStatus
          || p.operationMode !== current.operationMode
          || p.stormModeEnabled !== current.stormModeEnabled
          || p.backupReservePercent !== current.backupReservePercent;
      }
      case 'vehicle': {
        const p = prev as typeof current;
        return p.batteryLevel !== current.batteryLevel
          || p.batteryRange !== current.batteryRange
          || p.chargeState !== current.chargeState
          || p.chargerPower !== current.chargerPower
          || p.chargeRate !== current.chargeRate
          || p.sleepState !== current.sleepState
          || p.locked !== current.locked
          || p.latitude !== current.latitude
          || p.longitude !== current.longitude
          || p.speed !== current.speed
          || p.shiftState !== current.shiftState
          || p.power !== current.power
          || p.climateOn !== current.climateOn
          || p.insideTemp !== current.insideTemp
          || p.outsideTemp !== current.outsideTemp;
      }
      case 'thermostat': {
        const p = prev as typeof current;
        return p.temperature !== current.temperature
          || p.humidity !== current.humidity
          || p.hvacMode !== current.hvacMode
          || p.hvacAction !== current.hvacAction
          || p.heatSetpoint !== current.heatSetpoint
          || p.coolSetpoint !== current.coolSetpoint
          || p.fanMode !== current.fanMode;
      }
      case 'sensor':
        return (prev as typeof current).value !== current.value;
      case 'energy_monitor': {
        const p = prev as typeof current;
        return p.powerW !== current.powerW || p.solarW !== current.solarW;
      }
      case 'pool_body': {
        const p = prev as typeof current;
        return p.on !== current.on || p.currentTemp !== current.currentTemp
          || p.heaterOn !== current.heaterOn || p.setPoint !== current.setPoint;
      }
      case 'pool_pump': {
        const p = prev as typeof current;
        return p.on !== current.on || p.rpm !== current.rpm || p.watts !== current.watts;
      }
      case 'pool_chemistry': {
        const p = prev as typeof current;
        return p.ph !== current.ph || p.orp !== current.orp || p.saltPpm !== current.saltPpm
          || p.alkalinity !== current.alkalinity || p.calciumHardness !== current.calciumHardness
          || p.cya !== current.cya || p.saturationIndex !== current.saturationIndex;
      }
      case 'pool_circuit':
        return (prev as typeof current).on !== current.on;
      case 'garage_door':
        return (prev as typeof current).open !== current.open;
      case 'sprinkler':
        return (prev as typeof current).running !== current.running
          || (prev as typeof current).currentZone !== current.currentZone;
      case 'vacuum':
        return (prev as typeof current).status !== current.status
          || (prev as typeof current).battery !== current.battery;
      case 'doorbell':
        return (prev as typeof current).lastMotion !== current.lastMotion
          || (prev as typeof current).lastRing !== current.lastRing;
      case 'water_softener': {
        const p = prev as typeof current;
        return p.capacityPercent !== current.capacityPercent
          || p.saltPercent !== current.saltPercent;
      }
      case 'weather': {
        const p = prev as typeof current;
        return p.temperature !== current.temperature
          || p.humidity !== current.humidity
          || p.condition !== current.condition;
      }
      case 'speedtest':
        return (prev as typeof current).downloadMbps !== current.downloadMbps
          || (prev as typeof current).uploadMbps !== current.uploadMbps;
      default:
        return true;
    }
  }

  private extractStateSnapshot(device: DeviceState): Record<string, unknown> {
    const { id, name, integration, areaId, lastChanged, lastUpdated, ...state } = device;
    return state;
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    try {
      // Filter out devices that have history recording disabled
      const { rows: disabled } = await query<{ device_id: string }>(
        'SELECT device_id FROM device_settings WHERE history_enabled = FALSE',
      );
      const disabledSet = new Set(disabled.map((r) => r.device_id));
      const filtered = batch.filter((e) => !disabledSet.has(e.deviceId));

      if (filtered.length === 0) return;

      await this.ensurePartition();

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of filtered) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
        values.push(entry.deviceId, JSON.stringify(entry.state), entry.changedAt);
        idx += 3;
      }

      await query(
        `INSERT INTO state_history (device_id, state, changed_at) VALUES ${placeholders.join(', ')}`,
        values,
      );
    } catch (err) {
      logger.warn({ err, count: batch.length }, 'Failed to write state history batch');
    }
  }

  /**
   * Delete history older than retention period.
   * Uses system_settings default, with per-device overrides from device_settings.
   */
  private async cleanup(): Promise<void> {
    try {
      // Get system default
      const { rows: settingsRows } = await query<{ value: unknown }>(
        `SELECT value FROM system_settings WHERE key = 'history_retention_days'`,
      );
      const defaultDays = settingsRows.length > 0
        ? Number(settingsRows[0].value)
        : DEFAULT_RETENTION_DAYS;

      // Delete history older than default retention for devices without overrides
      const { rowCount } = await query(
        `DELETE FROM state_history
         WHERE changed_at < NOW() - INTERVAL '1 day' * $1
           AND device_id NOT IN (
             SELECT device_id FROM device_settings WHERE history_retention_days IS NOT NULL
           )`,
        [defaultDays],
      );

      // Handle per-device overrides
      const { rows: overrides } = await query<{ device_id: string; history_retention_days: number }>(
        `SELECT device_id, history_retention_days FROM device_settings WHERE history_retention_days IS NOT NULL`,
      );

      for (const override of overrides) {
        await query(
          `DELETE FROM state_history WHERE device_id = $1 AND changed_at < NOW() - INTERVAL '1 day' * $2`,
          [override.device_id, override.history_retention_days],
        );
      }

      if ((rowCount ?? 0) > 0 || overrides.length > 0) {
        logger.info({ deleted: rowCount, overrides: overrides.length }, 'History retention cleanup');
      }
    } catch (err) {
      // Tables may not exist yet on first run
      logger.debug({ err }, 'History cleanup skipped (tables may not exist yet)');
    }
  }

  private lastPartitionCheck = 0;

  private async ensurePartition(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPartitionCheck < 3_600_000) return;
    this.lastPartitionCheck = now;

    try {
      await query(`
        DO $$
        DECLARE
          next_start DATE := date_trunc('month', CURRENT_DATE + INTERVAL '1 month');
          next_end DATE := next_start + INTERVAL '1 month';
          part_name TEXT := 'state_history_' || to_char(next_start, 'YYYY_MM');
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = part_name
          ) THEN
            EXECUTE format(
              'CREATE TABLE %I PARTITION OF state_history FOR VALUES FROM (%L) TO (%L)',
              part_name, next_start, next_end
            );
            RAISE NOTICE 'Created partition %', part_name;
          END IF;
        END $$
      `);
    } catch (err) {
      logger.warn({ err }, 'Failed to ensure state history partition');
    }
  }
}

export const historyWriter = new HistoryWriter();
