// ---------------------------------------------------------------------------
// MusicCast HTTP client
// ---------------------------------------------------------------------------

import { request as httpRequest } from 'node:http';
import { logger } from '../../logger.js';

const TIMEOUT_MS = 5_000;
const MAX_BODY = 512_000;

export async function musicCastGet(host: string, path: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: host, port: 5000, path, method: 'GET', timeout: TIMEOUT_MS },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
          if (raw.length > MAX_BODY) { req.destroy(); resolve(null); }
        });
        res.on('end', () => {
          if (res.statusCode !== 200) { resolve(null); return; }
          try { resolve(JSON.parse(raw) as Record<string, unknown>); }
          catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

export async function musicCastCommand(host: string, zone: string, path: string): Promise<boolean> {
  const body = await musicCastGet(host, `/YamahaExtendedControl/v1/${zone}/${path}`);
  return body != null && body.response_code === 0;
}

export async function getDeviceInfo(host: string): Promise<{ model: string; name: string } | null> {
  const info = await musicCastGet(host, '/YamahaExtendedControl/v1/system/getDeviceInfo');
  if (!info) return null;
  return {
    model: String(info.model_name ?? 'Unknown'),
    name: String(info.device_name ?? info.model_name ?? 'Yamaha'),
  };
}

export async function getZones(host: string): Promise<string[]> {
  const features = await musicCastGet(host, '/YamahaExtendedControl/v1/system/getFeatures');
  const zones: string[] = ['main'];
  if (features && Array.isArray(features.zone)) {
    for (const z of features.zone as Array<{ id: string }>) {
      if (z.id && z.id !== 'main') zones.push(z.id);
    }
  }
  return zones;
}

export async function getStatus(host: string, zone: string): Promise<Record<string, unknown> | null> {
  return musicCastGet(host, `/YamahaExtendedControl/v1/${zone}/getStatus`);
}
