// ---------------------------------------------------------------------------
// Per-integration "detailed logging" flags (troubleshooting)
// ---------------------------------------------------------------------------

import type { IntegrationId } from '@ha/shared';
import { query } from './pool.js';

export async function getAllDebugFlags(): Promise<Map<IntegrationId, boolean>> {
  const { rows } = await query<{ integration_id: string; enabled: boolean }>(
    'SELECT integration_id, enabled FROM integration_debug_logging',
  );
  const m = new Map<IntegrationId, boolean>();
  for (const r of rows) {
    m.set(r.integration_id as IntegrationId, r.enabled);
  }
  return m;
}

export async function setDebugFlag(integrationId: IntegrationId, enabled: boolean): Promise<void> {
  await query(
    `INSERT INTO integration_debug_logging (integration_id, enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (integration_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       updated_at = NOW()`,
    [integrationId, enabled],
  );
}
