// ---------------------------------------------------------------------------
// Screensaver REST routes — serve cached photos + screensaver state
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { registry } from '../integrations/registry.js';
import { ScreensaverIntegration } from '../integrations/screensaver/index.js';

export function registerScreensaverRoutes(app: FastifyInstance): void {
  const getIntegration = (): ScreensaverIntegration | undefined =>
    registry.get('screensaver') as ScreensaverIntegration | undefined;

  // List cached photos metadata
  app.get('/api/screensaver/photos', async (_req, reply) => {
    const integration = getIntegration();
    const cache = integration?.getPhotoCache();
    if (!cache) return reply.code(503).send({ error: 'Screensaver integration not running' });

    return {
      photos: cache.getPhotos().map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
      })),
      lastFetched: cache.getLastFetched(),
    };
  });

  // Serve a single cached photo by ID
  app.get<{ Params: { id: string } }>('/api/screensaver/photos/:id', async (req, reply) => {
    const integration = getIntegration();
    const cache = integration?.getPhotoCache();
    if (!cache) return reply.code(503).send({ error: 'Screensaver integration not running' });

    const photo = cache.getPhotoById(req.params.id);
    if (!photo) return reply.code(404).send({ error: 'Photo not found' });

    const buffer = await cache.getPhotoBuffer(req.params.id);
    if (!buffer) return reply.code(404).send({ error: 'Photo file not found' });

    const ext = photo.filename.split('.').pop() ?? 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
    };

    reply.header('Content-Type', mimeMap[ext] || 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=86400'); // 24h cache
    return reply.send(buffer);
  });

  // Get next photo + effect config for a user (advances the index)
  app.get<{ Params: { userId: string } }>('/api/screensaver/next/:userId', async (req, reply) => {
    const integration = getIntegration();
    if (!integration) return reply.code(503).send({ error: 'Screensaver integration not running' });

    const ctx = integration.getCtx();
    if (!ctx) return reply.code(503).send({ error: 'Screensaver not initialized' });

    const result = integration.advancePhoto(req.params.userId);
    if (!result) return reply.code(404).send({ error: 'No photos available or user not found' });

    return {
      photoUrl: `/api/screensaver/photos/${result.photoId}`,
      index: result.index,
      totalPhotos: ctx.photoCache.getPhotoCount(),
      rotationIntervalSec: ctx.rotationIntervalSec,
      effect: ctx.effect,
    };
  });
}
