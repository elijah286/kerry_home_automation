import { registerPlugin } from '@capacitor/core';
import type { WakeWordPlugin } from './definitions';

export const WakeWord = registerPlugin<WakeWordPlugin>('WakeWord', {
  web: () => import('./web').then((m) => new m.WakeWordWeb()),
});

export type { WakeWordPlugin } from './definitions';
