import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../auth/jwt.js';
import { requireRole } from '../auth/middleware.js';

interface KioskTokenRow {
  id: string;
  token: string;
  name: string;
  area_ids: string[];
  created_at: Date;
  last_used_at: Date | null;
}

export async function registerKioskRoutes(app: FastifyInstance): Promise<void> {
  // Exchange a kiosk token for a JWT (unauthenticated)
  app.post<{
    Body: { token?: string };
  }>('/api/auth/kiosk', async (req, reply) => {
    const { token } = req.body ?? {};
    if (!token) {
      return reply.status(400).send({ error: 'token required' });
    }

    const { rows } = await query<KioskTokenRow>(
      'SELECT * FROM kiosk_tokens WHERE token = $1',
      [token],
    );
    const kiosk = rows[0];
    if (!kiosk) {
      return reply.status(401).send({ error: 'invalid kiosk token' });
    }

    await query(
      'UPDATE kiosk_tokens SET last_used_at = NOW() WHERE id = $1',
      [kiosk.id],
    );

    const jwt = signToken(app, {
      id: `kiosk:${kiosk.id}`,
      username: `kiosk:${kiosk.name}`,
      display_name: kiosk.name,
      role: 'guest',
      allowed_areas: kiosk.area_ids.length > 0 ? kiosk.area_ids : null,
    });

    return {
      token: jwt,
      user: {
        id: `kiosk:${kiosk.id}`,
        username: `kiosk:${kiosk.name}`,
        display_name: kiosk.name,
        role: 'guest' as const,
        allowed_areas: kiosk.area_ids.length > 0 ? kiosk.area_ids : null,
        dashboard_config: {},
      },
    };
  });

  // Admin: list kiosk tokens
  app.get('/api/kiosk/tokens', {
    preHandler: [authenticate, requireRole('admin')],
  }, async () => {
    const { rows } = await query<KioskTokenRow>(
      'SELECT * FROM kiosk_tokens ORDER BY created_at',
    );
    return {
      tokens: rows.map((r) => ({
        id: r.id,
        token: r.token,
        name: r.name,
        area_ids: r.area_ids,
        created_at: r.created_at.toISOString(),
        last_used_at: r.last_used_at?.toISOString() ?? null,
      })),
    };
  });

  // Admin: create kiosk token
  app.post<{
    Body: { name?: string; area_ids?: string[] };
  }>('/api/kiosk/tokens', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    const { name, area_ids } = req.body ?? {};
    if (!name) {
      return reply.status(400).send({ error: 'name required' });
    }

    const token = randomBytes(32).toString('base64url');
    const { rows } = await query<KioskTokenRow>(
      `INSERT INTO kiosk_tokens (token, name, area_ids)
       VALUES ($1, $2, $3) RETURNING *`,
      [token, name, area_ids ?? []],
    );
    const row = rows[0];
    return {
      token: {
        id: row.id,
        token: row.token,
        name: row.name,
        area_ids: row.area_ids,
        created_at: row.created_at.toISOString(),
        last_used_at: null,
      },
    };
  });

  // Admin: revoke kiosk token
  app.delete<{ Params: { id: string } }>('/api/kiosk/tokens/:id', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    const { rowCount } = await query(
      'DELETE FROM kiosk_tokens WHERE id = $1',
      [req.params.id],
    );
    if (rowCount === 0) {
      return reply.status(404).send({ error: 'token not found' });
    }
    return { ok: true };
  });
}
