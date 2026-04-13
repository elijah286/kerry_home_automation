import pino from 'pino';
import type { LogLevelLabel } from './log-buffer.js';
import { appendLogEntry } from './log-buffer.js';

/** Map pino numeric level → terminal labels */
const LEVEL_FROM_NUM: Record<number, LogLevelLabel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/**
 * Capture logs from the serialized JSON line (runs on the main thread before the
 * pino-pretty worker). logMethod hooks alone can miss or duplicate lines when a
 * transport ThreadStream is used.
 */
function captureSerializedLine(s: string): void {
  const line = s.trim();
  if (!line || line[0] !== '{') return;
  try {
    const o = JSON.parse(line) as Record<string, unknown>;
    const lv = typeof o.level === 'number' ? LEVEL_FROM_NUM[o.level] ?? 'info' : 'info';
    const msg = typeof o.msg === 'string' ? o.msg : '';
    let ts = Date.now();
    if (typeof o.time === 'number') ts = o.time;
    else if (typeof o.time === 'string') {
      const p = Date.parse(o.time);
      if (!Number.isNaN(p)) ts = p;
    }
    const { time: _t, level: _l, msg: _m, pid, hostname: _h, v: _v, ...rest } = o;
    const keys = Object.keys(rest);
    appendLogEntry({
      level: lv,
      msg,
      context: keys.length ? (rest as Record<string, unknown>) : undefined,
      ts,
      pid: typeof pid === 'number' ? pid : undefined,
    });
  } catch {
    /* ignore non-JSON */
  }
}

const streamWrite = (s: string) => {
  captureSerializedLine(s);
  return s;
};

const level = process.env.LOG_LEVEL ?? 'info';

export const logger =
  process.env.NODE_ENV !== 'production'
    ? pino(
        {
          level,
          hooks: { streamWrite },
        },
        pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
      )
    : pino(
        {
          level,
          hooks: { streamWrite },
        },
      );
