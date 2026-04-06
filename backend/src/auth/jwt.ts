import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { config } from '../config/index.js';

export interface JwtPayload {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member' | 'guest';
  allowed_areas: string[] | null;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

let _app: FastifyInstance | null = null;

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(fjwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiry },
  });
  _app = app;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'unauthorized' });
  }
}

export function signToken(app: FastifyInstance, payload: JwtPayload): string {
  return app.jwt.sign(payload);
}

export function verifyToken(app: FastifyInstance, token: string): JwtPayload {
  return app.jwt.verify<JwtPayload>(token);
}

/**
 * Verify a JWT token without a Fastify request context.
 * Used by the WebSocket server which runs on a separate port.
 */
export function verifyTokenStandalone(token: string): JwtPayload | null {
  if (!_app) return null;
  try {
    return _app.jwt.verify<JwtPayload>(token);
  } catch {
    return null;
  }
}
