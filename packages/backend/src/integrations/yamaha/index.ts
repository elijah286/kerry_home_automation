// ---------------------------------------------------------------------------
// Yamaha MusicCast integration: HTTP polling per receiver
// Each integration entry = one receiver
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { CircuitBreaker } from '../../connection/circuit-breaker.js';
import { getDeviceInfo, getZones, getStatus, musicCastCommand } from './musiccast.js';
import { mapStatus } from './mapper.js';
import * as entryStore from '../../db/integration-entry-store.js';

interface ReceiverCtx {
  entryId: string;
  host: string;
  model: string;
  zones: string[];
  pollTimer: ReturnType<typeof setInterval> | null;
  breaker: CircuitBreaker;
}

export class YamahaIntegration implements Integration {
  readonly id = 'yamaha' as const;
  private receivers = new Map<string, ReceiverCtx>();
  private stopping = false;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('yamaha');
    if (entries.length === 0) {
      logger.warn('No Yamaha entries configured');
      return;
    }

    this.stopping = false;
    const results = await Promise.allSettled(
      entries.filter((e) => e.enabled).map((entry) => this.connectReceiver(entry.id, entry.config.host)),
    );

    const anyOk = results.some((r) => r.status === 'fulfilled');
    if (!anyOk && entries.length > 0) {
      throw new Error('All Yamaha receivers failed to connect');
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.receivers.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.receivers.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'media_player') return;

    const device = stateStore.get(cmd.deviceId);
    if (!device || device.type !== 'media_player') {
      throw new Error(`Media player not found: ${cmd.deviceId}`);
    }

    const { host, zone } = device;

    switch (cmd.action) {
      case 'power_on':
        await musicCastCommand(host, zone, 'setPower?power=on');
        break;
      case 'power_off':
        await musicCastCommand(host, zone, 'setPower?power=standby');
        break;
      case 'set_volume': {
        const vol = Math.round((cmd.volume ?? 0) * 1.61); // 0-100 → 0-161
        await musicCastCommand(host, zone, `setVolume?volume=${vol}`);
        break;
      }
      case 'mute':
        await musicCastCommand(host, zone, 'setMute?enable=true');
        break;
      case 'unmute':
        await musicCastCommand(host, zone, 'setMute?enable=false');
        break;
      case 'set_source':
        if (cmd.source) await musicCastCommand(host, zone, `setInput?input=${encodeURIComponent(cmd.source)}`);
        break;
      case 'set_sound_program':
        if (cmd.soundProgram) await musicCastCommand(host, zone, `setSoundProgram?program=${encodeURIComponent(cmd.soundProgram)}`);
        break;
      case 'media_play':
        await musicCastCommand(host, zone, 'setPlayback?playback=play');
        break;
      case 'media_pause':
        await musicCastCommand(host, zone, 'setPlayback?playback=pause');
        break;
      case 'media_stop':
        await musicCastCommand(host, zone, 'setPlayback?playback=stop');
        break;
    }
  }

  getHealth(): IntegrationHealth {
    if (this.receivers.size === 0) {
      return { state: 'disconnected', lastConnected: null, lastError: null, failureCount: 0 };
    }
    const anyHealthy = [...this.receivers.values()].some((r) => r.breaker.currentState === 'closed');
    return {
      state: anyHealthy ? 'connected' : 'reconnecting',
      lastConnected: null,
      lastError: null,
      failureCount: 0,
    };
  }

  private async connectReceiver(entryId: string, host: string): Promise<void> {
    if (!host) throw new Error('Yamaha entry missing host');

    const info = await getDeviceInfo(host);
    if (!info) throw new Error(`Yamaha receiver at ${host} not reachable`);

    const zones = await getZones(host);
    const ctx: ReceiverCtx = {
      entryId,
      host,
      model: info.model,
      zones,
      pollTimer: null,
      breaker: new CircuitBreaker(5, 30_000),
    };
    this.receivers.set(entryId, ctx);

    logger.info({ host, model: info.model, zones, entryId }, 'Yamaha receiver connected');

    // Initial poll
    await this.pollReceiver(ctx);

    // Start polling
    ctx.pollTimer = setInterval(() => {
      if (this.stopping) return;
      if (ctx.breaker.isOpen) return;
      this.pollReceiver(ctx).catch((err) => {
        logger.error({ err, host }, 'Yamaha poll error');
        ctx.breaker.recordFailure();
      });
    }, appConfig.yamaha.pollIntervalMs);
  }

  private async pollReceiver(ctx: ReceiverCtx): Promise<void> {
    for (const zone of ctx.zones) {
      const status = await getStatus(ctx.host, zone);
      if (!status) {
        ctx.breaker.recordFailure();
        continue;
      }
      ctx.breaker.recordSuccess();
      const state = mapStatus(ctx.host, ctx.model, zone, status, ctx.entryId);
      stateStore.update(state);
    }
  }
}
