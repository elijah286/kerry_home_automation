// ---------------------------------------------------------------------------
// Spotify Web API client
// OAuth2 token refresh + playback control
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1/me/player';
const TIMEOUT_MS = 5000;

export interface SpotifyPlayback {
  is_playing: boolean;
  item: {
    name: string;
    artists: { name: string }[];
    album: {
      name: string;
      images: { url: string }[];
    };
    duration_ms: number;
  } | null;
  progress_ms: number | null;
  device: {
    id: string;
    name: string;
    type: string;
    volume_percent: number | null;
  };
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
}

export class SpotifyClient {
  private accessToken: string | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
  ) {}

  async refreshAccessToken(): Promise<void> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify token refresh failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { access_token: string };
    this.accessToken = data.access_token;
    logger.debug('Spotify access token refreshed');
  }

  private async api(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
    if (!this.accessToken) await this.refreshAccessToken();

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401 && retry) {
      await this.refreshAccessToken();
      return this.api(method, path, body, false);
    }

    return res;
  }

  async getCurrentPlayback(): Promise<SpotifyPlayback | null> {
    const res = await this.api('GET', '');
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Spotify GET /player ${res.status}`);
    return (await res.json()) as SpotifyPlayback;
  }

  async play(): Promise<void> {
    const res = await this.api('PUT', '/play');
    if (!res.ok && res.status !== 204) throw new Error(`Spotify play ${res.status}`);
  }

  async pause(): Promise<void> {
    const res = await this.api('PUT', '/pause');
    if (!res.ok && res.status !== 204) throw new Error(`Spotify pause ${res.status}`);
  }

  async next(): Promise<void> {
    const res = await this.api('POST', '/next');
    if (!res.ok && res.status !== 204) throw new Error(`Spotify next ${res.status}`);
  }

  async previous(): Promise<void> {
    const res = await this.api('POST', '/previous');
    if (!res.ok && res.status !== 204) throw new Error(`Spotify previous ${res.status}`);
  }

  async setVolume(percent: number): Promise<void> {
    const res = await this.api('PUT', `/volume?volume_percent=${Math.round(percent)}`);
    if (!res.ok && res.status !== 204) throw new Error(`Spotify setVolume ${res.status}`);
  }

  async setShuffle(state: boolean): Promise<void> {
    const res = await this.api('PUT', `/shuffle?state=${state}`);
    if (!res.ok && res.status !== 204) throw new Error(`Spotify setShuffle ${res.status}`);
  }

  async setRepeat(state: 'off' | 'track' | 'context'): Promise<void> {
    const res = await this.api('PUT', `/repeat?state=${state}`);
    if (!res.ok && res.status !== 204) throw new Error(`Spotify setRepeat ${res.status}`);
  }

  async transferPlayback(deviceId: string): Promise<void> {
    const res = await this.api('PUT', '', { device_ids: [deviceId] });
    if (!res.ok && res.status !== 204) throw new Error(`Spotify transfer ${res.status}`);
  }
}
