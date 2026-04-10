// ---------------------------------------------------------------------------
// MusicCast status → MediaPlayerState
// ---------------------------------------------------------------------------

import type { MediaPlayerState } from '@ha/shared';

export function mapStatus(
  host: string,
  model: string,
  zone: string,
  status: Record<string, unknown>,
): MediaPlayerState {
  const power = String(status.power ?? 'off');
  const rawVol = typeof status.volume === 'number' ? status.volume : 0;
  const maxVol = typeof status.max_volume === 'number' ? status.max_volume : 161;
  const volume = Math.round((rawVol / maxVol) * 100);
  const muted = Boolean(status.mute);
  const source = String(status.input ?? 'unknown');
  const soundProgram = String(status.sound_program ?? '');

  const sourceList = Array.isArray(status.input_list)
    ? (status.input_list as Array<{ id?: string }>).map((i) => String(i.id ?? i))
    : [];

  const soundProgramList = Array.isArray(status.sound_program_list)
    ? (status.sound_program_list as unknown[]).map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object' && 'name' in x) return String((x as { name: string }).name);
        return String(x);
      })
    : [];

  const suffix = zone === 'main' ? '' : `_${zone}`;
  const slug = host.replace(/\./g, '_').toLowerCase();

  return {
    type: 'media_player',
    id: `yamaha.${slug}${suffix}`,
    name: `${model}${suffix ? ` ${zone}` : ''}`,
    integration: 'yamaha',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    power: power === 'on' ? 'on' : 'standby',
    volume,
    muted,
    source,
    sourceList,
    soundProgram,
    soundProgramList,
    zone,
    model,
    host,
  };
}
