// ---------------------------------------------------------------------------
// Xbox integration: SmartGlass REST API
// Each entry = one Xbox console
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { SmartGlassClient } from './smartglass-client.js';
import { mapXboxState } from './mapper.js';

const POLL_INTERVAL_MS = 10_000;

interface ConsoleCtx {
  entryId: string;
  host: string;
  client: SmartGlassClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class XboxIntegration implements Integration {
  readonly id = 'xbox' as const;
  private consoles = new Map<string, ConsoleCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('xbox');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host) continue;
      const client = new SmartGlassClient(entry.config.host, entry.config.live_id);
      const ctx: ConsoleCtx = { entryId: entry.id, host: entry.config.host, client, pollTimer: null };
      this.consoles.set(entry.id, ctx);

      await this.poll(ctx);

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.consoles.size > 0) {
      this.lastConnected = Date.now();
      this.emitHealth('connected');
    }
    logger.info({ consoles: this.consoles.size }, 'Xbox integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.consoles.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.consoles.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'media_player') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.consoles.get(entryId);
    if (!ctx) throw new Error('Xbox not found');

    switch (cmd.action) {
      case 'power_on': await ctx.client.powerOn(); break;
      case 'power_off': await ctx.client.powerOff(); break;
      case 'media_play': await ctx.client.mediaCommand('play'); break;
      case 'media_pause': await ctx.client.mediaCommand('pause'); break;
      case 'media_stop': await ctx.client.mediaCommand('stop'); break;
      case 'set_source': if (cmd.source) await ctx.client.launchApp(cmd.source); break;
      case 'set_volume':
        await ctx.client.setVolume(cmd.volume != null && cmd.volume > 50 ? 'up' : 'down');
        break;
      case 'mute': await ctx.client.setVolume('mute'); break;
    }

    setTimeout(() => void this.poll(ctx).catch(() => {}), 2000);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.consoles.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: ConsoleCtx): Promise<void> {
    const status = await ctx.client.getStatus();
    stateStore.update(mapXboxState(ctx.entryId, ctx.host, status));
    if (status) this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
