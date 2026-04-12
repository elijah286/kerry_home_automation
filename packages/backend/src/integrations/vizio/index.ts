// ---------------------------------------------------------------------------
// Vizio integration: SmartCast local HTTPS API
// Each entry = one Vizio TV
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { SmartCastClient } from './smartcast-client.js';
import { mapVizioState } from './mapper.js';

const POLL_INTERVAL_MS = 10_000;

interface TvCtx {
  entryId: string;
  host: string;
  client: SmartCastClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class VizioIntegration implements Integration {
  readonly id = 'vizio' as const;
  private tvs = new Map<string, TvCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('vizio');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host) continue;
      const client = new SmartCastClient(entry.config.host, entry.config.auth_token);
      const ctx: TvCtx = { entryId: entry.id, host: entry.config.host, client, pollTimer: null };
      this.tvs.set(entry.id, ctx);

      await this.poll(ctx);

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.tvs.size > 0) {
      this.lastConnected = Date.now();
      this.emitHealth('connected');
    }
    logger.info({ tvs: this.tvs.size }, 'Vizio integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.tvs.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.tvs.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'media_player') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.tvs.get(entryId);
    if (!ctx) throw new Error('Vizio TV not found');

    switch (cmd.action) {
      case 'power_on': await ctx.client.setPower(true); break;
      case 'power_off': await ctx.client.setPower(false); break;
      case 'set_volume':
        if (cmd.volume != null) await ctx.client.setVolume(cmd.volume);
        break;
      case 'mute': await ctx.client.toggleMute(); break;
      case 'set_source':
        if (cmd.source) await ctx.client.setInput(cmd.source);
        break;
    }

    setTimeout(() => void this.poll(ctx).catch(() => {}), 2000);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.tvs.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: TvCtx): Promise<void> {
    try {
      const [power, vol, input, inputList] = await Promise.all([
        ctx.client.getPowerState(),
        ctx.client.getVolume(),
        ctx.client.getCurrentInput(),
        ctx.client.getInputList(),
      ]);
      stateStore.update(mapVizioState(ctx.entryId, ctx.host, power, vol.value, input, inputList));
      this.lastConnected = Date.now();
    } catch (err) {
      this.lastError = String(err);
      // TV is likely off or unreachable — mark as unavailable
      stateStore.update(
        mapVizioState(ctx.entryId, ctx.host, 0, 0, '', []),
      );
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
