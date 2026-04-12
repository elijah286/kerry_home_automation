// ---------------------------------------------------------------------------
// Screensaver integration — photo rotation with per-user on/off devices
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState, ScreensaverState, ScreensaverEffect } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { query } from '../../db/pool.js';
import { fetchAlbumPhotos, parseAlbumToken } from './icloud-album.js';
import { PhotoCache } from './photo-cache.js';

const PHOTO_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface ScreensaverCtx {
  entryId: string;
  albumUrl: string;
  rotationIntervalSec: number;
  effect: ScreensaverEffect;
  userIds: string[];
  photoCache: PhotoCache;
  refreshTimer: ReturnType<typeof setInterval> | null;
  /** Per-user on/off state and current photo index */
  userState: Map<string, { on: boolean; currentIndex: number }>;
}

export class ScreensaverIntegration implements Integration {
  readonly id = 'screensaver' as const;
  private ctx: ScreensaverCtx | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  /** Expose photo cache for API routes */
  getPhotoCache(): PhotoCache | null {
    return this.ctx?.photoCache ?? null;
  }

  getCtx() {
    return this.ctx;
  }

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('screensaver');
    if (entries.length === 0) {
      logger.info('Screensaver: no entries configured');
      return;
    }

    this.stopping = false;
    this.emitHealth('connecting');

    const entry = entries.find((e) => e.enabled);
    if (!entry) {
      logger.info('Screensaver: no enabled entries');
      return;
    }

    const albumUrl = entry.config.album_url || '';
    const rotationIntervalSec = parseInt(entry.config.rotation_interval || '30', 10) || 30;
    const effect = (entry.config.effect || 'ken_burns') as ScreensaverEffect;
    const userIdsCfg = entry.config.user_ids?.trim();

    // Resolve user IDs: if blank, use all users from DB
    let userIds: string[];
    if (userIdsCfg) {
      userIds = userIdsCfg.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const result = await query<{ id: string }>('SELECT id FROM users WHERE enabled = true');
      userIds = result.rows.map((r) => r.id);
    }

    if (userIds.length === 0) {
      logger.warn('Screensaver: no users found');
      this.lastError = 'No users configured';
      this.emitHealth('error');
      return;
    }

    const photoCache = new PhotoCache();
    await photoCache.init();

    const userState = new Map<string, { on: boolean; currentIndex: number }>();
    for (const uid of userIds) {
      userState.set(uid, { on: false, currentIndex: 0 });
    }

    this.ctx = {
      entryId: entry.id,
      albumUrl,
      rotationIntervalSec,
      effect,
      userIds,
      photoCache,
      refreshTimer: null,
      userState,
    };

    // Initial photo fetch
    if (albumUrl) {
      await this.refreshPhotos();
    } else {
      logger.info('Screensaver: no album URL configured, waiting for configuration');
    }

    // Publish device states for each user
    await this.publishAllDeviceStates();

    // Periodic photo refresh
    this.ctx.refreshTimer = setInterval(() => {
      if (this.stopping) return;
      void this.refreshPhotos();
    }, PHOTO_REFRESH_INTERVAL_MS);

    this.emitHealth('connected');
    logger.info({ users: userIds.length, photos: photoCache.getPhotoCount() }, 'Screensaver integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.ctx?.refreshTimer) clearInterval(this.ctx.refreshTimer);
    this.ctx = null;
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'screensaver' || !this.ctx) return;

    // Device ID format: screensaver.<entryId>.user.<userId>
    const parts = cmd.deviceId.split('.');
    const userId = parts[3];
    if (!userId) return;

    const state = this.ctx.userState.get(userId);
    if (!state) return;

    switch (cmd.action) {
      case 'turn_on':
        state.on = true;
        break;
      case 'turn_off':
        state.on = false;
        break;
    }

    this.publishDeviceState(userId, state);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.ctx ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  /** Get the next photo for a user and advance the index. */
  advancePhoto(userId: string): { photoId: string; index: number } | null {
    if (!this.ctx) return null;
    const state = this.ctx.userState.get(userId);
    if (!state) return null;

    const photo = this.ctx.photoCache.getPhotoByIndex(state.currentIndex);
    if (!photo) return null;

    const result = { photoId: photo.id, index: state.currentIndex };
    state.currentIndex = (state.currentIndex + 1) % this.ctx.photoCache.getPhotoCount();

    // Update device state with new index
    this.publishDeviceState(userId, state);

    return result;
  }

  private async refreshPhotos(): Promise<void> {
    if (!this.ctx?.albumUrl) return;

    try {
      const token = parseAlbumToken(this.ctx.albumUrl);
      const photos = await fetchAlbumPhotos(this.ctx.albumUrl);
      await this.ctx.photoCache.sync(token, photos);

      // Prune removed photos
      const currentGuids = new Set(photos.map((p) => p.guid));
      await this.ctx.photoCache.prune(currentGuids);

      this.lastConnected = Date.now();
      this.lastError = null;

      // Update device states with new photo count
      await this.publishAllDeviceStates();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Screensaver: failed to refresh photos');
    }
  }

  private async publishAllDeviceStates(): Promise<void> {
    if (!this.ctx) return;

    // Look up user display names
    const userResult = await query<{ id: string; display_name: string | null; username: string }>(
      'SELECT id, display_name, username FROM users WHERE id = ANY($1)',
      [this.ctx.userIds],
    );
    const userNames = new Map(userResult.rows.map((r) => [r.id, r.display_name || r.username]));

    for (const userId of this.ctx.userIds) {
      const state = this.ctx.userState.get(userId);
      if (state) {
        this.publishDeviceState(userId, state, userNames.get(userId));
      }
    }
  }

  private publishDeviceState(
    userId: string,
    state: { on: boolean; currentIndex: number },
    userName?: string,
  ): void {
    if (!this.ctx) return;

    const deviceId = `screensaver.${this.ctx.entryId}.user.${userId}`;
    const name = userName ? `${userName} Screensaver` : `Screensaver (${userId})`;

    const deviceState: ScreensaverState = {
      type: 'screensaver',
      id: deviceId,
      name,
      integration: 'screensaver',
      areaId: null,
      available: true,
      lastChanged: Date.now(),
      lastUpdated: Date.now(),
      on: state.on,
      userId,
      photoCount: this.ctx.photoCache.getPhotoCount(),
      currentPhotoIndex: state.currentIndex,
      rotationIntervalSec: this.ctx.rotationIntervalSec,
      effect: this.ctx.effect,
    };

    stateStore.update(deviceState);
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
