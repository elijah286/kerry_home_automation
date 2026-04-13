import type { PluginListenerHandle } from '@capacitor/core';

/** Replace the Web stub with native Porcupine (or similar) by registering the same appId `WakeWord`. */
export interface WakeWordPlugin {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  addListener(
    eventName: 'wakeWordDetected',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}
