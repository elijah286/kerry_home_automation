// ---------------------------------------------------------------------------
// iCloud Shared Album client — fetches photo metadata + download URLs
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export interface AlbumPhoto {
  guid: string;
  url: string;
  width: number;
  height: number;
}

/** Extract the shared album token from a full iCloud URL or bare token. */
export function parseAlbumToken(input: string): string {
  const match = input.match(/#([A-Za-z0-9]+)$/);
  return match ? match[1] : input.trim();
}

/** Derive the iCloud cluster host from a B-prefix token. */
function deriveHost(token: string): string {
  const prefix = token[0];
  if (prefix === 'A') {
    const cluster = token[1].padStart(2, '0');
    return `p${cluster}-sharedstreams.icloud.com`;
  }
  // B-prefix: base62-decode characters at index 1-2
  const c1 = BASE62.indexOf(token[1]);
  const c2 = BASE62.indexOf(token[2]);
  const cluster = c1 * 62 + c2;
  return `p${cluster}-sharedstreams.icloud.com`;
}

interface WebstreamResponse {
  photos: Array<{
    photoGuid: string;
    derivatives: Record<string, {
      checksum: string;
      fileSize: number;
      width: number;
      height: number;
    }>;
  }>;
  streamCtag?: string;
}

interface AssetUrlsResponse {
  items: Record<string, {
    url_location: string;
    url_path: string;
  }>;
}

/**
 * Fetch all photos from an iCloud shared album.
 * Returns photo metadata with direct download URLs for the largest derivative.
 */
export async function fetchAlbumPhotos(tokenOrUrl: string): Promise<AlbumPhoto[]> {
  const token = parseAlbumToken(tokenOrUrl);
  let host = deriveHost(token);
  const baseUrl = () => `https://${host}/${token}/sharedstreams`;

  // Step 1: Get photo metadata (with redirect handling)
  let webstreamData: WebstreamResponse;
  const allPhotos: WebstreamResponse['photos'] = [];
  let streamCtag: string | null = null;

  // Paginate through webstream
  for (let page = 0; page < 20; page++) {
    const res = await fetch(`${baseUrl()}/webstream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamCtag }),
    });

    // Handle host redirect
    const redirectHost = res.headers.get('x-apple-mme-host');
    if (redirectHost && page === 0 && res.status !== 200) {
      host = redirectHost;
      const retryRes = await fetch(`${baseUrl()}/webstream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamCtag: null }),
      });
      webstreamData = await retryRes.json() as WebstreamResponse;
    } else {
      webstreamData = await res.json() as WebstreamResponse;
    }

    if (!webstreamData.photos || webstreamData.photos.length === 0) break;
    allPhotos.push(...webstreamData.photos);

    if (!webstreamData.streamCtag || webstreamData.streamCtag === streamCtag) break;
    streamCtag = webstreamData.streamCtag;
  }

  if (allPhotos.length === 0) {
    logger.warn({ token }, 'iCloud album returned no photos');
    return [];
  }

  logger.info({ count: allPhotos.length }, 'Fetched iCloud album photo metadata');

  // Pick largest derivative per photo and collect checksums
  const checksumToPhoto = new Map<string, { guid: string; width: number; height: number }>();
  for (const photo of allPhotos) {
    let best: { checksum: string; fileSize: number; width: number; height: number } | null = null;
    for (const d of Object.values(photo.derivatives)) {
      if (!best || d.fileSize > best.fileSize) best = d;
    }
    if (best) {
      checksumToPhoto.set(best.checksum, {
        guid: photo.photoGuid,
        width: best.width,
        height: best.height,
      });
    }
  }

  // Step 2: Get download URLs
  const guids = allPhotos.map((p) => p.photoGuid);
  const urlRes = await fetch(`${baseUrl()}/webasseturls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoGuids: guids }),
  });
  const urlData = await urlRes.json() as AssetUrlsResponse;

  // Step 3: Build results
  const results: AlbumPhoto[] = [];
  for (const [checksum, info] of checksumToPhoto) {
    const asset = urlData.items?.[checksum];
    if (!asset) continue;
    results.push({
      guid: info.guid,
      url: `https://${asset.url_location}${asset.url_path}`,
      width: info.width,
      height: info.height,
    });
  }

  logger.info({ count: results.length }, 'Resolved iCloud album download URLs');
  return results;
}
