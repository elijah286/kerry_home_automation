// ---------------------------------------------------------------------------
// Sony Bravia TV integration: HTTP polling per TV
// Each integration entry = one TV
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { CircuitBreaker } from '../../connection/circuit-breaker.js';
import {
  getSystemInfo,
  getPowerStatus,
  getVolumeInfo,
  getExternalInputs,
  getPlayingContent,
  setPowerStatus,
  setVolume,
  setMute,
  setPlayContent,
} from './bravia-api.js';
import { mapState } from './mapper.js';
import type { BraviaSnapshot } from './mapper.js';
import * as entryStore from '../../db/integration-entry-store.js';

interface TvCtx {
  entryId: string;
  host: string;
  psk: string;
  model: string;
  pollTimer: ReturnType<typeof setInterval> | null;
  breaker: CircuitBreaker;
}

export class SonyIntegration implements Integration {
  readonly id = 'sony' as const;
  private tvs = new Map<string, TvCtx>();
  private stopping = false;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('sony');
    if (entries.length === 0) {
      logger.warn('No Sony entries configured');
      return;
    }

    this.stopping = false;
    const results = await Promise.allSettled(
      entries.filter((e) => e.enabled).map((entry) => this.connectTv(entry.id, entry.config.host, entry.config.psk)),
    );

    const anyOk = results.some((r) => r.status === 'fulfilled');
    if (!anyOk && entries.length > 0) {
      throw new Error('All Sony TVs failed to connect');
    }
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

    const device = stateStore.get(cmd.deviceId);
    if (!device || device.type !== 'media_player') {
      throw new Error(`Media player not found: ${cmd.deviceId}`);
    }

    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.tvs.get(entryId);
    if (!ctx) throw new Error(`Sony TV context not found for entry ${entryId}`);

    const { host, psk } = ctx;

    // Optimistic update: apply expected state immediately so the UI doesn't
    // snap back to the old value while waiting for the next poll cycle.
    const optimistic = { ...device, lastUpdated: Date.now() };

    switch (cmd.action) {
      case 'power_on':
        await setPowerStatus(host, psk, true);
        optimistic.power = 'on';
        break;
      case 'power_off':
        await setPowerStatus(host, psk, false);
        optimistic.power = 'standby';
        break;
      case 'set_volume': {
        const vol = Math.round(((cmd.volume ?? 0) / 100) * 100);
        await setVolume(host, psk, vol);
        optimistic.volume = cmd.volume ?? 0;
        break;
      }
      case 'mute':
        await setMute(host, psk, true);
        optimistic.muted = true;
        break;
      case 'unmute':
        await setMute(host, psk, false);
        optimistic.muted = false;
        break;
      case 'set_source':
        if (cmd.source) {
          await setPlayContent(host, psk, cmd.source);
          optimistic.source = cmd.source;
        }
        break;
      // media_play, media_pause, media_stop — Sony IRCC remote commands could
      // be added later; for now these are no-ops since the Bravia REST API
      // doesn't expose a direct play/pause endpoint for all content types.
    }

    stateStore.update(optimistic);
  }

  getHealth(): IntegrationHealth {
    if (this.tvs.size === 0) {
      return { state: 'disconnected', lastConnected: null, lastError: null, failureCount: 0 };
    }
    const anyHealthy = [...this.tvs.values()].some((r) => r.breaker.currentState === 'closed');
    return {
      state: anyHealthy ? 'connected' : 'reconnecting',
      lastConnected: null,
      lastError: null,
      failureCount: 0,
    };
  }

  private async connectTv(entryId: string, host: string, psk: string): Promise<void> {
    if (!host) throw new Error('Sony entry missing host');
    if (!psk) throw new Error('Sony entry missing PSK');

    const info = await getSystemInfo(host, psk);
    if (!info) throw new Error(`Sony TV at ${host} not reachable`);

    const ctx: TvCtx = {
      entryId,
      host,
      psk,
      model: info.model,
      pollTimer: null,
      breaker: new CircuitBreaker(5, 30_000),
    };
    this.tvs.set(entryId, ctx);

    logger.info({ host, model: info.model, entryId }, 'Sony Bravia TV connected');

    await this.pollTv(ctx);

    ctx.pollTimer = setInterval(() => {
      if (this.stopping) return;
      if (ctx.breaker.isOpen) return;
      this.pollTv(ctx).catch((err) => {
        logger.error({ err, host }, 'Sony poll error');
        ctx.breaker.recordFailure();
      });
    }, appConfig.sony.pollIntervalMs);
  }

  private async pollTv(ctx: TvCtx): Promise<void> {
    const power = await getPowerStatus(ctx.host, ctx.psk);
    if (!power) {
      ctx.breaker.recordFailure();
      return;
    }
    ctx.breaker.recordSuccess();

    const snapshot: BraviaSnapshot = {
      power,
      volume: await getVolumeInfo(ctx.host, ctx.psk),
      inputs: await getExternalInputs(ctx.host, ctx.psk),
      playing: power === 'active' ? await getPlayingContent(ctx.host, ctx.psk) : null,
    };

    const state = mapState(ctx.host, ctx.model, ctx.entryId, snapshot);
    stateStore.update(state);
  }
}
