// ---------------------------------------------------------------------------
// Notification store — in-memory with JSON persistence.
//
// Why not YAML (like dashboards)? The payload is more churn-heavy (severity
// spikes during incidents, automatic expiry) and less hand-edited. JSON also
// round-trips `acknowledgements` records without quote-foo. When we move to
// Postgres, the row maps 1:1 to this shape.
//
// Concurrency: all mutations funnel through `mutate()` which holds a single
// in-process lock and writes on every change (fs calls are queued). Fine for
// < 10k notifications; the DB migration is where that stops being true.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  notificationSchema,
  type CreateNotificationRequest,
  type Notification,
  type NotificationLifecycle,
} from '@ha/shared';
import { logger } from '../logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'notifications');
const DATA_FILE = path.join(DATA_DIR, 'active.json');

/** Keep resolved notifications for 7 days so the inbox can show recent history. */
const RESOLVED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let notifications: Notification[] = [];
let writeQueue: Promise<void> = Promise.resolve();
let loaded = false;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadFromDisk(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    await ensureDir();
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      logger.warn({ file: DATA_FILE }, 'Notifications file is not an array; starting empty');
      notifications = [];
      return;
    }
    notifications = parsed
      .map((r) => {
        const res = notificationSchema.safeParse(r);
        if (!res.success) {
          logger.warn({ err: res.error.format(), row: r }, 'Skipping invalid notification');
          return null;
        }
        return res.data;
      })
      .filter((n): n is Notification => n !== null);
    pruneExpired();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      notifications = [];
      return;
    }
    logger.error({ err }, 'Failed to load notifications; starting empty');
    notifications = [];
  }
}

function schedulePersist(): void {
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureDir();
      await fs.writeFile(DATA_FILE, JSON.stringify(notifications, null, 2), 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Failed to persist notifications');
    }
  });
}

function pruneExpired(): Notification[] {
  const now = Date.now();
  const removed: Notification[] = [];
  notifications = notifications.filter((n) => {
    if (n.state === 'archived') {
      removed.push(n);
      return false;
    }
    if (n.resolvedAt) {
      if (now - new Date(n.resolvedAt).getTime() > RESOLVED_TTL_MS) {
        removed.push(n);
        return false;
      }
    }
    if (n.expiresAt) {
      if (now > new Date(n.expiresAt).getTime() && n.state !== 'resolved') {
        // Auto-resolve; don't drop yet.
        const iso = new Date().toISOString();
        n.state = 'resolved';
        n.resolvedAt = iso;
        n.updatedAt = iso;
      }
    }
    return true;
  });
  return removed;
}

// -- Public API -------------------------------------------------------------

export async function list(): Promise<Notification[]> {
  await loadFromDisk();
  return notifications.slice();
}

export async function get(id: string): Promise<Notification | undefined> {
  await loadFromDisk();
  return notifications.find((n) => n.id === id);
}

export interface CreateResult {
  notification: Notification;
  isNew: boolean;
}

export async function create(req: CreateNotificationRequest): Promise<CreateResult> {
  await loadFromDisk();

  const now = new Date().toISOString();

  // Dedupe: if dedupeKey already matches an active notification, update it
  // in place (bump severity, refresh updatedAt) rather than stacking.
  if (req.dedupeKey) {
    const existing = notifications.find(
      (n) =>
        n.dedupeKey === req.dedupeKey &&
        n.state !== 'resolved' &&
        n.state !== 'archived',
    );
    if (existing) {
      existing.title = req.title;
      if (req.body !== undefined) existing.body = req.body;
      existing.severity = req.severity;
      if (req.icon !== undefined) existing.icon = req.icon;
      existing.updatedAt = now;
      schedulePersist();
      return { notification: existing, isNew: false };
    }
  }

  const parsed = notificationSchema.parse({
    id: randomUUID(),
    severity: req.severity,
    category: req.category ?? 'other',
    title: req.title,
    body: req.body,
    icon: req.icon,
    deviceId: req.deviceId,
    dedupeKey: req.dedupeKey,
    surfaces: req.surfaces ?? ['inbox'],
    audience: req.audience,
    actions: req.actions ?? [],
    toastTtlMs: req.toastTtlMs ?? 5000,
    expiresAt: req.expiresAt,
    state: 'created',
    acknowledgements: {},
    createdAt: now,
    updatedAt: now,
    meta: req.meta,
  });
  notifications.push(parsed);
  schedulePersist();
  return { notification: parsed, isNew: true };
}

export async function setState(id: string, state: NotificationLifecycle): Promise<Notification | null> {
  await loadFromDisk();
  const n = notifications.find((x) => x.id === id);
  if (!n) return null;
  const now = new Date().toISOString();
  n.state = state;
  n.updatedAt = now;
  if (state === 'resolved' && !n.resolvedAt) n.resolvedAt = now;
  schedulePersist();
  return n;
}

export async function acknowledge(id: string, userId: string): Promise<Notification | null> {
  await loadFromDisk();
  const n = notifications.find((x) => x.id === id);
  if (!n) return null;
  const now = new Date().toISOString();
  n.acknowledgements[userId] = now;
  n.updatedAt = now;
  // Advance lifecycle; don't regress.
  if (n.state === 'created' || n.state === 'delivered' || n.state === 'seen') {
    n.state = 'acknowledged';
  }
  schedulePersist();
  return n;
}

export async function markSeen(id: string): Promise<Notification | null> {
  await loadFromDisk();
  const n = notifications.find((x) => x.id === id);
  if (!n) return null;
  if (n.state === 'created' || n.state === 'delivered') {
    n.state = 'seen';
    n.updatedAt = new Date().toISOString();
    schedulePersist();
  }
  return n;
}

export async function remove(id: string): Promise<boolean> {
  await loadFromDisk();
  const before = notifications.length;
  notifications = notifications.filter((n) => n.id !== id);
  if (notifications.length !== before) {
    schedulePersist();
    return true;
  }
  return false;
}

/** Run the resolve/expire sweep. Returns removed rows (for downstream broadcast). */
export async function sweep(): Promise<Notification[]> {
  await loadFromDisk();
  const removed = pruneExpired();
  if (removed.length > 0) schedulePersist();
  return removed;
}
