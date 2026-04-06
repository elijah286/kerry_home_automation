import Redis from 'ioredis';
const IORedis = Redis.default ?? Redis;
import type { EntityState, SystemMode } from '@home-automation/shared';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const ENTITY_PREFIX = 'entity:';
const AREA_ENTITIES_PREFIX = 'area:';
const AREA_ENTITIES_SUFFIX = ':entities';
const SYSTEM_MODE_KEY = 'system:mode';
const PRESENCE_PREFIX = 'presence:';

export interface RoomPresence {
  occupied: boolean;
  confidence: number;
  sources: string[];
  timestamp: number;
}

function entityKey(entityId: string): string {
  return `${ENTITY_PREFIX}${entityId}`;
}

function areaEntitiesKey(areaId: string): string {
  return `${AREA_ENTITIES_PREFIX}${areaId}${AREA_ENTITIES_SUFFIX}`;
}

function presenceKey(areaId: string): string {
  return `${PRESENCE_PREFIX}${areaId}`;
}

function serializeEntity(state: EntityState, areaId: string | null): Record<string, string> {
  const base: Record<string, string> = {
    domain: state.domain,
    state: state.state,
    attributes: JSON.stringify(state.attributes),
    last_changed: String(state.last_changed),
    last_updated: String(state.last_updated),
  };
  if (areaId) {
    base.area_id = areaId;
  }
  return base;
}

function parseEntityHash(fields: Record<string, string>): EntityState | null {
  if (!fields.domain || fields.state === undefined || !fields.attributes) {
    return null;
  }
  let attributes: Record<string, unknown>;
  try {
    attributes = JSON.parse(fields.attributes) as Record<string, unknown>;
  } catch {
    return null;
  }
  return {
    entity_id: '',
    domain: fields.domain as EntityState['domain'],
    state: fields.state,
    attributes,
    last_changed: Number(fields.last_changed),
    last_updated: Number(fields.last_updated),
  };
}

export class RedisStore {
  private client: InstanceType<typeof IORedis> | null = null;

  async init(): Promise<void> {
    if (this.client) {
      return;
    }
    this.client = new IORedis(config.redis.url, {
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
    });
    await this.client.ping();
    logger.info('Redis store connected');
  }

  private get redis(): InstanceType<typeof IORedis> {
    if (!this.client) {
      throw new Error('RedisStore not initialized; call init() first');
    }
    return this.client;
  }

  async getEntityState(entityId: string): Promise<EntityState | null> {
    const key = entityKey(entityId);
    const fields = await this.redis.hgetall(key);
    if (Object.keys(fields).length === 0) {
      return null;
    }
    const parsed = parseEntityHash(fields);
    if (!parsed) {
      return null;
    }
    parsed.entity_id = entityId;
    return parsed;
  }

  async setEntityState(state: EntityState, areaId?: string | null): Promise<void> {
    const key = entityKey(state.entity_id);
    const existing = await this.redis.hgetall(key);
    const oldArea = existing.area_id ?? null;
    const nextArea = areaId !== undefined ? areaId : oldArea;

    const pipe = this.redis.pipeline();
    if (oldArea && oldArea !== nextArea) {
      pipe.srem(areaEntitiesKey(oldArea), state.entity_id);
    }
    if (nextArea && nextArea !== oldArea) {
      pipe.sadd(areaEntitiesKey(nextArea), state.entity_id);
    }
    pipe.hset(key, serializeEntity(state, nextArea));
    if (!nextArea) {
      pipe.hdel(key, 'area_id');
    }
    await pipe.exec();
  }

  async getAllStates(): Promise<EntityState[]> {
    const keys = await this.scanKeys(`${ENTITY_PREFIX}*`);
    const out: EntityState[] = [];
    for (const key of keys) {
      const entityId = key.slice(ENTITY_PREFIX.length);
      const fields = await this.redis.hgetall(key);
      const parsed = parseEntityHash(fields);
      if (parsed) {
        parsed.entity_id = entityId;
        out.push(parsed);
      }
    }
    return out;
  }

  async getEntitiesByArea(areaId: string): Promise<string[]> {
    return this.redis.smembers(areaEntitiesKey(areaId));
  }

  async getSystemMode(): Promise<SystemMode | null> {
    const v = await this.redis.get(SYSTEM_MODE_KEY);
    if (v === null) {
      return null;
    }
    return v as SystemMode;
  }

  async setSystemMode(mode: SystemMode): Promise<void> {
    await this.redis.set(SYSTEM_MODE_KEY, mode);
  }

  async getPresence(areaId: string): Promise<RoomPresence | null> {
    const raw = await this.redis.get(presenceKey(areaId));
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as RoomPresence;
    } catch {
      return null;
    }
  }

  async setPresence(areaId: string, data: RoomPresence): Promise<void> {
    await this.redis.set(presenceKey(areaId), JSON.stringify(data));
  }

  async flushAll(): Promise<void> {
    await this.redis.flushdb();
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  getClient(): InstanceType<typeof IORedis> {
    return this.redis;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}

export const redisStore = new RedisStore();

export async function initRedisStore(): Promise<void> {
  await redisStore.init();
}
