// ---------------------------------------------------------------------------
// Integration entry store — Postgres-backed, supports multiple entries per integration
// ---------------------------------------------------------------------------

import type { IntegrationId, IntegrationEntry } from '@ha/shared';
import { query } from './pool.js';

export async function getEntries(integration: IntegrationId): Promise<IntegrationEntry[]> {
  const { rows } = await query<{
    id: string;
    integration: string;
    label: string;
    config: Record<string, string>;
    enabled: boolean;
  }>(
    'SELECT id, integration, label, config, enabled FROM integration_entries WHERE integration = $1 ORDER BY created_at',
    [integration],
  );
  return rows.map((r) => ({
    id: r.id,
    integration: r.integration as IntegrationId,
    label: r.label,
    config: r.config,
    enabled: r.enabled,
  }));
}

export async function getEntry(id: string): Promise<IntegrationEntry | null> {
  const { rows } = await query<{
    id: string;
    integration: string;
    label: string;
    config: Record<string, string>;
    enabled: boolean;
  }>('SELECT id, integration, label, config, enabled FROM integration_entries WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, integration: r.integration as IntegrationId, label: r.label, config: r.config, enabled: r.enabled };
}

export async function saveEntry(entry: IntegrationEntry): Promise<void> {
  await query(
    `INSERT INTO integration_entries (id, integration, label, config, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       label = $3,
       config = $4,
       enabled = $5,
       updated_at = NOW()`,
    // Pass a plain object for JSONB — not JSON.stringify (pg expects objects for jsonb params).
    [entry.id, entry.integration, entry.label, entry.config as object, entry.enabled],
  );
}

export async function deleteEntry(id: string): Promise<void> {
  await query('DELETE FROM integration_entries WHERE id = $1', [id]);
}

export async function getAllEntries(): Promise<IntegrationEntry[]> {
  const { rows } = await query<{
    id: string;
    integration: string;
    label: string;
    config: Record<string, string>;
    enabled: boolean;
  }>('SELECT id, integration, label, config, enabled FROM integration_entries ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    integration: r.integration as IntegrationId,
    label: r.label,
    config: r.config,
    enabled: r.enabled,
  }));
}
