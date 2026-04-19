import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TunnelUser } from '@home-automation/shared';
import { verifySupabaseToken } from './supabase.js';
import { mapToTunnelUser } from './user-mapping.js';

declare module 'fastify' {
  interface FastifyRequest {
    tunnelUser?: TunnelUser;
  }
}

/** Name of the session cookie that holds a verified Supabase access token. */
const SESSION_COOKIE = 'ha_remote_session';
/** How long the session cookie lives after a fresh Bearer/query-token verification.
 *  Short enough to limit blast radius if a cookie is stolen, long enough that a
 *  30-minute camera stream doesn't have sub-requests 401 mid-playback. */
const SESSION_COOKIE_MAX_AGE_S = 60 * 30;

/**
 * Fastify preHandler that validates the Supabase token in three places, in order:
 *   1. `Authorization: Bearer <token>` (standard API clients)
 *   2. `?token=...` query string (for `<img>`, `<video src>`, `new WebSocket()`)
 *   3. `ha_remote_session` cookie (re-issued on every successful 1+2 verify)
 *
 * Cookie fallback is the reason HLS works over the proxy. Safari's native
 * HLS player puts `?token=` on the master playlist URL but then resolves
 * sub-playlists and TS segments relative to it — those resolved URLs drop
 * the query string, and `<video src>` can't inject headers. Without the
 * cookie the first sub-playlist request 401's and the player gives up.
 *
 * When a Bearer or query-token verifies successfully, we also mint a cookie
 * so follow-up sub-requests from the same origin carry an auth credential
 * the browser already handles automatically.
 */
export async function requireRemoteAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let token: string | undefined;
  let tokenSource: 'header' | 'query' | 'cookie' | null = null;

  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
    tokenSource = 'header';
  }

  if (!token) {
    try {
      const url = new URL(request.url, 'http://localhost');
      const q = url.searchParams.get('token');
      if (q) { token = q; tokenSource = 'query'; }
    } catch { /* ignore malformed URLs */ }
  }

  if (!token) {
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      // Minimal cookie parse — no library, no allocations we don't need.
      for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name === SESSION_COOKIE) {
          token = decodeURIComponent(part.slice(eq + 1).trim());
          tokenSource = 'cookie';
          break;
        }
      }
    }
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

  // Refresh the session cookie on every successful header/query auth so
  // follow-up sub-requests (HLS segments, images, etc.) coming from the
  // same origin authenticate automatically. Cookie-only requests don't
  // re-issue — the cookie already came from a prior verified auth and
  // we don't want to extend its lifetime indefinitely.
  if (tokenSource === 'header' || tokenSource === 'query') {
    reply.header(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`,
    );
  }
}
