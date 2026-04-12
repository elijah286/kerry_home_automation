// ---------------------------------------------------------------------------
// Samsung Smart TV integration: Tizen WebSocket remote
// Each entry = one Samsung TV
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { SamsungClient } from './samsung-client.js';
import { mapSamsungState } from './mapper.js';

const POLL_INTERVAL_MS = 10_000;

const SOURCE_KEY_MAP: Record<string, string> = {
  'HDMI 1': 'KEY_HDMI1',
  'HDMI 2': 'KEY_HDMI2',
  'HDMI 3': 'KEY_HDMI3',
  'HDMI 4': 'KEY_HDMI4',
  'TV': 'KEY_SOURCE',
};

interface TvCtx {
  entryId: string;
  host: string;
  client: SamsungClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class SamsungIntegration implements Integration {
  readonly id = 'samsung' as const;
  private tvs = new Map<string, TvCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('samsung');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host) continue;
      const client = new SamsungClient(entry.config.host, entry.config.token);
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
    logger.info({ tvs: this.tvs.size }, 'Samsung integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.tvs.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      ctx.client.disconnect();
    }
    this.tvs.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'media_player') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.tvs.get(entryId);
    if (!ctx) throw new Error('Samsung TV not found');

    // Lazy WebSocket connect for commands
    switch (cmd.action) {
      case 'power_on':
      case 'power_off':
        await ctx.client.sendKey('KEY_POWER');
        break;
      case 'set_volume':
        if (cmd.volume != null) {
          // No absolute volume API — send up or down key
          await ctx.client.sendKey(cmd.volume > 50 ? 'KEY_VOLUP' : 'KEY_VOLDOWN');
        }
        break;
      case 'mute':
        await ctx.client.sendKey('KEY_MUTE');
        break;
      case 'set_source':
        if (cmd.source) {
          const key = SOURCE_KEY_MAP[cmd.source] ?? 'KEY_SOURCE';
          await ctx.client.sendKey(key);
        }
        break;
      case 'media_play':
        await ctx.client.sendKey('KEY_PLAY');
        break;
      case 'media_pause':
        await ctx.client.sendKey('KEY_PAUSE');
        break;
      case 'media_stop':
        await ctx.client.sendKey('KEY_STOP');
        break;
    }

    // Samsung closes idle connections — disconnect after command
    ctx.client.disconnect();

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
    const powerOn = await ctx.client.getPowerState();
    const deviceInfo = powerOn ? await ctx.client.getDeviceInfo() : null;
    stateStore.update(mapSamsungState(ctx.entryId, ctx.host, deviceInfo, powerOn));
    if (powerOn) this.lastConnected = Date.now();

    // Persist token if TV returned one during pairing
    const token = ctx.client.getToken();
    if (token) {
      const entries = await entryStore.getEntries('samsung');
      const entry = entries.find((e) => e.id === ctx.entryId);
      if (entry && entry.config.token !== token) {
        await entryStore.saveEntry({ ...entry, config: { ...entry.config, token } });
      }
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
