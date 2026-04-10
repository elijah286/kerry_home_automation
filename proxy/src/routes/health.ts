import type { FastifyInstance } from 'fastify';
import { tunnelManager } from '../tunnel/manager.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    tunnel: tunnelManager.isConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  }));
}
