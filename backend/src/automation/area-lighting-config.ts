import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import type { SignalWeights } from './signal-normalizers.js';
import { DEFAULT_WEIGHTS } from './signal-normalizers.js';

export interface AreaLightingConfig {
  area_id: string;
  target_lux: number;
  illuminance_entity_id: string | null;
  activation_threshold: number;
  deactivation_threshold: number;
  min_hold_seconds: number;
  weight_overrides: Partial<SignalWeights> | null;
  enabled: boolean;
}

const DEFAULT_CONFIG: Omit<AreaLightingConfig, 'area_id'> = {
  target_lux: 150,
  illuminance_entity_id: null,
  activation_threshold: 0.55,
  deactivation_threshold: 0.40,
  min_hold_seconds: 300,
  weight_overrides: null,
  enabled: true,
};

export class AreaLightingConfigStore {
  private cache = new Map<string, AreaLightingConfig>();
  private loaded = false;

  async load(): Promise<void> {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS area_lighting_config (
          area_id TEXT PRIMARY KEY REFERENCES areas(id),
          target_lux INTEGER NOT NULL DEFAULT 150,
          illuminance_entity_id TEXT,
          activation_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.55,
          deactivation_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.40,
          min_hold_seconds INTEGER NOT NULL DEFAULT 300,
          weight_overrides JSONB,
          enabled BOOLEAN NOT NULL DEFAULT true
        )
      `);
    } catch {
      // Table likely already exists from init.sql
    }

    const { rows } = await query<{
      area_id: string;
      target_lux: number;
      illuminance_entity_id: string | null;
      activation_threshold: string;
      deactivation_threshold: string;
      min_hold_seconds: number;
      weight_overrides: Partial<SignalWeights> | null;
      enabled: boolean;
    }>('SELECT * FROM area_lighting_config');

    this.cache.clear();
    for (const r of rows) {
      this.cache.set(r.area_id, {
        area_id: r.area_id,
        target_lux: r.target_lux,
        illuminance_entity_id: r.illuminance_entity_id,
        activation_threshold: parseFloat(r.activation_threshold),
        deactivation_threshold: parseFloat(r.deactivation_threshold),
        min_hold_seconds: r.min_hold_seconds,
        weight_overrides: r.weight_overrides,
        enabled: r.enabled,
      });
    }
    this.loaded = true;
    logger.info({ count: this.cache.size }, 'Loaded area lighting configs');
  }

  getConfig(areaId: string): AreaLightingConfig {
    return this.cache.get(areaId) ?? { area_id: areaId, ...DEFAULT_CONFIG };
  }

  getWeights(areaId: string): SignalWeights {
    const cfg = this.getConfig(areaId);
    if (!cfg.weight_overrides) return { ...DEFAULT_WEIGHTS };
    return { ...DEFAULT_WEIGHTS, ...cfg.weight_overrides };
  }

  getAllConfigs(): AreaLightingConfig[] {
    return [...this.cache.values()];
  }

  async upsert(config: AreaLightingConfig): Promise<void> {
    await query(
      `INSERT INTO area_lighting_config
        (area_id, target_lux, illuminance_entity_id, activation_threshold, deactivation_threshold, min_hold_seconds, weight_overrides, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (area_id) DO UPDATE SET
        target_lux = $2, illuminance_entity_id = $3, activation_threshold = $4,
        deactivation_threshold = $5, min_hold_seconds = $6, weight_overrides = $7, enabled = $8`,
      [
        config.area_id,
        config.target_lux,
        config.illuminance_entity_id,
        config.activation_threshold,
        config.deactivation_threshold,
        config.min_hold_seconds,
        config.weight_overrides ? JSON.stringify(config.weight_overrides) : null,
        config.enabled,
      ],
    );
    this.cache.set(config.area_id, config);
  }

  async remove(areaId: string): Promise<boolean> {
    const { rowCount } = await query(
      'DELETE FROM area_lighting_config WHERE area_id = $1',
      [areaId],
    );
    this.cache.delete(areaId);
    return (rowCount ?? 0) > 0;
  }
}

export const areaLightingConfigStore = new AreaLightingConfigStore();
