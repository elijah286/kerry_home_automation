// ---------------------------------------------------------------------------
// Auth middleware — JWT validation + role checks
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { UserRole } from '@ha/shared';
import type { Permission } from '@ha/shared';
import { ROLE_PERMISSIONS } from '@ha/shared';
import { appConfig } from '../config.js';
import { query } from '../db/pool.js';
import {
  getPinElevationTtlSeconds,
  touchPinElevationIfActive,
} from '../lib/pin-elevation.js';

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
    /** Session id from JWT — used for PIN elevation window */
    sessionId?: string;
    /** True when Redis has an active elevation TTL for this session */
    elevated?: boolean;
    /** Seconds left in elevation window (0 when not elevated) */
    elevationTtlSeconds?: number;
    /** True when request was forwarded from the cloud proxy tunnel */
    isTunnelRequest?: boolean;
  }
}

// -- Tunnel auth internal nonce -----------------------------------------------
// Per-process random token used by the tunnel client when injecting requests.
// External HTTP callers cannot know this value, so x-tunnel-user cannot be spoofed.
export const TUNNEL_INTERNAL_NONCE = crypto.randomBytes(32).toString('hex');

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
  // Tunnel-forwarded requests: the tunnel client sets x-tunnel-internal with the
  // per-process nonce and x-tunnel-user with the remote user's identity.
  const tunnelNonce = req.headers['x-tunnel-internal'] as string | undefined;
  const tunnelUserRaw = req.headers['x-tunnel-user'] as string | undefined;
  if (tunnelNonce && tunnelNonce === TUNNEL_INTERNAL_NONCE && tunnelUserRaw) {
    try {
      const tu = JSON.parse(tunnelUserRaw) as {
        id: string;
        email: string;
        display_name: string;
        role: string;
      };
      req.user = {
        id: `tunnel:${tu.id}`,
        username: tu.display_name || tu.email,
        role: (tu.role === 'admin' ? 'admin' : tu.role === 'guest' ? 'guest' : 'member') as UserRole,
      };
      req.isTunnelRequest = true;
      // Tunnel users get elevated by default (the proxy already authenticated them)
      req.elevated = tu.role === 'admin';
      req.elevationTtlSeconds = 0;
      return;
    } catch {
      // Fall through to normal auth
    }
  }

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
    req.sessionId = payload.sid;

    const path = req.url.split('?')[0];
    const skipElevationTouch = req.method === 'GET' && path === '/api/auth/me';
    if (!skipElevationTouch) {
      await touchPinElevationIfActive(payload.sid);
    }
    const ttl = await getPinElevationTtlSeconds(payload.sid);
    req.elevationTtlSeconds = ttl > 0 ? ttl : 0;
    req.elevated = ttl > 0;
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
    if (req.elevated && roles.includes('admin')) {
      return;
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}

/** Requires the current user’s role to include at least one of the given permissions */
export function requirePermission(...permissions: Permission[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (req.elevated) {
      return;
    }
    const granted = ROLE_PERMISSIONS[req.user.role] ?? [];
    const ok = permissions.some((p) => granted.includes(p));
    if (!ok) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
