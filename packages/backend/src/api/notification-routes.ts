// ---------------------------------------------------------------------------
// REST routes for notifications.
//
// - GET    /api/notifications            → list notifications visible to the user
// - POST   /api/notifications            → publish (admin only — integrations use
//                                          the service directly in-process)
// - POST   /api/notifications/:id/ack    → acknowledge (advances lifecycle)
// - POST   /api/notifications/:id/seen   → mark seen (soft state bump)
// - DELETE /api/notifications/:id        → archive/remove (admin)
//
// Audience filtering is performed here so clients never learn about
// notifications they aren't allowed to see.
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import {
  createNotificationRequestSchema,
  type Notification,
  type PermissionQuery,
  type UserRole,
} from '@ha/shared';
import { notificationService } from '../notifications/service.js';
import { authenticate, requireRole } from './auth.js';

function isVisible(
  n: Notification,
  user: { id: string; role: UserRole } | undefined,
): boolean {
  const v: PermissionQuery | undefined = n.audience;
  if (!v) return true;
  if (user?.role === 'admin') return true;
  if (v.roles && user?.role && !v.roles.includes(user.role)) return false;
  if (v.userIds && user?.id && !v.userIds.includes(user.id)) return false;
  return true;
}

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.get('/api/notifications', { preHandler: [authenticate] }, async (req) => {
    const all = await notificationService.list();
    return all.filter((n) => isVisible(n, req.user));
  });

  app.post('/api/notifications', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parsed = createNotificationRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
    const { notification } = await notificationService.publish(parsed.data);
    return reply.code(201).send(notification);
  });

  app.post<{ Params: { id: string } }>(
    '/api/notifications/:id/ack',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'Authentication required' });
      const existing = await notificationService.get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Notification not found' });
      if (!isVisible(existing, req.user)) return reply.code(403).send({ error: 'Forbidden' });
      const n = await notificationService.acknowledge(req.params.id, req.user.id);
      return n;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/notifications/:id/seen',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const existing = await notificationService.get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Notification not found' });
      if (!isVisible(existing, req.user)) return reply.code(403).send({ error: 'Forbidden' });
      const n = await notificationService.markSeen(req.params.id);
      return n;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/notifications/:id',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const removed = await notificationService.remove(req.params.id);
      if (!removed) return reply.code(404).send({ error: 'Notification not found' });
      return reply.code(204).send();
    },
  );
}
