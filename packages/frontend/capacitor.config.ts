import type { CapacitorConfig } from '@capacitor/cli';

/**
 * When set (e.g. `http://192.168.1.10:3001`), the native shell loads the Next dev/prod server
 * instead of bundled `webDir` — avoids static-export limits on dynamic routes and matches Docker `standalone`.
 * Example: `CAPACITOR_SERVER_URL=http://10.0.0.5:3001 npx cap run android`
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.ha.dashboard',
  appName: 'Home Automation',
  webDir: 'out',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
