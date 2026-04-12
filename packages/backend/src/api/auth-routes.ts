// ---------------------------------------------------------------------------
// Auth routes — login, logout, me, UI preferences
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import type { LoginRequest, UserRole, UiPreferences } from '@ha/shared';
import { UI_PREFERENCE_KEYS } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { appConfig } from '../config.js';
import { signToken, authenticate } from './auth.js';
import {
  authSessionFromRow,
  effectiveUiPreferences,
  mergeUserPreferences,
  sanitizeUserUiPreferencesPatch,
  type SessionUserRow,
} from '../lib/ui-preferences.js';

const SESSION_SELECT = `SELECT id, username, display_name, password_hash, role, enabled, created_at,
  ui_preferences, ui_preferences_admin FROM users`;

export function registerAuthRoutes(app: FastifyInstance): void {
  // POST /api/auth/login
  app.post<{ Body: LoginRequest }>('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const { rows } = await query<SessionUserRow>(`${SESSION_SELECT} WHERE username = $1`, [username]);

    if (rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const userRow = rows[0];

    if (!userRow.enabled) {
      return reply.code(401).send({ error: 'Account disabled' });
    }

    const hash = userRow.password_hash;
    if (!hash) {
      return reply.code(500).send({ error: 'Account data incomplete' });
    }
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Create session
    const expiresAt = new Date(Date.now() + appConfig.auth.sessionTtlDays * 24 * 60 * 60 * 1000);
    const { rows: sessionRows } = await query<{ id: string }>(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [userRow.id, 'pending', expiresAt],
    );

    const sessionId = sessionRows[0].id;
    const token = signToken(userRow.id, userRow.username, userRow.role as UserRole, sessionId);

    // Update token_hash with actual hash
    const crypto = await import('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('UPDATE sessions SET token_hash = $1 WHERE id = $2', [tokenHash, sessionId]);

    logger.info({ username: userRow.username }, 'User logged in');

    // Set httpOnly cookie
    reply.header('Set-Cookie', `ha_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${appConfig.auth.sessionTtlDays * 24 * 60 * 60}`);

    return authSessionFromRow(userRow);
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    // Delete all sessions for this user (simple approach)
    await query('DELETE FROM sessions WHERE user_id = $1', [req.user!.id]);

    reply.header('Set-Cookie', 'ha_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  });

  // GET /api/auth/me
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req) => {
    const { rows } = await query<SessionUserRow>(
      `${SESSION_SELECT} WHERE id = $1`,
      [req.user!.id],
    );

    return authSessionFromRow(rows[0]);
  });

  // PATCH /api/auth/me/ui-preferences — update own preferences (admin-locked keys ignored)
  app.patch<{ Body: unknown }>('/api/auth/me/ui-preferences', { preHandler: [authenticate] }, async (req, reply) => {
    const { rows } = await query<Pick<SessionUserRow, 'ui_preferences' | 'ui_preferences_admin'>>(
      'SELECT ui_preferences, ui_preferences_admin FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const { locks } = effectiveUiPreferences(rows[0].ui_preferences, rows[0].ui_preferences_admin);
    const { patch, invalid } = sanitizeUserUiPreferencesPatch(req.body);
    if (invalid.length > 0) {
      return reply.code(400).send({ error: 'Invalid preference fields', invalid });
    }

    const filtered: Record<string, unknown> = {};
    for (const key of UI_PREFERENCE_KEYS) {
      const k = key;
      if (patch[k] !== undefined && !locks[k]) {
        filtered[k] = patch[k] as unknown;
      }
    }

    if (Object.keys(filtered).length === 0) {
      return reply.code(400).send({ error: 'No preferences to update' });
    }

    const merged = mergeUserPreferences(rows[0].ui_preferences, filtered as UiPreferences);
    await query(
      'UPDATE users SET ui_preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(merged), req.user!.id],
    );

    const { rows: out } = await query<SessionUserRow>(`${SESSION_SELECT} WHERE id = $1`, [req.user!.id]);
    return authSessionFromRow(out[0]);
  });
}
