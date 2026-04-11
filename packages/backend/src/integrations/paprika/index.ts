// ---------------------------------------------------------------------------
// Paprika integration: recipe library as a device
// Each integration entry = one Paprika account
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, RecipeLibraryState, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import { redis } from '../../state/redis.js';
import * as entryStore from '../../db/integration-entry-store.js';

const PAPRIKA_BASE = 'https://www.paprikaapp.com/api/v1/sync';
const CACHE_PREFIX = 'paprika:';
const REFRESH_INTERVAL_MS = 5 * 60_000; // refresh recipe count every 5 min

interface EntryContext {
  entryId: string;
  email: string;
  password: string;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class PaprikaIntegration implements Integration {
  readonly id = 'paprika' as const;
  private entries = new Map<string, EntryContext>();
  private connectionState: ConnectionState = 'init';
  private lastError: string | null = null;

  async start(): Promise<void> {
    const dbEntries = await entryStore.getEntries('paprika');
    if (dbEntries.length === 0) {
      logger.info('No Paprika entries configured');
      return;
    }

    this.connectionState = 'connecting';

    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const { email, password } = entry.config;
      if (!email || !password) continue;

      try {
        const ctx: EntryContext = { entryId: entry.id, email, password, pollTimer: null };
        this.entries.set(entry.id, ctx);

        await this.refreshDeviceState(ctx);

        ctx.pollTimer = setInterval(() => void this.refreshDeviceState(ctx), REFRESH_INTERVAL_MS);
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Paprika entry init failed');
        this.lastError = String(err);
      }
    }

    if (this.entries.size > 0) {
      this.connectionState = 'connected';
      this.emitHealth('connected');
    } else {
      this.connectionState = 'error';
      this.emitHealth('error');
    }
  }

  private async refreshDeviceState(ctx: EntryContext): Promise<void> {
    try {
      const auth = `Basic ${Buffer.from(`${ctx.email}:${ctx.password}`).toString('base64')}`;
      const res = await fetch(`${PAPRIKA_BASE}/recipes/`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(`Paprika API ${res.status}`);
      const json = (await res.json()) as { result: Array<{ uid: string }> };
      const recipeCount = json.result.length;

      const lastSyncStr = await redis.get(`${CACHE_PREFIX}last_sync`);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : null;

      const state: RecipeLibraryState = {
        type: 'recipe_library',
        id: `paprika.${ctx.entryId}`,
        name: `Paprika (${ctx.email})`,
        integration: 'paprika',
        areaId: null,
        available: true,
        lastChanged: Date.now(),
        lastUpdated: Date.now(),
        recipeCount,
        lastSync,
      };
      stateStore.update(state);
    } catch (err) {
      logger.error({ err, entryId: ctx.entryId }, 'Paprika device state refresh failed');
    }
  }

  async stop(): Promise<void> {
    for (const ctx of this.entries.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.entries.clear();
    this.connectionState = 'disconnected';
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // Recipe library is read-only
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.connectionState,
      lastConnected: null,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  /**
   * Get credentials for a specific entry (used by paprika-routes for API proxy).
   * Returns the first configured entry's credentials if no entryId specified.
   */
  getCredentials(entryId?: string): { email: string; password: string } | null {
    if (entryId) {
      const ctx = this.entries.get(entryId);
      return ctx ? { email: ctx.email, password: ctx.password } : null;
    }
    const first = this.entries.values().next();
    if (first.done) return null;
    return { email: first.value.email, password: first.value.password };
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
