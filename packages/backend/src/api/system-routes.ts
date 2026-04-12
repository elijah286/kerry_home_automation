// ---------------------------------------------------------------------------
// System telemetry + service control routes — admin only
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { Permission } from '@ha/shared';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';
import { requirePermission, requireRole } from './auth.js';
import { automationEngine } from '../automations/engine.js';
import { getLogEntries, subscribeLogs, type LogEntry } from '../log-buffer.js';

const adminOnly = [requireRole('admin')];
const terminalAccess = [requirePermission(Permission.ViewSystemTerminal)];

const UPDATE_LOG_PATH = '/var/log/home-automation/update.log';
const LOG_LINES_TO_RETURN = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sample CPU utilisation over a 200ms window, averaged across all cores. */
async function getCpuPercent(): Promise<number> {
  const sample = () =>
    os.cpus().map((c) => ({ ...c.times }));

  const t1 = sample();
  await new Promise<void>((r) => setTimeout(r, 200));
  const t2 = sample();

  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < t1.length; i++) {
    const idle = t2[i].idle - t1[i].idle;
    const tick =
      Object.values(t2[i]).reduce((a, b) => a + b, 0) -
      Object.values(t1[i]).reduce((a, b) => a + b, 0);
    totalIdle += idle;
    totalTick += tick;
  }

  return totalTick === 0 ? 0 : Math.round(((totalTick - totalIdle) / totalTick) * 100);
}

/** Run `df -B1 <path>` and return used/total bytes. */
async function getDiskBytes(path: string): Promise<{ used: number; total: number }> {
  return new Promise((resolve) => {
    execFile('df', ['-B1', path], (err, stdout) => {
      if (err) {
        resolve({ used: 0, total: 0 });
        return;
      }
      const lines = stdout.trim().split('\n');
      const parts = lines[1]?.split(/\s+/) ?? [];
      // df output: Filesystem 1B-blocks Used Available Use% Mountpoint
      const total = parseInt(parts[1] ?? '0', 10);
      const used = parseInt(parts[2] ?? '0', 10);
      resolve({ used, total });
    });
  });
}

/** Execute a docker compose command against the production compose file. */
function dockerCompose(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['compose', '-f', appConfig.serverInstaller.prodComposePath, ...args],
      { timeout: 60_000 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerSystemRoutes(app: FastifyInstance): void {

  // GET /api/system/stats
  app.get('/api/system/stats', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const [cpuPercent, disk] = await Promise.all([
        getCpuPercent(),
        getDiskBytes('/'),
      ]);

      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      return {
        cpu: {
          percent: cpuPercent,
          cores: os.cpus().length,
          model: os.cpus()[0]?.model ?? 'Unknown',
        },
        memory: {
          used: totalMem - freeMem,
          total: totalMem,
          percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        },
        disk: {
          used: disk.used,
          total: disk.total,
          percent: disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0,
        },
        uptime: Math.floor(os.uptime()),
        platform: `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
      };
    } catch (err) {
      logger.error({ err }, 'Failed to collect system stats');
      return reply.code(500).send({ error: 'Failed to collect system stats' });
    }
  });

  // GET /api/system/logs — recent backend log lines (system terminal)
  app.get('/api/system/logs', { preHandler: terminalAccess }, async () => {
    return { entries: getLogEntries() };
  });

  // GET /api/system/logs/stream — SSE of new log lines after connect
  app.get('/api/system/logs/stream', { preHandler: terminalAccess }, async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (entry: LogEntry) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'entry', entry })}\n\n`);
    };

    const unsub = subscribeLogs(write);
    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      unsub();
    });
  });

  // GET /api/system/update-log
  app.get('/api/system/update-log', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const content = await readFile(UPDATE_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n').slice(-LOG_LINES_TO_RETURN);
      return { lines };
    } catch {
      // Log file doesn't exist yet (server not yet installed, or no updates run)
      return { lines: [] };
    }
  });

  // POST /api/system/restart/backend
  app.post('/api/system/restart/backend', { preHandler: adminOnly }, async (_req, reply) => {
    logger.info('Admin triggered backend restart');
    // Fire and forget — the container will restart, taking this process with it
    setImmediate(() => {
      dockerCompose(['restart', 'backend']).catch((err) =>
        logger.error({ err }, 'Backend restart failed'),
      );
    });
    return reply.code(202).send({ ok: true, message: 'Backend restart initiated' });
  });

  // POST /api/system/restart/frontend
  app.post('/api/system/restart/frontend', { preHandler: adminOnly }, async (_req, reply) => {
    logger.info('Admin triggered frontend restart');
    try {
      await dockerCompose(['restart', 'frontend']);
      return { ok: true, message: 'Frontend restarted' };
    } catch (err) {
      logger.error({ err }, 'Frontend restart failed');
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // POST /api/system/restart/hardware
  app.post('/api/system/restart/hardware', { preHandler: adminOnly }, async (_req, reply) => {
    logger.warn('Admin triggered system reboot');
    setImmediate(() => {
      execFile('sudo', ['reboot'], (err) => {
        if (err) logger.error({ err }, 'Reboot command failed');
      });
    });
    return reply.code(202).send({ ok: true, message: 'System reboot initiated' });
  });

  // POST /api/system/reload/automations
  app.post('/api/system/reload/automations', { preHandler: adminOnly }, async () => {
    await automationEngine.reload();
    logger.info('Automations reloaded via system controls');
    return { ok: true, message: 'Automations reloaded' };
  });
}
