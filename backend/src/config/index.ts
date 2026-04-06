import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  readOnly: process.env.READONLY_MODE !== '0',
  api: {
    port: parseInt(process.env.API_PORT ?? '3001', 10),
    host: process.env.API_HOST ?? '0.0.0.0',
  },
  ws: {
    port: parseInt(process.env.WS_PORT ?? '3002', 10),
    host: process.env.WS_HOST ?? '0.0.0.0',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://ha_user:ha_dev_password@localhost:5432/home_automation',
  },
  mqtt: {
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME ?? undefined,
    password: process.env.MQTT_PASSWORD ?? undefined,
  },
  ha: {
    host: process.env.HA_HOST ?? '192.168.68.203',
  },
  zwave: {
    url: process.env.ZWAVE_WS_URL ?? 'ws://192.168.68.203:3000',
  },
  lutron: {
    bridges: [
      process.env.LUTRON_BRIDGE_1_HOST,
      process.env.LUTRON_BRIDGE_2_HOST,
    ].filter(Boolean) as string[],
  },
  go2rtc: {
    url: process.env.GO2RTC_URL ?? 'http://192.168.68.203:1984',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'ha-dev-secret-change-me',
    expiry: process.env.JWT_EXPIRY ?? '7d',
  },
  location: {
    lat: parseFloat(process.env.HOME_LATITUDE ?? '30.2672'),
    lon: parseFloat(process.env.HOME_LONGITUDE ?? '-97.7431'),
  },
  paprika: {
    email: process.env.PAPRIKA_EMAIL ?? '',
    password: process.env.PAPRIKA_PASSWORD ?? '',
  },
} as const;
