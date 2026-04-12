// ---------------------------------------------------------------------------
// REST routes for helper management
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { HelperDefinition } from '@ha/shared';
import * as yamlStore from '../helpers/yaml-store.js';
import { helperEngine } from '../helpers/engine.js';
import { requireRole } from './auth.js';
import { logger } from '../logger.js';

export function registerHelperRoutes(app: FastifyInstance): void {
  // List all helper definitions
  app.get('/api/helpers', async () => {
    return yamlStore.loadHelpers();
  });

  // Create a new helper
  app.post<{ Body: HelperDefinition }>('/api/helpers', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const def = req.body;
    if (!def.id || !def.type || !def.name) {
      return reply.code(400).send({ error: 'id, type, and name are required' });
    }
    try {
      await yamlStore.addHelper(def);
      await helperEngine.reload();
      return reply.code(201).send(def);
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // Update an existing helper
  app.put<{ Params: { id: string }; Body: Partial<HelperDefinition> }>(
    '/api/helpers/:id',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      try {
        const updated = await yamlStore.updateHelper(req.params.id, req.body);
        await helperEngine.reload();
        return updated;
      } catch (err: any) {
        return reply.code(404).send({ error: err.message });
      }
    },
  );

  // Delete a helper
  app.delete<{ Params: { id: string } }>(
    '/api/helpers/:id',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      try {
        await yamlStore.removeHelper(req.params.id);
        await helperEngine.reload();
        return { ok: true };
      } catch (err: any) {
        return reply.code(404).send({ error: err.message });
      }
    },
  );

  // Reload all helpers from YAML
  app.post('/api/helpers/reload', { preHandler: [requireRole('admin')] }, async () => {
    await helperEngine.reload();
    const defs = await yamlStore.loadHelpers();
    logger.info({ count: defs.length }, 'Helpers reloaded');
    return { ok: true, count: defs.length };
  });

  // Get raw YAML
  app.get('/api/helpers/yaml', async (_req, reply) => {
    const content = await yamlStore.getRawYaml();
    reply.header('Content-Type', 'text/yaml');
    return content;
  });

  // Save raw YAML and reload
  app.put('/api/helpers/yaml', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const defs = await yamlStore.saveRawYaml(body);
      await helperEngine.reload();
      return { ok: true, count: defs.length };
    } catch (err: any) {
      return reply.code(400).send({ error: `Invalid YAML: ${err.message}` });
    }
  });
}
