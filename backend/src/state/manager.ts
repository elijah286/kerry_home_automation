import type {
  EntityState,
  EntityDomain,
  StateChangedEvent,
  SystemMode,
  CommandEvent,
} from '@home-automation/shared';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { eventBus } from './event-bus.js';
import { redisStore } from './redis-store.js';
import { historyWriter } from './history.js';

const DEFAULT_MODE: SystemMode = 'day';

function domainFromEntityId(entityId: string): EntityDomain {
  const dot = entityId.indexOf('.');
  const raw = dot === -1 ? entityId : entityId.slice(0, dot);
  return raw as EntityDomain;
}

export class StateManager {
  private states = new Map<string, EntityState>();
  private systemMode: SystemMode = DEFAULT_MODE;

  getState(entityId: string): EntityState | undefined {
    return this.states.get(entityId);
  }

  async getEntityState(entityId: string): Promise<EntityState | null> {
    const mem = this.states.get(entityId);
    if (mem) return mem;
    const fromRedis = await redisStore.getEntityState(entityId);
    if (fromRedis) {
      this.states.set(entityId, fromRedis);
    }
    return fromRedis;
  }

  getAllStates(): EntityState[] {
    return [...this.states.values()];
  }

  getStatesByDomain(domain: EntityDomain): EntityState[] {
    return this.getAllStates().filter((s) => s.domain === domain);
  }

  async getStatesByArea(areaId: string): Promise<EntityState[]> {
    const ids = await redisStore.getEntitiesByArea(areaId);
    const out: EntityState[] = [];
    for (const id of ids) {
      const s = await this.getEntityState(id);
      if (s) out.push(s);
    }
    return out;
  }

  async setState(
    entityId: string,
    newState: string,
    attributes?: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.states.get(entityId) ?? (await redisStore.getEntityState(entityId));
    const merged =
      attributes !== undefined
        ? { ...(existing?.attributes ?? {}), ...attributes }
        : (existing?.attributes ?? {});
    await this.processStateChange(entityId, newState, merged);
  }

  async processStateChange(
    entityId: string,
    state: string,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    const existing = this.states.get(entityId) ?? (await redisStore.getEntityState(entityId));
    const now = Date.now();
    const domain = existing?.domain ?? domainFromEntityId(entityId);
    const stateChanged = !existing || existing.state !== state;
    const next: EntityState = {
      entity_id: entityId,
      domain,
      state,
      attributes,
      last_changed: stateChanged ? now : existing!.last_changed,
      last_updated: now,
    };
    await this.applyState(next, existing ?? null);
  }

  async applyState(newState: EntityState, oldState?: EntityState | null): Promise<void> {
    const prev = oldState !== undefined ? oldState : (this.states.get(newState.entity_id) ?? null);
    this.states.set(newState.entity_id, newState);
    await redisStore.setEntityState(newState);
    historyWriter.queueStateChange({
      entity_id: newState.entity_id,
      state: newState.state,
      attributes: newState.attributes,
    });
    const payload: StateChangedEvent = {
      type: 'state_changed',
      entity_id: newState.entity_id,
      old_state: prev,
      new_state: newState,
      timestamp: Date.now(),
    };
    eventBus.emit('state_changed', payload);
  }

  getSystemMode(): SystemMode {
    return this.systemMode;
  }

  async setSystemMode(mode: SystemMode): Promise<void> {
    const old = this.systemMode;
    if (old === mode) return;
    this.systemMode = mode;
    await redisStore.setSystemMode(mode);
    eventBus.emit('mode_changed', {
      type: 'mode_changed',
      old_mode: old,
      new_mode: mode,
      timestamp: Date.now(),
    });
  }

  handleCommand(entityId: string, command: string, data?: Record<string, unknown>): void {
    if (config.readOnly) {
      logger.warn({ entityId, command }, 'Command blocked: read-only mode');
      return;
    }
    const event: CommandEvent = {
      type: 'command',
      entity_id: entityId,
      command,
      data,
    };
    eventBus.emit('command', event);
  }

  async init(): Promise<void> {
    const mode = await redisStore.getSystemMode();
    if (mode) {
      this.systemMode = mode;
    }
    const all = await redisStore.getAllStates();
    for (const s of all) {
      this.states.set(s.entity_id, s);
    }
    logger.info({ count: all.length, mode: this.systemMode }, 'State manager initialized');
  }
}

export const stateManager = new StateManager();
