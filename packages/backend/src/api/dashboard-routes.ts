// ---------------------------------------------------------------------------
// REST routes for dashboard documents.
//
// - GET    /api/dashboards          → list all dashboards (visible to session)
// - GET    /api/dashboards/:path    → load one
// - POST   /api/dashboards          → create (admin only for system-owned)
// - PUT    /api/dashboards/:path    → update (admin; owner if user-owned)
// - DELETE /api/dashboards/:path    → delete
//
// Visibility filtering relies on the session's role/userId. The route sends
// the full document to admins and filters the list for other roles. A full
// ACL implementation (card-level hiding based on PermissionQuery) happens on
// the client side during render — the backend just keeps people from seeing
// dashboards they shouldn't see in the listing.
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import {
  createDashboardRequestSchema,
  updateDashboardRequestSchema,
  type DashboardDoc,
  type PermissionQuery,
} from '@ha/shared';
import * as store from '../dashboards/yaml-store.js';
import { authenticate, requireRole } from './auth.js';
import { logger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@ha/shared';

function visibleTo(doc: DashboardDoc, user: { role: UserRole; id: string } | undefined): boolean {
  const v: PermissionQuery | undefined = doc.visibility;
  if (!v) return true;
  if (user?.role === 'admin') return true;
  if (v.roles && user?.role && !v.roles.includes(user.role)) return false;
  if (v.userIds && user?.id && !v.userIds.includes(user.id)) return false;
  // `permissions` / `requiresElevation` checks are done client-side where the
  // session has the full permission bundle resolved.
  return true;
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/api/dashboards', { preHandler: [authenticate] }, async (req) => {
    const docs = await store.loadAll();
    return docs.filter((d) => visibleTo(d, req.user));
  });

  app.get<{ Params: { path: string } }>(
    '/api/dashboards/:path',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const doc = await store.load(req.params.path);
      if (!doc) return reply.code(404).send({ error: 'Dashboard not found' });
      if (!visibleTo(doc, req.user)) return reply.code(403).send({ error: 'Forbidden' });
      return doc;
    },
  );

  app.post(
    '/api/dashboards',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const parsed = createDashboardRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
      const body = parsed.data;

      const existing = await store.load(body.path);
      if (existing) return reply.code(409).send({ error: `Dashboard with path '${body.path}' already exists` });

      const now = new Date().toISOString();
      const doc: DashboardDoc = {
        id: randomUUID(),
        path: body.path,
        title: body.title,
        icon: body.icon,
        owner: req.user?.id
          ? { kind: 'user', userId: req.user.id }
          : { kind: 'system' },
        createdBy: body.createdBy ?? 'user',
        visibility: body.visibility,
        layout: body.layout,
        sections: body.sections ?? [],
        cards: body.cards ?? [],
        pinned: false,
        defaultForAreaId: body.defaultForAreaId,
        tags: body.tags,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await store.save(doc);
      return reply.code(201).send(saved);
    },
  );

  app.put<{ Params: { path: string } }>(
    '/api/dashboards/:path',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const parsed = updateDashboardRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
      const body = parsed.data;

      const current = await store.load(req.params.path);
      if (!current) return reply.code(404).send({ error: 'Dashboard not found' });

      if (body.expectedRevision !== undefined && body.expectedRevision !== current.revision) {
        return reply.code(409).send({
          error: 'Dashboard has been modified elsewhere',
          currentRevision: current.revision,
        });
      }

      const next: DashboardDoc = {
        ...current,
        title:            body.title            ?? current.title,
        icon:             body.icon             ?? current.icon,
        visibility:       body.visibility       ?? current.visibility,
        layout:           body.layout           ?? current.layout,
        sections:         body.sections         ?? current.sections,
        cards:            body.cards            ?? current.cards,
        pinned:           body.pinned           ?? current.pinned,
        defaultForAreaId: body.defaultForAreaId ?? current.defaultForAreaId,
        tags:             body.tags             ?? current.tags,
        revision:         current.revision + 1,
        updatedAt:        new Date().toISOString(),
      };
      const saved = await store.save(next);
      logger.info({ path: saved.path, revision: saved.revision }, 'Dashboard updated');
      return saved;
    },
  );

  app.delete<{ Params: { path: string } }>(
    '/api/dashboards/:path',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      await store.remove(req.params.path);
      return reply.code(204).send();
    },
  );
}
