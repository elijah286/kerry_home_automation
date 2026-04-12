// ---------------------------------------------------------------------------
// Server installer ISO generation routes — admin only
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { createReadStream, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate, requireRole } from './auth.js';
import { buildInstallerIso, type InstallerJobConfig, type ProgressEvent } from '../iso-generator/index.js';

type RawReply = {
  write: (data: string) => boolean;
  end: () => void;
  on: (event: string, fn: () => void) => void;
};

// In-memory SSE subscriber map: jobId → Set of raw response streams
const sseClients = new Map<string, Set<RawReply>>();

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
}

export function registerInstallerRoutes(app: FastifyInstance): void {
  const adminOnly = [authenticate, requireRole('admin')];

  // -------------------------------------------------------------------------
  // POST /api/installer/start
  // Body: { hostname, username, password, sshPublicKey? }
  // Returns: { jobId }
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

      const { rows } = await query<JobRow>(
        `INSERT INTO installer_jobs (status, created_by)
         VALUES ('running', $1)
         RETURNING id`,
        [userId],
      );
      const jobId = rows[0].id;

      logger.info({ jobId, hostname, username }, 'ISO build job started');

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
      ).then(async (isoPath) => {
        // On success: persist final path
        await query(
          `UPDATE installer_jobs
           SET status = 'complete', progress = 100, message = 'ISO ready for download',
               iso_path = $1, updated_at = NOW()
           WHERE id = $2`,
          [isoPath, jobId],
        ).catch((err) => logger.error({ err }, 'Failed to finalize job record'));

        emitToClients(jobId, { percent: 100, message: 'ISO ready for download', status: 'complete' });

        // Close all SSE connections for this job
        const clients = sseClients.get(jobId);
        if (clients) {
          for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
          sseClients.delete(jobId);
        }
      }).catch(async (err: Error) => {
        logger.error({ err, jobId }, 'ISO build failed');
        const msg = err.message ?? 'ISO build failed';

        await query(
          `UPDATE installer_jobs
           SET status = 'failed', message = $1, updated_at = NOW()
           WHERE id = $2`,
          [msg, jobId],
        ).catch((e) => logger.error({ e }, 'Failed to mark job as failed'));

        emitToClients(jobId, { percent: 0, message: msg, status: 'failed' });

        const clients = sseClients.get(jobId);
        if (clients) {
          for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
          sseClients.delete(jobId);
        }
      });

      return { jobId };
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
      if (job.status === 'complete' || job.status === 'failed') {
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

      // Delete ISO after stream ends (it's large and single-use)
      stream.on('end', () => {
        unlink(isoPath).catch((err) => logger.warn({ err, isoPath }, 'Could not delete ISO after download'));
      });
      stream.on('error', (err) => {
        logger.error({ err }, 'Error streaming ISO');
        reply.raw.end();
      });

      return reply;
    },
  );
}
