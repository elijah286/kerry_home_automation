import { WebPlugin } from '@capacitor/core';
import type { WakeWordPlugin } from './definitions';

/** Used on web and as a fallback until native wake-word code is added. */
export class WakeWordWeb extends WebPlugin implements WakeWordPlugin {
  async startListening(): Promise<void> {
    console.warn(
      '[WakeWord] Stub only — implement native Porcupine (or similar) for always-on listening on kiosks.',
    );
  }

  async stopListening(): Promise<void> {}
}
