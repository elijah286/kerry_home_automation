// ---------------------------------------------------------------------------
// Local photo cache — downloads and serves screensaver images from disk
// ---------------------------------------------------------------------------

import { mkdir, readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../logger.js';
import type { AlbumPhoto } from './icloud-album.js';

const DEFAULT_CACHE_DIR = 'data/screensaver-cache';
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
const METADATA_FILE = '_metadata.json';

export interface CachedPhoto {
  id: string;
  guid: string;
  width: number;
  height: number;
  filename: string;
  /** Size in bytes */
  size: number;
}

export interface PhotoCacheMetadata {
  photos: CachedPhoto[];
  lastFetched: number;
  albumToken: string;
}

export class PhotoCache {
  private cacheDir: string;
  private metadata: PhotoCacheMetadata | null = null;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
  }

  async init(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await this.loadMetadata();
  }

  private async loadMetadata(): Promise<void> {
    try {
      const raw = await readFile(join(this.cacheDir, METADATA_FILE), 'utf-8');
      this.metadata = JSON.parse(raw);
    } catch {
      this.metadata = null;
    }
  }

  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;
    await writeFile(
      join(this.cacheDir, METADATA_FILE),
      JSON.stringify(this.metadata, null, 2),
    );
  }

  getPhotos(): CachedPhoto[] {
    return this.metadata?.photos ?? [];
  }

  getPhotoCount(): number {
    return this.metadata?.photos.length ?? 0;
  }

  getLastFetched(): number | null {
    return this.metadata?.lastFetched ?? null;
  }

  async getPhotoBuffer(id: string): Promise<Buffer | null> {
    const photo = this.metadata?.photos.find((p) => p.id === id);
    if (!photo) return null;
    try {
      return await readFile(join(this.cacheDir, photo.filename));
    } catch {
      return null;
    }
  }

  getPhotoById(id: string): CachedPhoto | undefined {
    return this.metadata?.photos.find((p) => p.id === id);
  }

  getPhotoByIndex(index: number): CachedPhoto | undefined {
    const photos = this.getPhotos();
    if (photos.length === 0) return undefined;
    return photos[((index % photos.length) + photos.length) % photos.length];
  }

  /**
   * Download album photos that aren't already cached.
   * Returns count of newly downloaded photos.
   */
  async sync(albumToken: string, photos: AlbumPhoto[]): Promise<number> {
    const existingGuids = new Set(this.metadata?.photos.map((p) => p.guid) ?? []);
    const toDownload = photos.filter((p) => !existingGuids.has(p.guid));

    if (toDownload.length === 0) {
      logger.info('Photo cache: all photos already cached');
      if (this.metadata) {
        this.metadata.lastFetched = Date.now();
        await this.saveMetadata();
      }
      return 0;
    }

    logger.info({ toDownload: toDownload.length, existing: existingGuids.size }, 'Photo cache: downloading new photos');

    const cached: CachedPhoto[] = [...(this.metadata?.photos ?? [])];
    let downloaded = 0;

    for (const photo of toDownload) {
      // Check cache size limit
      const totalSize = cached.reduce((sum, p) => sum + p.size, 0);
      if (totalSize >= MAX_CACHE_SIZE_BYTES) {
        logger.warn({ maxMB: MAX_CACHE_SIZE_BYTES / 1024 / 1024 }, 'Photo cache: size limit reached, stopping downloads');
        break;
      }

      try {
        const res = await fetch(photo.url);
        if (!res.ok) {
          logger.warn({ guid: photo.guid, status: res.status }, 'Photo cache: failed to download');
          continue;
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = guessExtension(res.headers.get('content-type'));
        const filename = `${photo.guid}${ext}`;
        const id = photo.guid;

        await writeFile(join(this.cacheDir, filename), buffer);

        cached.push({
          id,
          guid: photo.guid,
          width: photo.width,
          height: photo.height,
          filename,
          size: buffer.length,
        });

        downloaded++;
      } catch (err) {
        logger.warn({ guid: photo.guid, err }, 'Photo cache: download error');
      }
    }

    this.metadata = {
      photos: cached,
      lastFetched: Date.now(),
      albumToken,
    };
    await this.saveMetadata();

    logger.info({ downloaded, total: cached.length }, 'Photo cache: sync complete');
    return downloaded;
  }

  /** Remove photos from cache that are no longer in the album. */
  async prune(currentGuids: Set<string>): Promise<number> {
    if (!this.metadata) return 0;
    const toRemove = this.metadata.photos.filter((p) => !currentGuids.has(p.guid));
    for (const photo of toRemove) {
      try {
        await unlink(join(this.cacheDir, photo.filename));
      } catch { /* already gone */ }
    }
    this.metadata.photos = this.metadata.photos.filter((p) => currentGuids.has(p.guid));
    await this.saveMetadata();
    return toRemove.length;
  }
}

function guessExtension(contentType: string | null): string {
  if (!contentType) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('heic')) return '.heic';
  return '.jpg';
}
