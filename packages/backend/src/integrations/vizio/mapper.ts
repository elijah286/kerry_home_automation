// ---------------------------------------------------------------------------
// Vizio SmartCast state → MediaPlayerState
// ---------------------------------------------------------------------------

import type { MediaPlayerState } from '@ha/shared';
import type { VizioInputItem } from './smartcast-client.js';

export function mapVizioState(
  entryId: string,
  host: string,
  power: number,
  volume: number,
  input: string,
  inputList: VizioInputItem[],
): MediaPlayerState {
  const isOn = power === 1;

  return {
    type: 'media_player',
    id: `vizio.${entryId}.tv`,
    name: 'Vizio SmartCast TV',
    integration: 'vizio',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    power: isOn ? 'on' : 'standby',
    volume,
    muted: false,
    source: input,
    sourceList: inputList.map((i) => i.name),
    soundProgram: '',
    soundProgramList: [],
    zone: 'main',
    model: 'Vizio SmartCast',
    host,
  };
}
