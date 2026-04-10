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
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'missing authorization header' });
    return;
  }

  const token = auth.slice(7);
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
