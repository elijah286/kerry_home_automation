import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { authenticate, signToken, type JwtPayload } from '../auth/jwt.js';
import { requireRole } from '../auth/middleware.js';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'member' | 'guest';
  allowed_areas: string[] | null;
  dashboard_config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    allowed_areas: row.allowed_areas,
    dashboard_config: row.dashboard_config,
  };
}

function toJwtPayload(row: UserRow): JwtPayload {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    allowed_areas: row.role === 'admin' ? null : row.allowed_areas,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // --- Public routes ---

  app.post<{
    Body: { username?: string; password?: string };
  }>('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' });
    }

    const { rows } = await query<UserRow>(
      'SELECT * FROM users WHERE username = $1',
      [username],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.status(401).send({ error: 'invalid credentials' });
    }

    const token = signToken(app, toJwtPayload(user));
    return { token, user: toPublicUser(user) };
  });

  // --- Authenticated routes ---

  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req) => {
    const payload = req.user as JwtPayload;
    const { rows } = await query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [payload.id],
    );
    const user = rows[0];
    if (!user) {
      return { user: null };
    }
    return { user: toPublicUser(user) };
  });

  app.put<{
    Body: { dashboard_config?: Record<string, unknown> };
  }>('/api/auth/me/dashboard', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as JwtPayload;
    const cfg = req.body?.dashboard_config;
    if (!cfg || typeof cfg !== 'object') {
      return reply.status(400).send({ error: 'dashboard_config required' });
    }
    await query(
      `UPDATE users SET dashboard_config = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(cfg), payload.id],
    );
    return { ok: true };
  });

  // --- Admin-only user management ---

  app.get('/api/users', {
    preHandler: [authenticate, requireRole('admin')],
  }, async () => {
    const { rows } = await query<UserRow>(
      'SELECT * FROM users ORDER BY created_at',
    );
    return { users: rows.map(toPublicUser) };
  });

  app.post<{
    Body: {
      username?: string;
      password?: string;
      display_name?: string;
      role?: string;
      allowed_areas?: string[] | null;
    };
  }>('/api/users', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    const { username, password, display_name, role, allowed_areas } = req.body ?? {};
    if (!username || !password || !display_name) {
      return reply.status(400).send({ error: 'username, password, and display_name required' });
    }
    const validRoles = ['admin', 'member', 'guest'];
    if (role && !validRoles.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const hash = await hashPassword(password);
    try {
      const { rows } = await query<UserRow>(
        `INSERT INTO users (username, display_name, password_hash, role, allowed_areas)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [username, display_name, hash, role ?? 'member', allowed_areas ?? null],
      );
      return { user: toPublicUser(rows[0]) };
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return reply.status(409).send({ error: 'username already exists' });
      }
      throw err;
    }
  });

  app.put<{
    Params: { id: string };
    Body: {
      display_name?: string;
      role?: string;
      allowed_areas?: string[] | null;
    };
  }>('/api/users/:id', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    const { id } = req.params;
    const { display_name, role, allowed_areas } = req.body ?? {};
    const validRoles = ['admin', 'member', 'guest'];
    if (role && !validRoles.includes(role)) {
      return reply.status(400).send({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const { rows } = await query<UserRow>(
      `UPDATE users SET
        display_name = COALESCE($1, display_name),
        role = COALESCE($2, role),
        allowed_areas = CASE WHEN $3::boolean THEN $4::text[] ELSE allowed_areas END,
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        display_name ?? null,
        role ?? null,
        allowed_areas !== undefined,
        allowed_areas ?? null,
        id,
      ],
    );
    if (rows.length === 0) {
      return reply.status(404).send({ error: 'user not found' });
    }
    return { user: toPublicUser(rows[0]) };
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    const { id } = req.params;
    const caller = req.user as JwtPayload;
    if (caller.id === id) {
      return reply.status(400).send({ error: 'cannot delete yourself' });
    }
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
    if (rowCount === 0) {
      return reply.status(404).send({ error: 'user not found' });
    }
    return { ok: true };
  });

  app.put<{
    Params: { id: string };
    Body: { password?: string };
  }>('/api/users/:id/password', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { id } = req.params;
    const caller = req.user as JwtPayload;
    if (caller.role !== 'admin' && caller.id !== id) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const { password } = req.body ?? {};
    if (!password || typeof password !== 'string' || password.length < 4) {
      return reply.status(400).send({ error: 'password required (min 4 characters)' });
    }
    const hash = await hashPassword(password);
    const { rowCount } = await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, id],
    );
    if (rowCount === 0) {
      return reply.status(404).send({ error: 'user not found' });
    }
    return { ok: true };
  });
}
