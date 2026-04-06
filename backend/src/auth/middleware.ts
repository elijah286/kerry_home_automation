import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { JwtPayload } from './jwt.js';

export function requireRole(
  ...roles: JwtPayload['role'][]
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload;
    if (!user || !roles.includes(user.role)) {
      reply.status(403).send({ error: 'forbidden' });
    }
  };
}

export function filterByUserAreas<T extends { area_id?: string | null }>(
  items: T[],
  allowedAreas: string[] | null,
): T[] {
  if (allowedAreas === null) return items;
  const set = new Set(allowedAreas);
  return items.filter((item) => item.area_id != null && set.has(item.area_id));
}

export function canAccessArea(
  user: JwtPayload,
  areaId: string | null | undefined,
): boolean {
  if (user.role === 'admin' || user.allowed_areas === null) return true;
  if (areaId == null) return false;
  return user.allowed_areas.includes(areaId);
}
