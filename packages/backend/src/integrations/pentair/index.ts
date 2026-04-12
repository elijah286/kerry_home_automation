// ---------------------------------------------------------------------------
// Pentair IntelliCenter integration: WebSocket connection to pool controller
// Each integration entry = one IntelliCenter controller
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { IntelliCenterClient, type ICResponse } from './intellicenter-client.js';
import { mapBody, mapPump, mapCircuit, mapChemistry } from './mapper.js';

const DEFAULT_PORT = 6680;

interface ControllerCtx {
  entryId: string;
  client: IntelliCenterClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class PentairIntegration implements Integration {
  readonly id = 'pentair' as const;
  private controllers = new Map<string, ControllerCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('pentair');
    if (entries.length === 0) {
      logger.warn('Pentair: no entries configured');
      return;
    }

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host) continue;
      await this.connectController(entry.id, entry.config.host, entry.config.port);
    }
  }

  private async connectController(entryId: string, host: string, portStr?: string): Promise<void> {
    const port = portStr ? parseInt(portStr, 10) : DEFAULT_PORT;
    const client = new IntelliCenterClient({ host, port });

    const ctx: ControllerCtx = { entryId, client, pollTimer: null };
    this.controllers.set(entryId, ctx);

    // ConnectionManager handles retries internally via exponential backoff.
    // We pass callbacks so the integration layer can react to connect/disconnect.
    await client.start(
      (msg) => this.handleNotification(entryId, msg),
      () => this.handleControllerDisconnect(entryId),
      () => this.handleControllerReconnect(entryId),
    ).then(() => {
      // Initial connect succeeded
      this.lastConnected = Date.now();
      this.emitHealth('connected');
      this.startPolling(ctx);
      this.subscribeAll(ctx).catch(() => {});
    }).catch(() => {
      // Initial connect failed — ConnectionManager is already retrying.
      // Emit reconnecting so frontend shows accurate state.
      this.lastError = `Failed to connect to ${host}:${port}`;
      this.emitHealth('reconnecting');
    });
  }

  private handleControllerDisconnect(entryId: string): void {
    if (this.stopping) return;
    logger.warn({ entryId }, 'Pentair controller disconnected');

    // Mark all devices for this controller as unavailable
    const devices = stateStore.getByIntegration('pentair');
    for (const device of devices) {
      if (!device.id.includes(entryId)) continue;
      if (device.available) {
        stateStore.update({ ...device, available: false, lastUpdated: Date.now() });
      }
    }

    // Stop polling — no point polling a dead connection
    const ctx = this.controllers.get(entryId);
    if (ctx?.pollTimer) {
      clearInterval(ctx.pollTimer);
      ctx.pollTimer = null;
    }

    this.emitHealth('reconnecting');
  }

  private handleControllerReconnect(entryId: string): void {
    if (this.stopping) return;
    logger.info({ entryId }, 'Pentair controller reconnected');
    this.lastConnected = Date.now();
    this.emitHealth('connected');

    const ctx = this.controllers.get(entryId);
    if (!ctx) return;

    // Re-poll to refresh all device states and mark available again
    this.poll(ctx).then(() => {
      this.startPolling(ctx);
      this.subscribeAll(ctx).catch(() => {});
    }).catch((err) => {
      logger.error({ err, entryId }, 'Pentair re-poll after reconnect failed');
    });
  }

  private startPolling(ctx: ControllerCtx): void {
    if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    ctx.pollTimer = setInterval(() => {
      if (this.stopping || !ctx.client.connected) return;
      this.poll(ctx).catch((err) => {
        logger.error({ err, entryId: ctx.entryId }, 'Pentair poll error');
        this.lastError = String(err);
      });
    }, appConfig.pentair.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.controllers.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      await ctx.client.disconnect();
    }
    this.controllers.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    // Device ID format: pentair.{entryId}.{category}.{objnam}
    const parts = cmd.deviceId.split('.');
    if (parts[0] !== 'pentair' || parts.length < 4) {
      throw new Error(`Invalid Pentair device ID: ${cmd.deviceId}`);
    }
    const entryId = parts[1];
    const objnam = parts[3];
    const ctx = this.controllers.get(entryId);
    if (!ctx?.client.connected) throw new Error('Pentair not connected');

    switch (cmd.type) {
      case 'pool_body': {
        if (cmd.action === 'turn_on') await ctx.client.setObjectStatus(objnam, true);
        else if (cmd.action === 'turn_off') await ctx.client.setObjectStatus(objnam, false);
        else if (cmd.action === 'set_setpoint' && cmd.setPoint != null) await ctx.client.setSetPoint(objnam, cmd.setPoint);
        break;
      }
      case 'pool_pump':
        await ctx.client.setObjectStatus(objnam, cmd.action === 'turn_on');
        break;
      case 'pool_circuit':
        await ctx.client.setObjectStatus(objnam, cmd.action === 'turn_on');
        break;
    }

    // Re-poll after a short delay to pick up the new state
    setTimeout(() => void this.poll(ctx).catch(() => {}), 1500);
  }

  getHealth(): IntegrationHealth {
    const anyConnected = [...this.controllers.values()].some((ctx) => ctx.client.connected);
    const anyTrying = [...this.controllers.values()].some((ctx) =>
      ctx.client.state === 'reconnecting' || ctx.client.state === 'connecting',
    );
    const state: ConnectionState = anyConnected
      ? 'connected'
      : anyTrying
        ? 'reconnecting'
        : this.controllers.size > 0
          ? 'error'
          : 'disconnected';
    return {
      state,
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  // ---- Polling & state processing -------------------------------------------

  private async poll(ctx: ControllerCtx): Promise<void> {
    if (!ctx.client.connected) return;

    const [bodies, circuits, pumps, chem] = await Promise.allSettled([
      ctx.client.getBodyStatus(),
      ctx.client.getCircuitStatus(),
      ctx.client.getPumpStatus(),
      ctx.client.getChemStatus(),
    ]);

    if (bodies.status === 'fulfilled') this.processObjects(ctx.entryId, bodies.value, 'body');
    if (circuits.status === 'fulfilled') this.processObjects(ctx.entryId, circuits.value, 'circuit');
    if (pumps.status === 'fulfilled') this.processObjects(ctx.entryId, pumps.value, 'pump');
    if (chem.status === 'fulfilled') this.processObjects(ctx.entryId, chem.value, 'chem');
  }

  private processObjects(entryId: string, response: ICResponse, category: string): void {
    const objectList = response.objectList as Array<{ objnam?: string; params?: Record<string, string> }> | undefined;
    if (!Array.isArray(objectList)) {
      logger.debug({ category, keys: Object.keys(response) }, 'Pentair: no objectList in response');
      return;
    }

    for (const obj of objectList) {
      if (!obj.objnam) continue;
      try {
        switch (category) {
          case 'body':
            stateStore.update(mapBody(obj, entryId));
            break;
          case 'circuit':
            stateStore.update(mapCircuit(obj, entryId));
            break;
          case 'pump':
            stateStore.update(mapPump(obj, entryId));
            break;
          case 'chem':
            stateStore.update(mapChemistry(obj, entryId));
            break;
        }
      } catch (err) {
        logger.error({ err, objnam: obj.objnam, category }, 'Pentair: failed to map object');
      }
    }
  }

  private async subscribeAll(ctx: ControllerCtx): Promise<void> {
    const devices = stateStore.getByIntegration('pentair');
    for (const device of devices) {
      if (!device.id.includes(ctx.entryId)) continue;
      const objnam = device.id.split('.').pop();
      if (!objnam) continue;

      const keys = device.type === 'pool_body'
        ? ['STATUS', 'TEMP', 'LSTTMP', 'LOTMP', 'HITMP', 'HTMODE']
        : device.type === 'pool_pump'
          ? ['STATUS', 'RPM', 'PWR']
          : device.type === 'pool_chemistry'
            ? ['PHVAL', 'PHSET', 'ORPVAL', 'ORPSET', 'SALT', 'ALK', 'CALC', 'CYACID', 'QUALTY']
            : ['STATUS'];

      try {
        await ctx.client.subscribeToUpdates(objnam, keys);
      } catch {
        // Non-fatal — polling will still work
      }
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }

  private handleNotification(entryId: string, msg: ICResponse): void {
    const command = (msg.command as string)?.toLowerCase();
    if (command === 'notifylist') {
      const objectList = msg.objectList as Array<{ objnam?: string; params?: Record<string, string> }> | undefined;
      if (!Array.isArray(objectList)) return;

      for (const obj of objectList) {
        if (!obj.objnam) continue;
        const objType = obj.params?.OBJTYP;
        if (objType === 'BODY') stateStore.update(mapBody(obj, entryId));
        else if (objType === 'CIRCUIT') stateStore.update(mapCircuit(obj, entryId));
        else if (objType === 'PUMP') stateStore.update(mapPump(obj, entryId));
        else if (objType === 'CHEM') stateStore.update(mapChemistry(obj, entryId));
        else {
          const existing = stateStore.get(`pentair.${entryId}.body.${obj.objnam}`);
          if (existing) stateStore.update(mapBody(obj, entryId));
          else if (stateStore.get(`pentair.${entryId}.circuit.${obj.objnam}`)) stateStore.update(mapCircuit(obj, entryId));
          else if (stateStore.get(`pentair.${entryId}.pump.${obj.objnam}`)) stateStore.update(mapPump(obj, entryId));
        }
      }
    }
  }
}
