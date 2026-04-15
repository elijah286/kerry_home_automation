// ---------------------------------------------------------------------------
// Auth routes — login, logout, me, UI preferences, PIN elevation
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import type { LoginRequest, UserRole, UiPreferences } from '@ha/shared';
import { UI_PREFERENCE_KEYS, canHavePin, PIN_ELIGIBLE_ROLES } from '@ha/shared';
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
import {
  clearPinElevation,
  getPinElevationTtlSeconds,
  isValidPinFormat,
  startPinElevation,
} from '../lib/pin-elevation.js';

/** True when at least one enabled admin/parent has a PIN set — any session can be elevated. */
async function isPinElevationAvailable(): Promise<boolean> {
  const rolePlaceholders = PIN_ELIGIBLE_ROLES.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users WHERE role IN (${rolePlaceholders}) AND pin_hash IS NOT NULL AND enabled = true`,
    [...PIN_ELIGIBLE_ROLES],
  );
  return parseInt(rows[0]?.count ?? '0', 10) > 0;
}

const SESSION_SELECT = `SELECT id, username, display_name, password_hash, role, enabled, created_at,
  ui_preferences, ui_preferences_admin, (pin_hash IS NOT NULL) AS has_pin FROM users`;

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

    const resp = authSessionFromRow(userRow, { elevated: false, elevatedSecondsRemaining: 0 });
    resp.pinElevationAvailable = await isPinElevationAvailable();
    return resp;
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    if (req.sessionId) {
      await clearPinElevation(req.sessionId);
    }
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

    const resp = authSessionFromRow(rows[0], {
      elevated: req.elevated ?? false,
      elevatedSecondsRemaining: req.elevationTtlSeconds ?? 0,
    });
    resp.pinElevationAvailable = await isPinElevationAvailable();
    return resp;
  });

  // POST /api/auth/pin — verify PIN against all admin/parent PINs and elevate the current session.
  // Any user can submit a PIN (e.g. a child on a kiosk), but only admin/parent PINs are accepted.
  app.post<{ Body: { pin?: string } }>('/api/auth/pin', { preHandler: [authenticate] }, async (req, reply) => {
    const raw = req.body?.pin ?? '';
    const pin = typeof raw === 'string' ? raw.trim() : '';
    if (!isValidPinFormat(pin)) {
      return reply.code(400).send({ error: 'PIN must be 4–6 digits' });
    }

    // Check the submitted PIN against all admin/parent users who have a PIN set
    const rolePlaceholders = PIN_ELIGIBLE_ROLES.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: pinRows } = await query<{ pin_hash: string }>(
      `SELECT pin_hash FROM users WHERE role IN (${rolePlaceholders}) AND pin_hash IS NOT NULL AND enabled = true`,
      [...PIN_ELIGIBLE_ROLES],
    );
    if (pinRows.length === 0) {
      return reply.code(400).send({ error: 'No elevation PINs configured. An admin or parent must set a PIN first.' });
    }

    let matched = false;
    for (const row of pinRows) {
      if (await bcrypt.compare(pin, row.pin_hash)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return reply.code(401).send({ error: 'Invalid PIN' });
    }

    const sid = req.sessionId;
    if (!sid) {
      return reply.code(500).send({ error: 'Session error' });
    }
    await startPinElevation(sid);
    const ttl = await getPinElevationTtlSeconds(sid);

    const { rows: userRows } = await query<SessionUserRow>(`${SESSION_SELECT} WHERE id = $1`, [req.user!.id]);
    return authSessionFromRow(userRows[0], { elevated: true, elevatedSecondsRemaining: ttl });
  });

  // PATCH /api/auth/me/pin — set or change PIN (admin/parent only, requires account password)
  app.patch<{ Body: { password?: string; pin?: string } }>(
    '/api/auth/me/pin',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!canHavePin(req.user!.role)) {
        return reply.code(403).send({ error: 'Only admin and parent accounts can set an elevation PIN' });
      }

      const rawPin = req.body?.pin ?? '';
      const pin = typeof rawPin === 'string' ? rawPin.trim() : '';
      const password = req.body?.password ?? '';

      if (!isValidPinFormat(pin)) {
        return reply.code(400).send({ error: 'PIN must be 4–6 digits' });
      }
      if (!password) {
        return reply.code(400).send({ error: 'Current password required' });
      }

      const { rows } = await query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user!.id],
      );
      if (rows.length === 0 || !rows[0].password_hash) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid password' });
      }

      const pinHash = await bcrypt.hash(pin, 12);
      await query('UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2', [pinHash, req.user!.id]);

      const { rows: out } = await query<SessionUserRow>(`${SESSION_SELECT} WHERE id = $1`, [req.user!.id]);
      return authSessionFromRow(out[0], {
        elevated: req.elevated ?? false,
        elevatedSecondsRemaining: req.elevationTtlSeconds ?? 0,
      });
    },
  );

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
    return authSessionFromRow(out[0], {
      elevated: req.elevated ?? false,
      elevatedSecondsRemaining: req.elevationTtlSeconds ?? 0,
    });
  });
}
