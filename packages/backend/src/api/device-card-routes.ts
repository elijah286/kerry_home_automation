// ---------------------------------------------------------------------------
// Per-user device card override routes.
//
//   GET    /api/devices/:id/card         → resolve override for the session user
//   PUT    /api/devices/:id/card         → set override (full CardDescriptor)
//   DELETE /api/devices/:id/card         → clear override (fall back to default)
//
// Overrides are per-user (keyed on session.userId × deviceId). They store a
// full `CardDescriptor` — validated by Zod on write — so a user can swap
// the default card *and* tune its config (thresholds, visible sections,
// hours of history, etc.) in one place.
//
// Resolution on the frontend is: override → type:device_class map → type
// map → generic fallback. This route only serves the override layer.
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { cardDescriptorSchema, type CardDescriptor } from '@ha/shared';
import { authenticate } from './auth.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

export function registerDeviceCardRoutes(app: FastifyInstance): void {
  // --- Read -----------------------------------------------------------------

  app.get<{ Params: { id: string } }>(
    '/api/devices/:id/card',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthenticated' });

      const { rows } = await query<{ card_descriptor: CardDescriptor }>(
        'SELECT card_descriptor FROM device_card_overrides WHERE user_id = $1 AND device_id = $2',
        [userId, req.params.id],
      );
      return { override: rows[0]?.card_descriptor ?? null };
    },
  );

  // --- Write ----------------------------------------------------------------

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/api/devices/:id/card',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthenticated' });

      const parsed = cardDescriptorSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.format() });
      }

      await query(
        `INSERT INTO device_card_overrides (user_id, device_id, card_descriptor, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           card_descriptor = EXCLUDED.card_descriptor,
           updated_at = NOW()`,
        [userId, req.params.id, JSON.stringify(parsed.data)],
      );
      logger.debug(
        { userId, deviceId: req.params.id, cardType: parsed.data.type },
        'Device card override saved',
      );
      return { ok: true, override: parsed.data };
    },
  );

  // --- Delete ---------------------------------------------------------------

  app.delete<{ Params: { id: string } }>(
    '/api/devices/:id/card',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthenticated' });

      await query(
        'DELETE FROM device_card_overrides WHERE user_id = $1 AND device_id = $2',
        [userId, req.params.id],
      );
      return { ok: true };
    },
  );

  // --- Device class (global, admin-scoped) ---------------------------------
  //
  // Separate from device_settings PUT to keep concerns clean — the LLM
  // inference route also writes here with `source: 'llm'`, and having a
  // dedicated endpoint with its own shape makes that integration cleaner.

  app.put<{
    Params: { id: string };
    Body: { device_class: string | null; source?: 'admin' | 'llm' };
  }>(
    '/api/devices/:id/device-class',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (req.user?.role !== 'admin') {
        return reply.code(403).send({ error: 'Admin role required' });
      }
      const { device_class } = req.body;
      const source = req.body.source ?? 'admin';

      await query(
        `INSERT INTO device_settings (device_id, device_class, device_class_source, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           device_class = EXCLUDED.device_class,
           device_class_source = EXCLUDED.device_class_source,
           updated_at = NOW()`,
        [req.params.id, device_class, device_class ? source : null],
      );

      // Mirror into in-memory state so WebSocket clients pick it up live.
      const { stateStore } = await import('../state/store.js');
      const device = stateStore.get(req.params.id);
      if (device) {
        stateStore.update({
          ...device,
          device_class: device_class ?? undefined,
          device_class_source: device_class ? source : undefined,
        });
      }

      return { ok: true, device_class, source: device_class ? source : null };
    },
  );
}
