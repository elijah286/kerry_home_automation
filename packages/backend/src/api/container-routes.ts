// ---------------------------------------------------------------------------
// Docker container management routes — admin only
// ---------------------------------------------------------------------------

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';
import { requireRole } from './auth.js';

const execFile = promisify(execFileCb);

const COMPOSE_FILE = join(appConfig.deploy.appRoot, 'docker-compose.prod.yml');
const EXEC_TIMEOUT = 30_000;

const adminOnly = [requireRole('admin')];

/** Requires admin role AND an active PIN elevation window. */
const adminPinElevated = [
  requireRole('admin'),
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.elevated) {
      return reply.code(403).send({ error: 'PIN elevation required for this action' });
    }
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ComposeContainer {
  Service: string;
  ID: string;
  Image: string;
  Status: string;
  State: string;
  Health: string;
  CreatedAt: string;
}

interface ContainerHealthDetail {
  Status: string;
  FailingStreak: number;
  Log?: Array<{
    Start: string;
    End: string;
    ExitCode: number;
    Output: string;
  }>;
}

interface ContainerInfo {
  service: string;
  containerId: string;
  image: string;
  status: string;
  state: string;
  health: string;
  createdAt: string;
  uptime: string;
  healthDetail?: ContainerHealthDetail | null;
}

/** Parse the one-JSON-object-per-line output of `docker compose ps --format json`. */
function parseComposePsOutput(stdout: string): ComposeContainer[] {
  const containers: ComposeContainer[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      containers.push(JSON.parse(trimmed) as ComposeContainer);
    } catch {
      logger.warn({ line: trimmed }, 'Failed to parse docker compose ps JSON line');
    }
  }
  return containers;
}

/** Compute a human-readable uptime string from a created-at timestamp. */
function computeUptime(createdAt: string): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return 'unknown';

  const diffMs = Date.now() - created.getTime();
  if (diffMs < 0) return 'just started';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** Fetch detailed health info for a container via docker inspect. */
async function getHealthDetail(containerId: string): Promise<ContainerHealthDetail | null> {
  try {
    const { stdout } = await execFile(
      'docker',
      ['inspect', '--format', '{{json .State.Health}}', containerId],
      { timeout: EXEC_TIMEOUT },
    );
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '<nil>' || trimmed === '<no value>') {
      return null;
    }
    return JSON.parse(trimmed) as ContainerHealthDetail;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerContainerRoutes(app: FastifyInstance): void {

  // GET /api/system/containers — list all containers in the compose project
  app.get('/api/system/containers', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const { stdout } = await execFile(
        'docker',
        ['compose', '-f', COMPOSE_FILE, 'ps', '--format', 'json'],
        { timeout: EXEC_TIMEOUT },
      );

      const raw = parseComposePsOutput(stdout);

      // Fetch health details in parallel for containers that report a health status
      const containers: ContainerInfo[] = await Promise.all(
        raw.map(async (c): Promise<ContainerInfo> => {
          const hasHealthCheck = c.Health && c.Health !== '' && c.Health !== 'none';
          const healthDetail = hasHealthCheck ? await getHealthDetail(c.ID) : null;

          return {
            service: c.Service,
            containerId: c.ID.slice(0, 12),
            image: c.Image,
            status: c.Status,
            state: c.State,
            health: c.Health || 'none',
            createdAt: c.CreatedAt,
            uptime: computeUptime(c.CreatedAt),
            healthDetail,
          };
        }),
      );

      return { containers };
    } catch (err) {
      logger.error({ err }, 'Failed to list containers');
      return reply.code(500).send({ error: 'Failed to list containers' });
    }
  });

  // POST /api/system/containers/:service/restart — restart a specific service
  app.post<{ Params: { service: string } }>(
    '/api/system/containers/:service/restart',
    { preHandler: adminPinElevated },
    async (req, reply) => {
      const { service } = req.params;

      // Validate service name to prevent injection
      if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
        return reply.code(400).send({ error: 'Invalid service name' });
      }

      logger.info({ service, user: req.user?.username }, 'Admin triggered container restart');

      try {
        await execFile(
          'docker',
          ['compose', '-f', COMPOSE_FILE, 'restart', service],
          { timeout: EXEC_TIMEOUT },
        );
        return { ok: true, message: `Service '${service}' restarted` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, service }, 'Container restart failed');
        return reply.code(500).send({ error: `Failed to restart service '${service}': ${msg}` });
      }
    },
  );

  // POST /api/system/containers/rebuild — rebuild and recreate all containers (runs in background)
  app.post('/api/system/containers/rebuild', { preHandler: adminPinElevated }, async (req, reply) => {
    logger.warn({ user: req.user?.username }, 'Admin triggered full container rebuild');

    // Fire and forget — do not await
    execFile(
      'docker',
      ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--force-recreate'],
      { timeout: 300_000 },
    ).catch((err) => {
      logger.error({ err }, 'Container rebuild failed');
    });

    return reply.code(202).send({ ok: true, message: 'Container rebuild initiated in background' });
  });
}
