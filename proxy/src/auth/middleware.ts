import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TunnelUser } from '@home-automation/shared';
import { verifySupabaseToken } from './supabase.js';
import { mapToTunnelUser } from './user-mapping.js';

declare module 'fastify' {
  interface FastifyRequest {
    tunnelUser?: TunnelUser;
  }
}

/**
 * Fastify preHandler that validates the Supabase Bearer token
 * and attaches the resolved TunnelUser to the request.
 */
export async function requireRemoteAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Accept token from Authorization header or ?token= query parameter.
  // Query-string fallback is needed for <img src>, <video src>, and
  // new WebSocket() calls that cannot attach custom headers.
  let token: string | undefined;
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    try {
      const url = new URL(request.url, 'http://localhost');
      token = url.searchParams.get('token') ?? undefined;
    } catch { /* ignore malformed URLs */ }
  }

  if (!token) {
    reply.status(401).send({ error: 'missing authorization' });
    return;
  }
  const verified = await verifySupabaseToken(token);
  if (!verified) {
    reply.status(401).send({ error: 'invalid or expired token' });
    return;
  }

  const tunnelUser = await mapToTunnelUser(verified);
  if (!tunnelUser) {
    reply.status(403).send({ error: 'no remote access mapping for this user' });
    return;
  }

  request.tunnelUser = tunnelUser;
}
