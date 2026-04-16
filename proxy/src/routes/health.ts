import type { FastifyInstance } from 'fastify';
import { tunnelManager } from '../tunnel/manager.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  const payload = () => ({
    status: 'ok',
    tunnel: tunnelManager.isConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });

  app.get('/health', async () => payload());

  // The frontend's UpdateInProgressOverlay polls /api/health (no auth header).
  // Register it here so it bypasses the authenticated /api/* catch-all proxy route.
  app.get('/api/health', async () => payload());
}
