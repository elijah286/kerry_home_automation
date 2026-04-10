// ---------------------------------------------------------------------------
// Integration config store — Postgres-backed
// ---------------------------------------------------------------------------

import type { IntegrationId } from '@ha/shared';
import { query } from './pool.js';
import { logger } from '../logger.js';

export interface StoredConfig {
  id: IntegrationId;
  displayName: string;
  enabled: boolean;
  config: Record<string, string>;
}

export async function getConfig(id: IntegrationId): Promise<Record<string, string> | null> {
  const { rows } = await query<{ config: Record<string, string> }>(
    'SELECT config FROM integration_configs WHERE id = $1',
    [id],
  );
  if (rows.length === 0) return null;
  return rows[0].config;
}

export async function saveConfig(
  id: IntegrationId,
  displayName: string,
  config: Record<string, string>,
): Promise<void> {
  await query(
    `INSERT INTO integration_configs (id, display_name, config, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       config = $3,
       display_name = $2,
       updated_at = NOW()`,
    [id, displayName, JSON.stringify(config)],
  );
}

export async function setEnabled(id: IntegrationId, enabled: boolean): Promise<void> {
  await query(
    'UPDATE integration_configs SET enabled = $2, updated_at = NOW() WHERE id = $1',
    [id, enabled],
  );
}

export async function getAllConfigs(): Promise<StoredConfig[]> {
  const { rows } = await query<{
    id: string;
    display_name: string;
    enabled: boolean;
    config: Record<string, string>;
  }>('SELECT id, display_name, enabled, config FROM integration_configs');

  return rows.map((r) => ({
    id: r.id as IntegrationId,
    displayName: r.display_name,
    enabled: r.enabled,
    config: r.config,
  }));
}

export async function deleteConfig(id: IntegrationId): Promise<void> {
  await query('DELETE FROM integration_configs WHERE id = $1', [id]);
}

/**
 * One-time migration: move any integration configs from Redis to Postgres.
 * Call this once at startup, then it's a no-op.
 */
export async function migrateFromRedis(redis: { keys: (p: string) => Promise<string[]>; get: (k: string) => Promise<string | null>; del: (...k: string[]) => Promise<number> }): Promise<void> {
  const keys = await redis.keys('integration_config:*');
  if (keys.length === 0) return;

  let migrated = 0;
  for (const key of keys) {
    const id = key.replace('integration_config:', '') as IntegrationId;
    const raw = await redis.get(key);
    if (!raw) continue;

    const existing = await getConfig(id);
    if (existing) continue; // Don't overwrite Postgres data

    const config = JSON.parse(raw) as Record<string, string>;
    await saveConfig(id, id, config);
    migrated++;
  }

  if (migrated > 0) {
    // Clean up Redis keys
    await redis.del(...keys);
    logger.info({ migrated, keys: keys.length }, 'Migrated integration configs from Redis to Postgres');
  }
}
