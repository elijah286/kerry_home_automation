// ---------------------------------------------------------------------------
// In-memory ring buffer of recent log lines for the system terminal UI
// ---------------------------------------------------------------------------

export type LogLevelLabel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  ts: number;
  level: LogLevelLabel;
  msg: string;
  context?: Record<string, unknown>;
  /** Process id when captured from pino JSON (matches dev terminal pretty output). */
  pid?: number;
}

/** Ring buffer cap; HTTP access logs alone can push hundreds of lines per minute. */
const MAX_ENTRIES = 2500;

const buffer: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

function isLowSeverity(level: LogLevelLabel): boolean {
  return level === 'trace' || level === 'debug' || level === 'info';
}

/** Drop oldest low-severity lines first so warn/error/fatal survive UI polling / SSE gaps. */
function trimBuffer(): void {
  while (buffer.length > MAX_ENTRIES) {
    const dropAt = buffer.findIndex((e) => isLowSeverity(e.level));
    if (dropAt < 0) break;
    buffer.splice(dropAt, 1);
  }
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function appendLogEntry(entry: Omit<LogEntry, 'ts'> & { ts?: number }): void {
  const full: LogEntry = { ...entry, ts: entry.ts ?? Date.now() };
  buffer.push(full);
  trimBuffer();
  for (const l of listeners) {
    l(full);
  }
}

export function getLogEntries(): LogEntry[] {
  return [...buffer];
}

export function subscribeLogs(cb: (entry: LogEntry) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
