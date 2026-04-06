import { query } from '../db/pool.js';
import { logger } from '../logger.js';

export interface HistoryEntry {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> | null;
}

const MAX_BUFFER = 100;
const FLUSH_INTERVAL_MS = 1_000;
const MAX_BUFFER_SIZE = 5_000;

function stripNullBytes(s: string): string {
  return s.replace(/\0/g, '');
}

function sanitizeAttributes(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null;
  return stripNullBytes(JSON.stringify(attrs));
}

export class HistoryWriter {
  private buffer: HistoryEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  queueStateChange(entry: HistoryEntry): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(entry);
    if (this.buffer.length >= MAX_BUFFER) {
      void this.flush();
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;

    const batch = this.buffer.splice(0);
    try {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of batch) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
        values.push(
          stripNullBytes(entry.entity_id),
          stripNullBytes(entry.state),
          sanitizeAttributes(entry.attributes),
        );
        idx += 3;
      }

      await query(
        `INSERT INTO state_history (entity_id, state, attributes) VALUES ${placeholders.join(', ')}`,
        values,
      );
    } catch (err) {
      logger.error({ err, count: batch.length }, 'History bulk insert failed, dropping batch');
    } finally {
      this.flushing = false;
    }
  }
}

export const historyWriter = new HistoryWriter();
