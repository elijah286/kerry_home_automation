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

  // Version reported by the HOME server (from tunnel handshake), never the proxy's own
  // Railway-deployed version. Registered here so it bypasses the /api/* catch-all and
  // Railway's default edge caching (no-store on the response).
  //
  // The proxy auto-deploys from main via Railway, but the home server is manually updated.
  // Without this endpoint the header would show the proxy's version (== origin/main)
  // instead of what Docker is actually running on the home hub.
  app.get('/api/system/app-version', async (_req, reply) => {
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0');

    const homeVersion = tunnelManager.getHomeVersion();
    if (!homeVersion) {
      return reply.code(503).send({
        error: 'Home tunnel not connected — cannot determine home version.',
        versionLabel: null,
      });
    }

    const clean = homeVersion.replace(/^v/, '');
    const parts = clean.split('.');
    return {
      versionLabel: homeVersion.startsWith('v') ? homeVersion : `v${homeVersion}`,
      major: parseInt(parts[0] ?? '0', 10),
      minor: parseInt(parts[1] ?? '0', 10),
      patch: parseInt(parts[2] ?? '0', 10),
    };
  });
}
