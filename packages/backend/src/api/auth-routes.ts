// ---------------------------------------------------------------------------
// Auth routes — login, logout, me
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import type { LoginRequest, User } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { appConfig } from '../config.js';
import { signToken, authenticate } from './auth.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  // POST /api/auth/login
  app.post<{ Body: LoginRequest }>('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const { rows } = await query<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      role: string;
      enabled: boolean;
      created_at: Date;
    }>(
      'SELECT id, username, display_name, password_hash, role, enabled, created_at FROM users WHERE username = $1',
      [username],
    );

    if (rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.enabled) {
      return reply.code(401).send({ error: 'Account disabled' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Create session
    const expiresAt = new Date(Date.now() + appConfig.auth.sessionTtlDays * 24 * 60 * 60 * 1000);
    const { rows: sessionRows } = await query<{ id: string }>(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [user.id, 'pending', expiresAt],
    );

    const sessionId = sessionRows[0].id;
    const token = signToken(user.id, user.username, user.role as 'admin' | 'user' | 'kiosk', sessionId);

    // Update token_hash with actual hash
    const crypto = await import('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('UPDATE sessions SET token_hash = $1 WHERE id = $2', [tokenHash, sessionId]);

    logger.info({ username: user.username }, 'User logged in');

    // Set httpOnly cookie
    reply.header('Set-Cookie', `ha_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${appConfig.auth.sessionTtlDays * 24 * 60 * 60}`);

    const responseUser: User = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role as 'admin' | 'user' | 'kiosk',
      enabled: user.enabled,
      createdAt: user.created_at.toISOString(),
    };

    return { user: responseUser };
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
    const { rows } = await query<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      enabled: boolean;
      created_at: Date;
    }>(
      'SELECT id, username, display_name, role, enabled, created_at FROM users WHERE id = $1',
      [req.user!.id],
    );

    const u = rows[0];
    const user: User = {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      role: u.role as 'admin' | 'user' | 'kiosk',
      enabled: u.enabled,
      createdAt: u.created_at.toISOString(),
    };

    return { user };
  });
}
