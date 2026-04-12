// ---------------------------------------------------------------------------
// Spotify integration: playback control via Spotify Web API
// One entry = one Spotify account
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { SpotifyClient } from './spotify-client.js';
import { mapPlaybackState, mapIdleState } from './mapper.js';

const POLL_INTERVAL_MS = 10_000;
const COMMAND_RE_POLL_DELAY = 1000;

interface SpotifyCtx {
  entryId: string;
  client: SpotifyClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class SpotifyIntegration implements Integration {
  readonly id = 'spotify' as const;
  private ctx: SpotifyCtx | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('spotify');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    // Spotify supports only one entry (one account)
    const entry = entries[0];
    if (!entry.enabled || !entry.config.client_id || !entry.config.client_secret || !entry.config.refresh_token) return;

    const client = new SpotifyClient(
      entry.config.client_id as string,
      entry.config.client_secret as string,
      entry.config.refresh_token as string,
    );

    const ctx: SpotifyCtx = { entryId: entry.id, client, pollTimer: null };
    this.ctx = ctx;

    try {
      await client.refreshAccessToken();
      await this.poll(ctx);
      this.lastConnected = Date.now();
      this.emitHealth('connected');
    } catch (err) {
      logger.error({ err, entryId: entry.id }, 'Spotify: initial poll failed');
      this.lastError = String(err);
    }

    ctx.pollTimer = setInterval(() => {
      if (this.stopping) return;
      this.poll(ctx).catch((err) => {
        this.lastError = String(err);
      });
    }, POLL_INTERVAL_MS);

    logger.info('Spotify integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.ctx?.pollTimer) clearInterval(this.ctx.pollTimer);
    this.ctx = null;
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'music_player') return;
    const ctx = this.ctx;
    if (!ctx) throw new Error('Spotify not connected');

    switch (cmd.action) {
      case 'play':
        await ctx.client.play();
        break;
      case 'pause':
        await ctx.client.pause();
        break;
      case 'next':
        await ctx.client.next();
        break;
      case 'previous':
        await ctx.client.previous();
        break;
      case 'set_volume':
        if (cmd.volume != null) await ctx.client.setVolume(cmd.volume);
        break;
      case 'set_shuffle':
        if (cmd.shuffle != null) await ctx.client.setShuffle(cmd.shuffle);
        break;
      case 'set_repeat':
        if (cmd.repeat) await ctx.client.setRepeat(cmd.repeat);
        break;
      case 'transfer':
        if (cmd.deviceId_target) await ctx.client.transferPlayback(cmd.deviceId_target);
        break;
    }

    // Re-poll after command to reflect new state
    setTimeout(() => void this.poll(ctx).catch(() => {}), COMMAND_RE_POLL_DELAY);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.ctx ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: SpotifyCtx): Promise<void> {
    const playback = await ctx.client.getCurrentPlayback();

    if (playback) {
      stateStore.update(mapPlaybackState(ctx.entryId, playback));
    } else {
      stateStore.update(mapIdleState(ctx.entryId));
    }

    this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
