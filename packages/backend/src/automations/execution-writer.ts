// ---------------------------------------------------------------------------
// Buffered automation execution log writer
// ---------------------------------------------------------------------------

import type { AutomationActionLog, AutomationExecutionStatus } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER_SIZE = 50;
const CLEANUP_INTERVAL_MS = 3_600_000;
const DEFAULT_RETENTION_DAYS = 30;

interface ExecutionEntry {
  id: string;
  automationId: string;
  triggeredAt: Date;
  triggerType: string;
  triggerDetail?: Record<string, unknown>;
  conditionsPassed: boolean;
  actionsExecuted: AutomationActionLog[];
  status: AutomationExecutionStatus;
  error?: string;
  completedAt?: Date;
}

class ExecutionWriter {
  private buffer: ExecutionEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    void this.cleanup();

    logger.info('Automation execution writer started');
  }

  stop(): void {
    this.running = false;
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    void this.flush();
  }

  write(entry: ExecutionEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      void this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    try {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const e of batch) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8}, $${idx + 9})`);
        values.push(
          e.id, e.automationId, e.triggeredAt, e.triggerType,
          e.triggerDetail ? JSON.stringify(e.triggerDetail) : null,
          e.conditionsPassed,
          JSON.stringify(e.actionsExecuted),
          e.status, e.error ?? null, e.completedAt ?? null,
        );
        idx += 10;
      }

      await query(
        `INSERT INTO automation_execution_log
           (id, automation_id, triggered_at, trigger_type, trigger_detail, conditions_passed, actions_executed, status, error, completed_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           conditions_passed = EXCLUDED.conditions_passed,
           actions_executed = EXCLUDED.actions_executed,
           status = EXCLUDED.status,
           error = EXCLUDED.error,
           completed_at = EXCLUDED.completed_at`,
        values,
      );
    } catch (err) {
      logger.warn({ err, count: batch.length }, 'Failed to write automation execution log batch');
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const { rows } = await query<{ value: unknown }>(
        `SELECT value FROM system_settings WHERE key = 'automation_log_retention_days'`,
      );
      const days = rows.length > 0 ? Number(rows[0].value) : DEFAULT_RETENTION_DAYS;

      const { rowCount } = await query(
        `DELETE FROM automation_execution_log WHERE triggered_at < NOW() - INTERVAL '1 day' * $1`,
        [days],
      );

      if ((rowCount ?? 0) > 0) {
        logger.info({ deleted: rowCount }, 'Automation execution log cleanup');
      }
    } catch (err) {
      logger.debug({ err }, 'Automation execution log cleanup skipped');
    }
  }
}

export const executionWriter = new ExecutionWriter();
