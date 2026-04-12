// ---------------------------------------------------------------------------
// Integration configuration types
// ---------------------------------------------------------------------------

import type { IntegrationId } from './devices.js';

export interface IntegrationInfo {
  id: IntegrationId;
  name: string;
  description: string;
  /** Does this integration provide devices? */
  providesDevices: boolean;
  /** Config fields the user needs to fill in */
  configFields: ConfigField[];
  /** Allow multiple credential entries (e.g. Tesla vehicles + energy sites) */
  supportsMultipleEntries?: boolean;
  /** URL where the user can obtain credentials or API keys */
  setupUrl?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  /** Default value for the field */
  defaultValue?: string;
}

/** A single credential entry for a multi-entry integration */
export interface IntegrationEntry {
  id: string;
  integration: IntegrationId;
  label: string;
  config: Record<string, string>;
  enabled: boolean;
}

/** All known integrations with their config schemas */
export const KNOWN_INTEGRATIONS: IntegrationInfo[] = [
  {
    id: 'lutron',
    name: 'Lutron Caseta',
    description: 'Caseta Pro smart lighting, fans, shades, and switches via LEAP protocol',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.100', required: true },
      { key: 'port', label: 'TLS Port', type: 'number', placeholder: '8081' },
    ],
  },
  {
    id: 'yamaha',
    name: 'Yamaha MusicCast',
    description: 'Yamaha AV receivers and wireless speakers via MusicCast HTTP API',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Receiver IP', type: 'text', placeholder: '192.168.1.50', required: true },
    ],
  },
  {
    id: 'paprika',
    name: 'Paprika 3',
    description: 'Recipe management, meal planning, and grocery lists via Paprika sync API',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'your@email.com', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  {
    id: 'pentair',
    name: 'Pentair IntelliCenter',
    description: 'Pool and spa automation — pumps, heaters, lights, chemistry via IntelliCenter',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'IntelliCenter IP', type: 'text', placeholder: '192.168.1.200', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '6680' },
    ],
  },
  {
    id: 'tesla',
    name: 'Tesla',
    description: 'Vehicles and energy sites via Tesla Fleet API',
    providesDevices: true,
    supportsMultipleEntries: true,
    setupUrl: 'https://github.com/AlandRak/auth-for-tesla',
    configFields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'your@email.com', required: true },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
      { key: 'include_vehicles', label: 'Include Vehicles', type: 'checkbox', defaultValue: 'true' },
      { key: 'include_energy_sites', label: 'Include Energy Sites', type: 'checkbox', defaultValue: 'true' },
    ],
  },
  {
    id: 'unifi',
    name: 'UniFi Protect',
    description: 'Ubiquiti cameras via UniFi Protect — streams via go2rtc',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'go2rtc_url', label: 'go2rtc URL', type: 'text', placeholder: 'http://localhost:1984', required: true },
      { key: 'protect_host', label: 'UniFi Protect IP', type: 'text', placeholder: '192.168.1.1' },
    ],
  },
  {
    id: 'sony',
    name: 'Sony Bravia',
    description: 'Sony Bravia TVs via IP Control REST API with Pre-Shared Key auth',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'TV IP', type: 'text', placeholder: '192.168.1.120', required: true },
      { key: 'psk', label: 'Pre-Shared Key', type: 'password', placeholder: '0000', required: true },
    ],
  },
  {
    id: 'weather',
    name: 'Weather (NWS)',
    description: 'Local weather conditions and forecast via National Weather Service API',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'latitude', label: 'Latitude', type: 'text', placeholder: '37.7749', required: true },
      { key: 'longitude', label: 'Longitude', type: 'text', placeholder: '-122.4194', required: true },
      { key: 'label', label: 'Location Name', type: 'text', placeholder: 'Home' },
    ],
  },
  {
    id: 'xbox',
    name: 'Xbox',
    description: 'Xbox console control via SmartGlass REST API — power, media, app launching',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Xbox IP', type: 'text', placeholder: '192.168.1.50', required: true },
      { key: 'live_id', label: 'Xbox Live Device ID', type: 'text', placeholder: 'FD00000000000000' },
    ],
  },
  {
    id: 'meross',
    name: 'Meross',
    description: 'Meross smart devices via local LAN control — garage doors, sensors',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Device IP', type: 'text', placeholder: '192.168.1.60', required: true },
      { key: 'key', label: 'Device Key', type: 'password', required: true },
      { key: 'device_type', label: 'Device Type', type: 'text', placeholder: 'MSG100 or MS100', required: true },
    ],
  },
  {
    id: 'roborock',
    name: 'Roborock',
    description: 'Roborock robot vacuums via local miIO protocol',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Vacuum IP', type: 'text', placeholder: '192.168.1.70', required: true },
      { key: 'token', label: 'Device Token', type: 'password', placeholder: '32-character hex token', required: true },
    ],
  },
  {
    id: 'rachio',
    name: 'Rachio',
    description: 'Rachio smart sprinkler controllers via cloud API',
    providesDevices: true,
    supportsMultipleEntries: false,
    setupUrl: 'https://app.rach.io/login',
    configFields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'From my.rachio.com', required: true },
    ],
  },
  {
    id: 'ecobee',
    name: 'Ecobee',
    description: 'Ecobee smart thermostats — temperature, humidity, occupancy, and remote sensors',
    providesDevices: true,
    supportsMultipleEntries: false,
    setupUrl: 'https://www.ecobee.com/consumerportal/index.html#/my-apps',
    configFields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'From ecobee developer portal', required: true },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
    ],
  },
  {
    id: 'esphome',
    name: 'ESPHome',
    description: 'ESP8266/ESP32 devices running ESPHome firmware via native API',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Device IP', type: 'text', placeholder: '192.168.1.80', required: true },
      { key: 'password', label: 'API Password', type: 'password' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '6053' },
    ],
  },
  {
    id: 'wyze',
    name: 'Wyze',
    description: 'Wyze cameras, sensors, and smart plugs via Wyze cloud API',
    providesDevices: true,
    supportsMultipleEntries: false,
    setupUrl: 'https://developer-api-console.wyze.com/#/apikey/view',
    configFields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'your@email.com', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
      { key: 'key_id', label: 'API Key ID', type: 'text', required: true },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    id: 'zwave',
    name: 'Z-Wave (ZwaveJS)',
    description: 'Z-Wave devices via ZwaveJS2MQTT / Z-Wave JS UI WebSocket API',
    providesDevices: true,
    supportsMultipleEntries: false,
    configFields: [
      { key: 'ws_url', label: 'WebSocket URL', type: 'text', placeholder: 'ws://localhost:3000', required: true },
    ],
  },
  {
    id: 'ring',
    name: 'Ring',
    description: 'Ring doorbells and security cameras via Ring cloud API',
    providesDevices: true,
    supportsMultipleEntries: false,
    configFields: [
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', placeholder: 'From ring-client-api auth', required: true },
    ],
  },
  {
    id: 'sun',
    name: 'Sun',
    description: 'Solar position, sunrise/sunset times, and daylight tracking via SunCalc',
    providesDevices: true,
    supportsMultipleEntries: false,
    configFields: [
      { key: 'latitude', label: 'Latitude', type: 'text', placeholder: '37.7749', required: true },
      { key: 'longitude', label: 'Longitude', type: 'text', placeholder: '-122.4194', required: true },
      { key: 'label', label: 'Location Name', type: 'text', placeholder: 'Home' },
    ],
  },
  {
    id: 'speedtest',
    name: 'Speedtest',
    description: 'Periodic internet speed tests via Speedtest CLI',
    providesDevices: true,
    supportsMultipleEntries: false,
    configFields: [
      { key: 'interval_minutes', label: 'Test Interval (min)', type: 'number', placeholder: '60', defaultValue: '60' },
      { key: 'server_id', label: 'Server ID (optional)', type: 'text', placeholder: 'Auto-select' },
    ],
  },
  {
    id: 'unifi_network',
    name: 'UniFi Network',
    description: 'UniFi network infrastructure — APs, switches, gateways, and connected clients',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'Controller URL', type: 'text', placeholder: 'https://192.168.1.1', required: true },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
      { key: 'site', label: 'Site', type: 'text', placeholder: 'default', defaultValue: 'default' },
    ],
  },
  {
    id: 'vizio',
    name: 'Vizio SmartCast',
    description: 'Vizio TVs via SmartCast local API — power, volume, input control',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'TV IP', type: 'text', placeholder: '192.168.1.130', required: true },
      { key: 'auth_token', label: 'Auth Token', type: 'password', required: true },
    ],
  },
  {
    id: 'samsung',
    name: 'Samsung Smart TV',
    description: 'Samsung Tizen smart TVs via WebSocket remote control',
    providesDevices: true,
    supportsMultipleEntries: true,
    configFields: [
      { key: 'host', label: 'TV IP', type: 'text', placeholder: '192.168.1.140', required: true },
      { key: 'token', label: 'Token (auto-generated)', type: 'password' },
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Spotify playback control and now-playing status via Spotify Web API',
    providesDevices: true,
    supportsMultipleEntries: false,
    setupUrl: 'https://developer.spotify.com/dashboard',
    configFields: [
      { key: 'client_id', label: 'Client ID', type: 'text', required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
    ],
  },
  {
    id: 'gamechanger',
    name: 'GameChanger',
    description:
      'Import games and practices on your calendar via an iCal / webcal subscription URL from the GameChanger app (Team → Schedule → Subscribe).',
    providesDevices: false,
    supportsMultipleEntries: true,
    setupUrl: 'https://gc.com/',
    configFields: [
      { key: 'ical_url', label: 'Calendar (ICS) URL', type: 'password', placeholder: 'https://… or webcal://…', required: true },
      { key: 'label', label: 'Label', type: 'text', placeholder: 'Team name', required: true },
    ],
  },
  {
    id: 'sportsengine',
    name: 'SportsEngine',
    description:
      'Import team schedule events via an iCal subscription URL from your SportsEngine / Sports Connect calendar (calendar export / subscribe).',
    providesDevices: false,
    supportsMultipleEntries: true,
    setupUrl: 'https://www.sportsengine.com/',
    configFields: [
      { key: 'ical_url', label: 'Calendar (ICS) URL', type: 'password', placeholder: 'https://… or webcal://…', required: true },
      { key: 'label', label: 'Label', type: 'text', placeholder: 'Team name', required: true },
    ],
  },
  {
    id: 'rainsoft',
    name: 'RainSoft Remind',
    description:
      'RainSoft EC5 water softener status via the RainSoft Remind cloud (same service as the mobile app). Uses your Remind account — not a documented local API.',
    providesDevices: true,
    supportsMultipleEntries: true,
    setupUrl: 'https://remind.rainsoft.com/',
    configFields: [
      { key: 'email', label: 'Remind Email', type: 'text', placeholder: 'your@email.com', required: true },
      { key: 'password', label: 'Remind Password', type: 'password', required: true },
      { key: 'device_id', label: 'Device ID (optional)', type: 'text', placeholder: 'Leave blank to use first device on account' },
    ],
  },
  {
    id: 'helpers',
    name: 'Helpers',
    description: 'User-defined virtual devices — toggles, counters, timers, sensors, and more. Configured via Settings > Helpers.',
    providesDevices: true,
    supportsMultipleEntries: false,
    configFields: [],
  },
  {
    id: 'sense',
    name: 'Sense',
    description:
      'Sense home energy monitor — real-time whole-home power, solar, and voltage via the Sense cloud API (email login).',
    providesDevices: true,
    supportsMultipleEntries: false,
    setupUrl: 'https://sense.com/',
    configFields: [
      { key: 'email', label: 'Sense Email', type: 'text', placeholder: 'your@email.com', required: true },
      { key: 'password', label: 'Sense Password', type: 'password', required: true },
    ],
  },
];
