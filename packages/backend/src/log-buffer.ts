// ---------------------------------------------------------------------------
// In-memory ring buffer of recent log lines for the system terminal UI
// ---------------------------------------------------------------------------

export type LogLevelLabel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  ts: number;
  level: LogLevelLabel;
  msg: string;
  context?: Record<string, unknown>;
}

const MAX_ENTRIES = 800;
const buffer: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

export function appendLogEntry(entry: Omit<LogEntry, 'ts'> & { ts?: number }): void {
  const full: LogEntry = { ...entry, ts: entry.ts ?? Date.now() };
  buffer.push(full);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
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
