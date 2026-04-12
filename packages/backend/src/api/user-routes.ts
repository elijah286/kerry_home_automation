// ---------------------------------------------------------------------------
// User management routes — admin only
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import type { User, CreateUserRequest, UpdateUserRequest } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate, requireRole } from './auth.js';

function toUser(row: { id: string; username: string; display_name: string; role: string; enabled: boolean; created_at: Date }): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as 'admin' | 'user' | 'kiosk',
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
  };
}

const SALT_ROUNDS = 12;

export function registerUserRoutes(app: FastifyInstance): void {
  const adminOnly = [authenticate, requireRole('admin')];

  // GET /api/users
  app.get('/api/users', { preHandler: adminOnly }, async () => {
    const { rows } = await query<{
      id: string; username: string; display_name: string; role: string; enabled: boolean; created_at: Date;
    }>('SELECT id, username, display_name, role, enabled, created_at FROM users ORDER BY created_at');
    return { users: rows.map(toUser) };
  });

  // POST /api/users
  app.post<{ Body: CreateUserRequest }>('/api/users', { preHandler: adminOnly }, async (req, reply) => {
    const { username, displayName, password, role } = req.body;

    if (!username || !displayName || !password) {
      return reply.code(400).send({ error: 'username, displayName, and password are required' });
    }

    if (!['admin', 'user', 'kiosk'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const { rows } = await query<{ id: string; username: string; display_name: string; role: string; enabled: boolean; created_at: Date }>(
        'INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, role, enabled, created_at',
        [username, displayName, hash, role],
      );
      logger.info({ username, role }, 'User created');
      return { user: toUser(rows[0]) };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Username already exists' });
      }
      throw err;
    }
  });

  // PUT /api/users/:id
  app.put<{ Params: { id: string }; Body: UpdateUserRequest }>('/api/users/:id', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params;
    const { displayName, role, enabled, password } = req.body;

    // Prevent demoting the last admin
    if (role && role !== 'admin') {
      const { rows } = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id != $1",
        [id],
      );
      if (parseInt(rows[0].count) === 0) {
        return reply.code(400).send({ error: 'Cannot remove the last admin' });
      }
    }

    // Build dynamic update
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (displayName !== undefined) { sets.push(`display_name = $${i++}`); params.push(displayName); }
    if (role !== undefined) { sets.push(`role = $${i++}`); params.push(role); }
    if (enabled !== undefined) { sets.push(`enabled = $${i++}`); params.push(enabled); }
    if (password) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      sets.push(`password_hash = $${i++}`);
      params.push(hash);
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await query<{ id: string; username: string; display_name: string; role: string; enabled: boolean; created_at: Date }>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, username, display_name, role, enabled, created_at`,
      params,
    );

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // If user was disabled, delete their sessions
    if (enabled === false) {
      await query('DELETE FROM sessions WHERE user_id = $1', [id]);
    }

    logger.info({ userId: id }, 'User updated');
    return { user: toUser(rows[0]) };
  });

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user!.id) {
      return reply.code(400).send({ error: 'Cannot delete your own account' });
    }

    // Prevent deleting the last admin
    const { rows: adminCheck } = await query<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [id],
    );
    if (adminCheck.length > 0 && adminCheck[0].role === 'admin') {
      const { rows: countCheck } = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
        [],
      );
      if (parseInt(countCheck[0].count) <= 1) {
        return reply.code(400).send({ error: 'Cannot delete the last admin' });
      }
    }

    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
    if (rowCount === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    logger.info({ userId: id }, 'User deleted');
    return { ok: true };
  });
}
