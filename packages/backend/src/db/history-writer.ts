// ---------------------------------------------------------------------------
// Buffered state history writer
// ---------------------------------------------------------------------------

import type { DeviceState } from '@ha/shared';
import { query } from './pool.js';
import { eventBus } from '../state/event-bus.js';
import { logger } from '../logger.js';

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER_SIZE = 100;

interface HistoryEntry {
  deviceId: string;
  state: Record<string, unknown>;
  changedAt: Date;
}

class HistoryWriter {
  private buffer: HistoryEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;

    eventBus.on('device_updated', ({ prev, current }) => {
      // Only record meaningful state changes (not just lastUpdated bumps)
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
        // First time seeing this device — record initial state
        this.buffer.push({
          deviceId: current.id,
          state: this.extractStateSnapshot(current),
          changedAt: new Date(),
        });
      }
    });

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    logger.info('State history writer started');
  }

  stop(): void {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
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
      default:
        return true;
    }
  }

  private extractStateSnapshot(device: DeviceState): Record<string, unknown> {
    // Strip base fields, keep type-specific state
    const { id, name, integration, areaId, lastChanged, lastUpdated, ...state } = device;
    return state;
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    try {
      await this.ensurePartition();

      // Batch insert
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of batch) {
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
      // Don't re-queue — accept the data loss to avoid memory growth
    }
  }

  private lastPartitionCheck = 0;

  private async ensurePartition(): Promise<void> {
    // Only check once per hour
    const now = Date.now();
    if (now - this.lastPartitionCheck < 3_600_000) return;
    this.lastPartitionCheck = now;

    try {
      // Create partition for next month if it doesn't exist
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
