// ---------------------------------------------------------------------------
// Spotify playback → MusicPlayerState mapper
// ---------------------------------------------------------------------------

import type { MusicPlayerState } from '@ha/shared';
import type { SpotifyPlayback } from './spotify-client.js';

export function mapPlaybackState(entryId: string, playback: SpotifyPlayback): MusicPlayerState {
  return {
    type: 'music_player',
    id: `spotify.${entryId}.player`,
    name: 'Spotify',
    integration: 'spotify',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    playing: playback.is_playing,
    trackName: playback.item?.name ?? null,
    artistName: playback.item?.artists.map((a) => a.name).join(', ') ?? null,
    albumName: playback.item?.album.name ?? null,
    albumArt: playback.item?.album.images[0]?.url ?? null,
    progressMs: playback.progress_ms,
    durationMs: playback.item?.duration_ms ?? null,
    volume: playback.device.volume_percent,
    shuffle: playback.shuffle_state,
    repeat: playback.repeat_state,
    deviceName: playback.device.name,
    deviceType: playback.device.type,
  };
}

export function mapIdleState(entryId: string): MusicPlayerState {
  return {
    type: 'music_player',
    id: `spotify.${entryId}.player`,
    name: 'Spotify',
    integration: 'spotify',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    playing: false,
    trackName: null,
    artistName: null,
    albumName: null,
    albumArt: null,
    progressMs: null,
    durationMs: null,
    volume: null,
    shuffle: false,
    repeat: 'off',
    deviceName: null,
    deviceType: null,
  };
}
