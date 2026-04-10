import type { FastifyInstance } from 'fastify';
import { getAnonClient, verifySupabaseToken } from '../auth/supabase.js';
import { mapToTunnelUser } from '../auth/user-mapping.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { email?: string; password?: string };
  }>('/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' });
    }

    const { data, error } = await getAnonClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return reply.status(401).send({ error: error?.message ?? 'login failed' });
    }

    const tunnelUser = await mapToTunnelUser({
      supabaseUid: data.user.id,
      email: data.user.email ?? '',
    });

    if (!tunnelUser) {
      return reply.status(403).send({ error: 'no remote access mapping for this user' });
    }

    return {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: tunnelUser.id,
        email: tunnelUser.email,
        display_name: tunnelUser.display_name,
        role: tunnelUser.role,
        allowed_areas: tunnelUser.allowed_areas,
      },
    };
  });

  app.post<{
    Body: { refresh_token?: string };
  }>('/auth/refresh', async (req, reply) => {
    const { refresh_token } = req.body ?? {};
    if (!refresh_token) {
      return reply.status(400).send({ error: 'refresh_token required' });
    }

    const { data, error } = await getAnonClient().auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      return reply.status(401).send({ error: error?.message ?? 'refresh failed' });
    }

    return {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    };
  });

  app.get('/auth/me', async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'missing authorization header' });
    }

    const verified = await verifySupabaseToken(auth.slice(7));
    if (!verified) {
      return reply.status(401).send({ error: 'invalid or expired token' });
    }

    const tunnelUser = await mapToTunnelUser(verified);
    if (!tunnelUser) {
      return reply.status(403).send({ error: 'no remote access mapping' });
    }

    return {
      user: {
        id: tunnelUser.id,
        email: tunnelUser.email,
        display_name: tunnelUser.display_name,
        role: tunnelUser.role,
        allowed_areas: tunnelUser.allowed_areas,
      },
    };
  });

  app.post('/auth/logout', async (req, reply) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      await getAnonClient().auth.signOut();
    }
    return reply.status(200).send({ ok: true });
  });
}
