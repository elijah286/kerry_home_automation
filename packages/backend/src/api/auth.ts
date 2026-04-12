// ---------------------------------------------------------------------------
// Auth middleware — JWT validation + role checks
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { UserRole } from '@ha/shared';
import { appConfig } from '../config.js';
import { query } from '../db/pool.js';

interface JwtPayload {
  sub: string;       // user id
  username: string;
  role: UserRole;
  sid: string;        // session id
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
      role: UserRole;
    };
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signToken(userId: string, username: string, role: UserRole, sessionId: string): string {
  return jwt.sign(
    { sub: userId, username, role, sid: sessionId } satisfies JwtPayload,
    appConfig.auth.jwtSecret,
    { expiresIn: `${appConfig.auth.sessionTtlDays}d` },
  );
}

export function hashSessionToken(token: string): string {
  return hashToken(token);
}

/** Validates JWT from cookie or Authorization header. Can be used as Fastify preHandler or called directly. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Extract token from cookie or header
  const cookieHeader = req.headers.cookie ?? '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)ha_token=([^;]+)/);
  const headerMatch = req.headers.authorization?.match(/^Bearer\s+(.+)$/);
  const token = cookieMatch?.[1] ?? headerMatch?.[1];

  if (!token) {
    return reply.code(401).send({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, appConfig.auth.jwtSecret) as JwtPayload;

    // Verify session exists and hasn't expired
    const { rows } = await query<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [payload.sid],
    );

    if (rows.length === 0) {
      return reply.code(401).send({ error: 'Session expired' });
    }

    // Check user is still enabled
    const { rows: userRows } = await query<{ enabled: boolean }>(
      'SELECT enabled FROM users WHERE id = $1',
      [payload.sub],
    );

    if (userRows.length === 0 || !userRows[0].enabled) {
      return reply.code(401).send({ error: 'Account disabled' });
    }

    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};

/** Factory — returns a preHandler that requires one of the given roles */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
