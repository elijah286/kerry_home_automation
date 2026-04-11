// ---------------------------------------------------------------------------
// Bravia API responses → MediaPlayerState
// ---------------------------------------------------------------------------

import type { MediaPlayerState } from '@ha/shared';
import type { PowerStatus, BraviaVolume, BraviaInput, BraviaPlayingContent } from './bravia-api.js';

export interface BraviaSnapshot {
  power: PowerStatus;
  volume: BraviaVolume | null;
  inputs: BraviaInput[];
  playing: BraviaPlayingContent | null;
}

export function mapState(
  host: string,
  model: string,
  entryId: string,
  snapshot: BraviaSnapshot,
): MediaPlayerState {
  const vol = snapshot.volume;
  const normalizedVolume = vol ? Math.round((vol.volume / vol.maxVolume) * 100) : 0;

  const currentSource = snapshot.playing?.title || snapshot.playing?.source || 'unknown';
  const sourceList = snapshot.inputs
    .filter((i) => i.connection)
    .map((i) => i.title || i.uri);

  return {
    type: 'media_player',
    id: `sony.${entryId}.main`,
    name: model,
    integration: 'sony',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    power: snapshot.power === 'active' ? 'on' : 'standby',
    volume: normalizedVolume,
    muted: vol?.mute ?? false,
    source: currentSource,
    sourceList,
    soundProgram: '',
    soundProgramList: [],
    zone: 'main',
    model,
    host,
  };
}
