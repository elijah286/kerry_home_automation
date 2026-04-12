// ---------------------------------------------------------------------------
// User management routes — admin only
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import type { User, CreateUserRequest, UpdateUserRequest, UserRole, UiPreferences } from '@ha/shared';
import { USER_ROLES, UI_PREFERENCE_KEYS } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate, requireRole } from './auth.js';
import { applyAdminPreferencesPatch } from '../lib/ui-preferences.js';

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function adminPrefsSubset(v: unknown): UiPreferences {
  const o = asRecord(v);
  const out: UiPreferences = {};
  for (const k of UI_PREFERENCE_KEYS) {
    if (o[k] !== undefined && o[k] !== null) {
      (out as Record<string, unknown>)[k] = o[k];
    }
  }
  return out;
}

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  enabled: boolean;
  created_at: Date;
  ui_preferences_admin?: unknown;
};

function toUser(row: UserRow): User {
  const base: User = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as UserRole,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
  };
  const admin = adminPrefsSubset(row.ui_preferences_admin);
  if (Object.keys(admin).length > 0) {
    base.uiPreferencesAdmin = admin;
  }
  return base;
}

const SALT_ROUNDS = 12;

export function registerUserRoutes(app: FastifyInstance): void {
  const adminOnly = [authenticate, requireRole('admin')];

  // GET /api/users
  app.get('/api/users', { preHandler: adminOnly }, async () => {
    const { rows } = await query<UserRow>(
      'SELECT id, username, display_name, role, enabled, created_at, ui_preferences_admin FROM users ORDER BY created_at',
    );
    return { users: rows.map(toUser) };
  });

  // POST /api/users
  app.post<{ Body: CreateUserRequest }>('/api/users', { preHandler: adminOnly }, async (req, reply) => {
    const { username, displayName, password, role } = req.body;

    if (!username || !displayName || !password) {
      return reply.code(400).send({ error: 'username, displayName, and password are required' });
    }

    if (!USER_ROLES.includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const { rows } = await query<UserRow>(
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
    const { displayName, role, enabled, password, uiPreferencesAdmin } = req.body;

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

    if (uiPreferencesAdmin !== undefined) {
      const { rows: prefRows } = await query<{ ui_preferences_admin: unknown }>(
        'SELECT ui_preferences_admin FROM users WHERE id = $1',
        [id],
      );
      if (prefRows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const nextAdmin = applyAdminPreferencesPatch(prefRows[0].ui_preferences_admin, uiPreferencesAdmin);
      sets.push(`ui_preferences_admin = $${i++}::jsonb`);
      params.push(JSON.stringify(nextAdmin));
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, username, display_name, role, enabled, created_at, ui_preferences_admin`,
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
