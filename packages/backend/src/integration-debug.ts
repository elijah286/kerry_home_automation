// ---------------------------------------------------------------------------
// In-memory debug flags + structured "detail" log lines for the system terminal
// ---------------------------------------------------------------------------

import type { IntegrationId } from '@ha/shared';
import { logger } from './logger.js';
import * as debugStore from './db/integration-debug-store.js';

const flags = new Map<IntegrationId, boolean>();

export async function loadIntegrationDebugFlags(): Promise<void> {
  const m = await debugStore.getAllDebugFlags();
  flags.clear();
  for (const [k, v] of m) {
    flags.set(k, v);
  }
}

export function isIntegrationDebugEnabled(id: IntegrationId): boolean {
  return flags.get(id) === true;
}

export function setIntegrationDebugEnabledMemory(id: IntegrationId, enabled: boolean): void {
  flags.set(id, enabled);
}

/** Logs at info level with `integration` tag when detailed logging is on for this integration. */
export function integrationDetailLog(
  integrationId: IntegrationId,
  msg: string,
  data?: Record<string, unknown>,
): void {
  if (!isIntegrationDebugEnabled(integrationId)) return;
  if (data && Object.keys(data).length > 0) {
    logger.info({ integration: integrationId, ...data }, msg);
  } else {
    logger.info({ integration: integrationId }, msg);
  }
}
