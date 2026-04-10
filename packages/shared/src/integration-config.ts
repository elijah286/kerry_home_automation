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
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  required?: boolean;
}

/** All known integrations with their config schemas */
export const KNOWN_INTEGRATIONS: IntegrationInfo[] = [
  {
    id: 'lutron',
    name: 'Lutron Caseta',
    description: 'Caseta Pro smart lighting, fans, shades, and switches via LEAP protocol',
    providesDevices: true,
    configFields: [
      { key: 'hosts', label: 'Bridge IPs', type: 'text', placeholder: '192.168.1.100,192.168.1.101', required: true },
    ],
  },
  {
    id: 'yamaha',
    name: 'Yamaha MusicCast',
    description: 'Yamaha AV receivers and wireless speakers via MusicCast HTTP API',
    providesDevices: true,
    configFields: [
      { key: 'hosts', label: 'Receiver IPs', type: 'text', placeholder: '192.168.1.50,192.168.1.51', required: true },
    ],
  },
  {
    id: 'paprika',
    name: 'Paprika 3',
    description: 'Recipe management, meal planning, and grocery lists via Paprika sync API',
    providesDevices: false,
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
    configFields: [
      { key: 'host', label: 'IntelliCenter IP', type: 'text', placeholder: '192.168.1.200', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '6680' },
    ],
  },
  {
    id: 'tesla',
    name: 'Tesla',
    description: 'Powerwall battery and solar monitoring via Tesla Fleet API',
    providesDevices: true,
    configFields: [
      { key: 'gateway_host', label: 'Gateway IP', type: 'text', placeholder: '192.168.1.150' },
      { key: 'access_token', label: 'Access Token', type: 'password' },
    ],
  },
];
