import type { CapacitorConfig } from '@capacitor/cli';

/**
 * CAPACITOR_SERVER_URL — Set to your HomeOS server address (e.g. http://192.168.1.10:3001).
 * When set, the native shell loads the live Next.js server instead of a bundled static export.
 * This is the recommended mode for wall-mounted kiosks — updates are instant, no app rebuild needed.
 *
 * Example:
 *   CAPACITOR_SERVER_URL=http://10.0.0.5:3001 npx cap run android
 *   CAPACITOR_SERVER_URL=http://10.0.0.5:3001 npm run build:mobile:sync
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config: CapacitorConfig = {
  appId: 'com.ha.dashboard',
  appName: 'Home Automation',
  webDir: 'out',

  // Kiosk display settings
  backgroundColor: '#000000',

  android: {
    allowMixedContent: true,
    captureInput: true,
    overScrollBehavior: 'none',
  } as any,

  ios: {
    scrollBounce: false,
    allowsLinkPreview: false,
  } as any,

  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
    },
  },

  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
          allowNavigation: [serverUrl.replace(/^https?:\/\//, '')],
        },
      }
    : {}),
};

export default config;
