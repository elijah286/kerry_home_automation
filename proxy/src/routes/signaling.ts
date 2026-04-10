import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TunnelMessage, RTCSignalPayload } from '@home-automation/shared';
import { requireRemoteAuth } from '../auth/middleware.js';
import { tunnelManager } from '../tunnel/manager.js';
import { logger } from '../logger.js';

const SIGNALING_TIMEOUT_MS = 15_000;

type PendingSignal = {
  resolve: (payload: RTCSignalPayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingSignals = new Map<string, PendingSignal>();

tunnelManager.onMessage((msg: TunnelMessage) => {
  if (msg.type !== 'rtc_signal' || msg.direction !== 'to_remote') return;
  const pending = pendingSignals.get(msg.sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSignals.delete(msg.sessionId);
    pending.resolve(msg.payload);
  }
});

export async function registerSignalingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { src?: string; sdp?: string };
  }>('/api/webrtc/offer', {
    preHandler: [requireRemoteAuth],
  }, async (req, reply) => {
    const { src, sdp } = req.body ?? {};
    if (!src || !sdp) {
      return reply.status(400).send({ error: 'src and sdp required' });
    }

    if (!tunnelManager.isConnected()) {
      return reply.status(503).send({ error: 'home instance not connected' });
    }

    const sessionId = randomUUID();

    try {
      const answer = await new Promise<RTCSignalPayload>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingSignals.delete(sessionId);
          reject(new Error('signaling timeout'));
        }, SIGNALING_TIMEOUT_MS);

        pendingSignals.set(sessionId, { resolve, reject, timer });

        tunnelManager.sendToTunnel({
          type: 'rtc_signal',
          sessionId,
          direction: 'to_home',
          payload: { type: 'offer', src, sdp },
        });
      });

      return { sessionId, sdp: answer.sdp };
    } catch (err) {
      logger.error({ err, src }, 'WebRTC signaling error');
      return reply.status(502).send({ error: 'signaling failed' });
    }
  });

  app.post<{
    Body: { sessionId?: string; candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
  }>('/api/webrtc/candidate', {
    preHandler: [requireRemoteAuth],
  }, async (req, reply) => {
    const { sessionId, candidate, sdpMid, sdpMLineIndex } = req.body ?? {};
    if (!sessionId || !candidate) {
      return reply.status(400).send({ error: 'sessionId and candidate required' });
    }

    if (!tunnelManager.isConnected()) {
      return reply.status(503).send({ error: 'home instance not connected' });
    }

    tunnelManager.sendToTunnel({
      type: 'rtc_signal',
      sessionId,
      direction: 'to_home',
      payload: {
        type: 'candidate',
        candidate,
        sdpMid: sdpMid ?? null,
        sdpMLineIndex: sdpMLineIndex ?? null,
      },
    });

    return { ok: true };
  });
}
