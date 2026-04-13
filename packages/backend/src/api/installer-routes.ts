// ---------------------------------------------------------------------------
// Server installer ISO generation routes — admin only
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { createReadStream, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { appConfig } from '../config.js';
import { authenticate, requireRole } from './auth.js';
import {
  buildInstallerIso,
  BuildCancelledError,
  type InstallerJobConfig,
  type ProgressEvent,
} from '../iso-generator/index.js';

type RawReply = {
  write: (data: string) => boolean;
  end: () => void;
  on: (event: string, fn: () => void) => void;
};

// In-memory SSE subscriber map: jobId → Set of raw response streams
const sseClients = new Map<string, Set<RawReply>>();

/** AbortControllers for builds started in this process (used by POST /cancel). */
const installerBuildAbort = new Map<string, AbortController>();

function emitToClients(jobId: string, event: ProgressEvent): void {
  const clients = sseClients.get(jobId);
  if (!clients?.size) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try { client.write(data); } catch { /* client disconnected */ }
  }
}

interface JobRow {
  id: string;
  status: string;
  progress: number;
  message: string;
  iso_path: string | null;
  created_by: string;
  installer_hostname: string | null;
  installer_admin_username: string | null;
  iso_size_bytes: string | number | null;
  completed_at: Date | string | null;
  created_at: Date | string;
}

export function registerInstallerRoutes(app: FastifyInstance): void {
  const adminOnly = [authenticate, requireRole('admin')];

  // -------------------------------------------------------------------------
  // POST /api/installer/start
  // Body: { hostname, username, password, sshPublicKey? }
  // Returns: { jobId, alreadyRunning?: boolean }
  // -------------------------------------------------------------------------
  app.post<{ Body: InstallerJobConfig & { sshPublicKey?: string } }>(
    '/api/installer/start',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { hostname, username, password, sshPublicKey } = req.body;

      if (!hostname?.trim() || !username?.trim() || !password?.trim()) {
        return reply.code(400).send({ error: 'hostname, username, and password are required' });
      }

      const userId = (req as unknown as { user: { id: string } }).user.id;

      const existing = await query<Pick<JobRow, 'id'>>(
        `SELECT id FROM installer_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`,
      );
      if (existing.rows.length > 0) {
        const jobId = existing.rows[0].id;
        logger.info({ jobId }, 'ISO start requested while build already running — returning existing job');
        return { jobId, alreadyRunning: true };
      }

      let jobId: string;
      try {
        const { rows } = await query<JobRow>(
          `INSERT INTO installer_jobs (status, created_by, installer_hostname, installer_admin_username)
           VALUES ('running', $1, $2, $3)
           RETURNING id`,
          [userId, hostname.trim(), username.trim()],
        );
        jobId = rows[0].id;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          const again = await query<Pick<JobRow, 'id'>>(
            `SELECT id FROM installer_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`,
          );
          if (again.rows.length > 0) {
            const id = again.rows[0].id;
            logger.info({ jobId: id }, 'ISO start raced with another start — returning existing job');
            return { jobId: id, alreadyRunning: true };
          }
        }
        throw err;
      }

      logger.info({ jobId, hostname, username }, 'ISO build job started');

      const ac = new AbortController();
      installerBuildAbort.set(jobId, ac);

      const closeSseForJob = (id: string): void => {
        const clients = sseClients.get(id);
        if (clients) {
          for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
          sseClients.delete(id);
        }
      };

      // Fire and forget — do not await
      void buildInstallerIso(
        jobId,
        { hostname, username, password, sshPublicKey },
        async (event) => {
          // Persist progress to DB
          await query(
            `UPDATE installer_jobs
             SET status = $1, progress = $2, message = $3, iso_path = $4, updated_at = NOW()
             WHERE id = $5`,
            [event.status, event.percent, event.message, null, jobId],
          ).catch((err) => logger.error({ err }, 'Failed to update job progress'));

          emitToClients(jobId, event);
        },
        { signal: ac.signal },
      ).then(async (isoPath) => {
        let sizeBytes = 0;
        try {
          sizeBytes = statSync(isoPath).size;
        } catch (e) {
          logger.warn({ e, isoPath, jobId }, 'Could not stat ISO for size metadata');
        }
        // On success: persist final path + metadata for artifact list
        await query(
          `UPDATE installer_jobs
           SET status = 'complete', progress = 100, message = 'ISO ready for download',
               iso_path = $1, iso_size_bytes = $2, completed_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [isoPath, sizeBytes, jobId],
        ).catch((err) => logger.error({ err }, 'Failed to finalize job record'));

        emitToClients(jobId, { percent: 100, message: 'ISO ready for download', status: 'complete' });

        closeSseForJob(jobId);
      }).catch(async (err: Error) => {
        const cancelled = err instanceof BuildCancelledError;
        if (cancelled) {
          logger.info({ jobId }, 'ISO build cancelled');
          const msg = 'Cancelled';
          await rm(join(appConfig.serverInstaller.workDir, jobId), { recursive: true, force: true }).catch((e) =>
            logger.warn({ e, jobId }, 'Could not remove installer work directory after cancel'),
          );
          await query(
            `UPDATE installer_jobs
             SET status = 'cancelled', progress = 0, message = $1, iso_path = NULL, updated_at = NOW()
             WHERE id = $2`,
            [msg, jobId],
          ).catch((e) => logger.error({ e }, 'Failed to mark job as cancelled'));

          emitToClients(jobId, { percent: 0, message: msg, status: 'cancelled' });
          closeSseForJob(jobId);
          return;
        }

        logger.error({ err, jobId }, 'ISO build failed');
        const msg = err.message ?? 'ISO build failed';

        await query(
          `UPDATE installer_jobs
           SET status = 'failed', message = $1, updated_at = NOW()
           WHERE id = $2`,
          [msg, jobId],
        ).catch((e) => logger.error({ e }, 'Failed to mark job as failed'));

        emitToClients(jobId, { percent: 0, message: msg, status: 'failed' });

        closeSseForJob(jobId);
      }).finally(() => {
        installerBuildAbort.delete(jobId);
      });

      return { jobId, alreadyRunning: false };
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/installer/cancel/:jobId  — abort in-process build (singleton)
  // -------------------------------------------------------------------------
  app.post<{ Params: { jobId: string } }>(
    '/api/installer/cancel/:jobId',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { jobId } = req.params;
      const { rows } = await query<Pick<JobRow, 'status'>>(
        'SELECT status FROM installer_jobs WHERE id = $1',
        [jobId],
      );
      if (!rows.length) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      if (rows[0].status !== 'running') {
        return reply.code(409).send({ error: 'Job is not running' });
      }
      const ac = installerBuildAbort.get(jobId);
      if (!ac) {
        return reply.code(503).send({
          error:
            'This build cannot be cancelled from this server process (e.g. after restart). Wait for it to finish or mark the job stale in the database.',
        });
      }
      ac.abort();
      return { ok: true };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/installer/active  — current running singleton job (if any)
  // -------------------------------------------------------------------------
  app.get(
    '/api/installer/active',
    { preHandler: adminOnly },
    async () => {
      const { rows } = await query<Pick<JobRow, 'id' | 'status' | 'progress' | 'message'>>(
        `SELECT id, status, progress, message FROM installer_jobs
         WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`,
      );
      if (!rows.length) return { active: false as const };
      const r = rows[0];
      return {
        active: true as const,
        jobId: r.id,
        status: r.status,
        progress: r.progress,
        message: r.message,
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/installer/progress/:jobId  — SSE stream
  // -------------------------------------------------------------------------
  app.get<{ Params: { jobId: string } }>(
    '/api/installer/progress/:jobId',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { jobId } = req.params;

      // Verify job exists
      const { rows } = await query<JobRow>(
        'SELECT id, status, progress, message FROM installer_jobs WHERE id = $1',
        [jobId],
      );
      if (!rows.length) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      const job = rows[0];

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.flushHeaders();

      // Send current state immediately (handles reconnect after page refresh)
      reply.raw.write(
        `data: ${JSON.stringify({ percent: job.progress, message: job.message, status: job.status })}\n\n`,
      );

      // If already terminal, close immediately
      if (job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled') {
        reply.raw.end();
        return reply;
      }

      // Register SSE client
      if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
      sseClients.get(jobId)!.add(reply.raw as unknown as RawReply);

      // Heartbeat to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try { reply.raw.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
      }, 15_000);

      reply.raw.on('close', () => {
        clearInterval(heartbeat);
        sseClients.get(jobId)?.delete(reply.raw as unknown as RawReply);
      });

      return reply;
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/installer/artifacts  — completed builds with ISO on disk (or record only)
  // -------------------------------------------------------------------------
  app.get(
    '/api/installer/artifacts',
    { preHandler: adminOnly },
    async () => {
      const { rows } = await query<
        Pick<
          JobRow,
          | 'id'
          | 'installer_hostname'
          | 'installer_admin_username'
          | 'iso_path'
          | 'iso_size_bytes'
          | 'created_at'
          | 'completed_at'
        >
      >(
        `SELECT id, installer_hostname, installer_admin_username, iso_path, iso_size_bytes,
                created_at, completed_at
         FROM installer_jobs
         WHERE status = 'complete' AND iso_path IS NOT NULL
         ORDER BY COALESCE(completed_at, updated_at) DESC
         LIMIT 50`,
      );

      const items = rows.map((r) => {
        let fileAvailable = false;
        const recordedSize = r.iso_size_bytes != null ? Number(r.iso_size_bytes) : 0;
        let sizeBytes = recordedSize;
        if (r.iso_path) {
          try {
            const st = statSync(r.iso_path);
            fileAvailable = true;
            sizeBytes = st.size;
          } catch {
            fileAvailable = false;
            if (recordedSize > 0) sizeBytes = recordedSize;
          }
        }
        const createdAt =
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
        const completedAt =
          r.completed_at == null
            ? null
            : r.completed_at instanceof Date
              ? r.completed_at.toISOString()
              : String(r.completed_at);

        return {
          jobId: r.id,
          hostname: r.installer_hostname,
          adminUsername: r.installer_admin_username,
          createdAt,
          completedAt,
          sizeBytes,
          fileAvailable,
        };
      });

      return { items };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/installer/status/:jobId  — single poll (for reconnect fallback)
  // -------------------------------------------------------------------------
  app.get<{ Params: { jobId: string } }>(
    '/api/installer/status/:jobId',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { rows } = await query<JobRow>(
        'SELECT id, status, progress, message, iso_path FROM installer_jobs WHERE id = $1',
        [req.params.jobId],
      );
      if (!rows.length) return reply.code(404).send({ error: 'Job not found' });
      const { status, progress, message } = rows[0];
      return { status, progress, message };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/installer/download/:jobId  — binary ISO download
  // -------------------------------------------------------------------------
  app.get<{ Params: { jobId: string } }>(
    '/api/installer/download/:jobId',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { rows } = await query<JobRow>(
        'SELECT status, iso_path FROM installer_jobs WHERE id = $1',
        [req.params.jobId],
      );

      if (!rows.length) return reply.code(404).send({ error: 'Job not found' });

      const { status, iso_path: isoPath } = rows[0];
      if (status !== 'complete') {
        return reply.code(409).send({ error: `Job is not complete (status: ${status})` });
      }
      if (!isoPath) {
        return reply.code(500).send({ error: 'ISO path missing from job record' });
      }

      let fileSize: number;
      try {
        fileSize = statSync(isoPath).size;
      } catch {
        return reply.code(404).send({ error: 'ISO file not found on disk — it may have already been downloaded' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="ha-server-installer.iso"',
        'Content-Length': String(fileSize),
      });

      const stream = createReadStream(isoPath);
      stream.pipe(reply.raw);

      stream.on('error', (err) => {
        logger.error({ err }, 'Error streaming ISO');
        reply.raw.end();
      });

      return reply;
    },
  );
}
