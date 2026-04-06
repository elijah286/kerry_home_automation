import { logger } from '../logger.js';
import { getSolarElevation } from './sun-calc.js';
import { config } from '../config/index.js';

interface ScheduleEntry {
  id: string;
  expression: string;
  callback: () => void;
  parsed: ParsedSchedule;
}

interface ParsedSchedule {
  type: 'cron' | 'time' | 'sun_relative';
  minute?: number | number[] | null;
  hour?: number | number[] | null;
  dayOfWeek?: number[] | null;
  sunEvent?: 'sunrise' | 'sunset';
  offsetMinutes?: number;
}

type ScheduleCallback = () => void;

function parseExpression(expression: string): ParsedSchedule {
  const sunMatch = expression.match(/^(sunrise|sunset)([+-]\d+)?$/);
  if (sunMatch) {
    return {
      type: 'sun_relative',
      sunEvent: sunMatch[1] as 'sunrise' | 'sunset',
      offsetMinutes: sunMatch[2] ? parseInt(sunMatch[2], 10) : 0,
    };
  }

  const timeMatch = expression.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    return {
      type: 'time',
      hour: parseInt(timeMatch[1], 10),
      minute: parseInt(timeMatch[2], 10),
    };
  }

  const parts = expression.split(/\s+/);

  if (parts.length === 5) {
    const [minPart, hourPart, , , dowPart] = parts;
    return {
      type: 'cron',
      minute: parseCronField(minPart, 0, 59),
      hour: parseCronField(hourPart, 0, 23),
      dayOfWeek: dowPart !== '*' ? parseCronField(dowPart, 0, 6) as number[] | null : null,
    };
  }

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid schedule expression: "${expression}"`);
  }

  const [minPart, hourPart, dowPart] = parts;
  return {
    type: 'cron',
    minute: parseCronField(minPart, 0, 59),
    hour: parseCronField(hourPart, 0, 23),
    dayOfWeek: dowPart ? parseCronField(dowPart, 0, 6) as number[] | null : null,
  };
}

function parseCronField(field: string, min: number, max: number): number[] | null {
  if (field === '*') return null;

  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      let start = min;
      let end = max;
      if (stepMatch[1] !== '*') {
        const [s, e] = stepMatch[1].split('-').map(Number);
        start = s;
        end = e;
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    const val = parseInt(part, 10);
    if (!isNaN(val) && val >= min && val <= max) {
      values.add(val);
    }
  }

  return values.size > 0 ? [...values].sort((a, b) => a - b) : null;
}

function fieldMatches(value: number, allowed: number | number[] | null | undefined): boolean {
  if (allowed === null || allowed === undefined) return true;
  if (typeof allowed === 'number') return value === allowed;
  return allowed.includes(value);
}

/**
 * Approximate the time of sunrise/sunset for a given day by scanning
 * solar elevation in 1-minute increments around expected times.
 * Returns minutes-since-midnight in local time, or null if the sun
 * doesn't cross the horizon (polar regions).
 */
function findSunEventMinutes(
  sunEvent: 'sunrise' | 'sunset',
  date: Date,
): number | null {
  const { lat, lon } = config.location;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const scanStart = sunEvent === 'sunrise' ? 4 * 60 : 14 * 60;
  const scanEnd = sunEvent === 'sunrise' ? 10 * 60 : 22 * 60;

  let prevElev = getSolarElevation(lat, lon, new Date(day.getTime() + scanStart * 60_000));

  for (let m = scanStart + 1; m <= scanEnd; m++) {
    const t = new Date(day.getTime() + m * 60_000);
    const elev = getSolarElevation(lat, lon, t);

    if (sunEvent === 'sunrise' && prevElev <= 0 && elev > 0) return m;
    if (sunEvent === 'sunset' && prevElev >= 0 && elev < 0) return m;

    prevElev = elev;
  }

  return null;
}

export class Scheduler {
  private schedules = new Map<string, ScheduleEntry>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickMinute = -1;

  addSchedule(id: string, expression: string, callback: ScheduleCallback): void {
    const parsed = parseExpression(expression);
    this.schedules.set(id, { id, expression, callback, parsed });
    logger.debug({ id, expression, parsed: parsed.type }, 'Schedule added');
  }

  removeSchedule(id: string): void {
    this.schedules.delete(id);
  }

  init(): void {
    this.lastTickMinute = -1;
    this.tickTimer = setInterval(() => this.tick(), 15_000);
    logger.info({ count: this.schedules.size }, 'Scheduler initialized');
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(): void {
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    if (currentMinute === this.lastTickMinute) return;
    this.lastTickMinute = currentMinute;

    for (const entry of this.schedules.values()) {
      try {
        if (this.matches(entry.parsed, now, currentMinute)) {
          entry.callback();
        }
      } catch (err) {
        logger.error({ err, scheduleId: entry.id }, 'Schedule callback error');
      }
    }
  }

  private matches(parsed: ParsedSchedule, now: Date, currentMinute: number): boolean {
    if (parsed.type === 'sun_relative') {
      const eventMinutes = findSunEventMinutes(parsed.sunEvent!, now);
      if (eventMinutes === null) return false;
      const targetMinute = eventMinutes + (parsed.offsetMinutes ?? 0);
      return currentMinute === Math.round(targetMinute);
    }

    if (parsed.type === 'time') {
      return (
        fieldMatches(now.getHours(), parsed.hour) &&
        fieldMatches(now.getMinutes(), parsed.minute)
      );
    }

    return (
      fieldMatches(now.getMinutes(), parsed.minute) &&
      fieldMatches(now.getHours(), parsed.hour) &&
      fieldMatches(now.getDay(), parsed.dayOfWeek)
    );
  }

  /** For external callers that need sun event times (e.g. mode machine). */
  getSunEventMinutes(event: 'sunrise' | 'sunset', date?: Date): number | null {
    return findSunEventMinutes(event, date ?? new Date());
  }
}

export const scheduler = new Scheduler();
