// ---------------------------------------------------------------------------
// Chat API: OpenAI-powered assistant with function calling
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { DeviceCommand, IntegrationId, UserRole } from '@ha/shared';
import { KNOWN_INTEGRATIONS } from '@ha/shared';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate } from './auth.js';
import * as entryStore from '../db/integration-entry-store.js';

// ---------------------------------------------------------------------------
// Tool definitions for OpenAI function calling
// ---------------------------------------------------------------------------

const readTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_devices',
      description: 'List devices in the home automation system. Can filter by type, area, or integration. Returns device ID, name, aliases (alternative names), type, state summary, and availability. Match user requests against name, displayName, AND aliases.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Filter by device type (e.g. light, switch, media_player, sensor, vacuum, etc.)' },
          integration: { type: 'string', description: 'Filter by integration ID (e.g. lutron, yamaha, tesla, unifi)' },
          area: { type: 'string', description: 'Filter by area name (case-insensitive partial match)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_state',
      description: 'Get the full current state of a specific device by its ID. Returns all state properties.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'The device ID' },
        },
        required: ['deviceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_history',
      description: 'Get recent state history for a device. Returns timestamped state changes.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          limit: { type: 'number', description: 'Max records to return (default 20, max 100)' },
        },
        required: ['deviceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_integrations',
      description: 'List all integrations and their health/connection status. Also shows which integrations are available to configure and their required config fields.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_integration_entries',
      description: 'List configured entries (instances) for a specific integration. Shows their labels, enabled status, and config (passwords masked).',
      parameters: {
        type: 'object',
        properties: {
          integration: { type: 'string', description: 'Integration ID (e.g. meross, lutron, tesla)' },
        },
        required: ['integration'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_integration_setup_info',
      description: 'Get detailed setup instructions for an integration — what config fields are required, their types, and example values. Use this when helping a user set up or pair a new integration.',
      parameters: {
        type: 'object',
        properties: {
          integration: { type: 'string', description: 'Integration ID (e.g. meross, lutron, tesla)' },
        },
        required: ['integration'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_ui',
      description: 'Navigate the user interface to a specific page. Use this when the user asks to see something or go to a page. Valid paths: /devices, /cameras, /settings, /integrations, /areas, /alarms, /recipes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The UI path to navigate to' },
        },
        required: ['path'],
      },
    },
  },
];

const writeTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_command',
      description: 'Send a command to control a device. You must know the device ID, type, and valid action. For lights: turn_on, turn_off, set_brightness (with brightness 0-100). For switches: turn_on, turn_off. For covers: open, close, set_position. For fans: turn_on, turn_off, set_speed. For media_player: power_on, power_off, set_volume (0-100), mute, unmute, set_source, media_play, media_pause. For garage_door: open, close. For vacuum: start, stop, pause, return_dock. For sprinkler: start_zone (with zoneId, duration), stop.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          type: { type: 'string', description: 'Device type (light, switch, cover, fan, media_player, vehicle, garage_door, sprinkler, vacuum, etc.)' },
          action: { type: 'string', description: 'The action to perform' },
          brightness: { type: 'number', description: 'For light set_brightness (0-100)' },
          volume: { type: 'number', description: 'For media_player set_volume (0-100)' },
          position: { type: 'number', description: 'For cover set_position (0-100)' },
          source: { type: 'string', description: 'For media_player set_source' },
          speed: { type: 'string', description: 'For fan set_speed' },
          zoneId: { type: 'string', description: 'For sprinkler start_zone' },
          duration: { type: 'number', description: 'Duration in seconds for sprinkler' },
        },
        required: ['deviceId', 'type', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_integration_entry',
      description: 'Create a new integration entry (instance). Use this to help users add a new device/service to an integration. Requires admin role. After creating, the integration will automatically restart to pick up the new entry.',
      parameters: {
        type: 'object',
        properties: {
          integration: { type: 'string', description: 'Integration ID (e.g. meross, lutron, tesla)' },
          label: { type: 'string', description: 'A friendly label for this entry (e.g. "Garage Door Opener", "Living Room Bridge")' },
          config: {
            type: 'object',
            description: 'Config values as key-value pairs. Keys must match the integration\'s configFields. All values are strings.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['integration', 'label', 'config'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_integration_entry',
      description: 'Update an existing integration entry. Can change its label, config values, or enable/disable it. Requires admin role.',
      parameters: {
        type: 'object',
        properties: {
          entryId: { type: 'string', description: 'The entry UUID to update' },
          integration: { type: 'string', description: 'Integration ID' },
          label: { type: 'string', description: 'New label (optional)' },
          config: {
            type: 'object',
            description: 'Config values to update (partial update — omitted keys keep existing values)',
            additionalProperties: { type: 'string' },
          },
          enabled: { type: 'boolean', description: 'Enable or disable the entry' },
        },
        required: ['entryId', 'integration'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restart_integration',
      description: 'Restart an integration to pick up config changes or recover from errors. Requires admin role.',
      parameters: {
        type: 'object',
        properties: {
          integration: { type: 'string', description: 'Integration ID' },
        },
        required: ['integration'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ecobee_request_pin',
      description: 'Request an ecobee PIN code for OAuth authorization. Takes the API key from the user\'s ecobee developer app and returns a 4-character PIN that the user must enter at ecobee.com to authorize access. Also returns an authorization code needed for the token exchange. Requires admin role.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'The API key from the ecobee developer app' },
        },
        required: ['apiKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ecobee_exchange_token',
      description: 'Exchange an ecobee authorization code for access and refresh tokens. Call this AFTER the user has entered the PIN on ecobee.com and authorized the app. Returns the refresh_token needed to configure the integration entry. Requires admin role.',
      parameters: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'The same API key used in ecobee_request_pin' },
          code: { type: 'string', description: 'The authorization code returned by ecobee_request_pin' },
        },
        required: ['apiKey', 'code'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface ToolContext {
  userRole: UserRole;
}

async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  // Write tools require admin
  const adminOnlyTools = ['send_command', 'create_integration_entry', 'update_integration_entry', 'restart_integration', 'ecobee_request_pin', 'ecobee_exchange_token'];
  if (adminOnlyTools.includes(name) && ctx.userRole !== 'admin') {
    return { error: 'Permission denied. This action requires admin privileges.' };
  }

  switch (name) {
    case 'get_devices': {
      let devices = stateStore.getAll();
      if (args.type) devices = devices.filter((d) => d.type === args.type);
      if (args.integration) devices = devices.filter((d) => d.integration === args.integration);
      if (args.area) {
        const areaLower = String(args.area).toLowerCase();
        const { rows: areaRows } = await query<{ id: string; name: string }>('SELECT id, name FROM areas');
        const matchingAreaIds = areaRows
          .filter((a) => a.name.toLowerCase().includes(areaLower))
          .map((a) => a.id);
        devices = devices.filter((d) => d.userAreaId && matchingAreaIds.includes(d.userAreaId));
      }
      return devices.map((d) => {
        const summary: Record<string, unknown> = {
          id: d.id,
          name: d.displayName || d.name,
          type: d.type,
          integration: d.integration,
          available: d.available,
        };
        if (d.aliases?.length) summary.aliases = d.aliases;
        if (d.type === 'light') { summary.on = d.on; summary.brightness = d.brightness; }
        else if (d.type === 'switch') { summary.on = d.on; }
        else if (d.type === 'fan') { summary.on = d.on; summary.speed = d.speed; }
        else if (d.type === 'cover') { summary.position = d.position; }
        else if (d.type === 'media_player') { summary.power = d.power; summary.volume = d.volume; summary.source = d.source; }
        else if (d.type === 'sensor') { summary.value = d.value; summary.unit = d.unit; summary.sensorType = d.sensorType; }
        else if (d.type === 'garage_door') { summary.open = d.open; summary.opening = d.opening; summary.closing = d.closing; }
        else if (d.type === 'vacuum') { summary.status = d.status; summary.battery = d.battery; }
        else if (d.type === 'sprinkler') { summary.running = d.running; summary.currentZone = d.currentZone; }
        return summary;
      });
    }

    case 'get_device_state': {
      const device = stateStore.get(String(args.deviceId));
      if (!device) return { error: 'Device not found' };
      return device;
    }

    case 'send_command': {
      const cmd = {
        deviceId: String(args.deviceId),
        type: String(args.type),
        action: String(args.action),
        ...(args.brightness != null && { brightness: Number(args.brightness) }),
        ...(args.volume != null && { volume: Number(args.volume) }),
        ...(args.position != null && { position: Number(args.position) }),
        ...(args.source != null && { source: String(args.source) }),
        ...(args.speed != null && { speed: String(args.speed) }),
        ...(args.zoneId != null && { zoneId: String(args.zoneId) }),
        ...(args.duration != null && { duration: Number(args.duration) }),
      } as DeviceCommand;
      try {
        await registry.handleCommand(cmd);
        return { success: true, message: `Command ${args.action} sent to ${args.deviceId}` };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    }

    case 'get_device_history': {
      const limit = Math.min(Number(args.limit) || 20, 100);
      try {
        const { rows } = await query<{ state: Record<string, unknown>; changed_at: Date }>(
          'SELECT state, changed_at FROM state_history WHERE device_id = $1 ORDER BY changed_at DESC LIMIT $2',
          [String(args.deviceId), limit],
        );
        return rows.map((r) => ({ state: r.state, changedAt: r.changed_at }));
      } catch {
        return { error: 'Failed to fetch history' };
      }
    }

    case 'get_integrations': {
      const health = registry.getHealthAll();
      return KNOWN_INTEGRATIONS.map((info) => ({
        id: info.id,
        name: info.name,
        providesDevices: info.providesDevices,
        supportsMultipleEntries: info.supportsMultipleEntries,
        configFields: info.configFields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
        health: health[info.id] ?? { state: 'unknown' },
      }));
    }

    case 'get_integration_entries': {
      const id = String(args.integration) as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return { error: `Unknown integration: ${id}` };

      const entries = await entryStore.getEntries(id);
      // Mask passwords
      for (const entry of entries) {
        for (const field of info.configFields) {
          if (field.type === 'password' && entry.config[field.key]) {
            entry.config[field.key] = '••••••••';
          }
        }
      }
      return { integration: id, entries };
    }

    case 'get_integration_setup_info': {
      const id = String(args.integration) as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return { error: `Unknown integration: ${id}` };

      return {
        id: info.id,
        name: info.name,
        providesDevices: info.providesDevices,
        supportsMultipleEntries: info.supportsMultipleEntries,
        setupUrl: info.setupUrl ?? null,
        configFields: info.configFields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          placeholder: f.placeholder,
          required: f.required,
          defaultValue: f.defaultValue,
        })),
        instructions: getIntegrationInstructions(id),
      };
    }

    case 'create_integration_entry': {
      const id = String(args.integration) as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return { error: `Unknown integration: ${id}` };

      // Validate required fields
      const config = (args.config ?? {}) as Record<string, string>;
      if (typeof config !== 'object' || config === null) {
        return { error: `Config must be an object with key-value pairs. Required fields for ${info.name}: ${info.configFields.filter(f => f.required).map(f => `${f.key} (${f.label})`).join(', ')}` };
      }
      const missing = info.configFields
        .filter((f) => f.required && !config[f.key])
        .map((f) => f.label);
      if (missing.length > 0) {
        return { error: `Missing required config fields: ${missing.join(', ')}. You must include a "config" object with these keys. Example: config: { ${info.configFields.filter(f => f.required).map(f => `"${f.key}": "${f.placeholder ?? '...'}"` ).join(', ')} }` };
      }

      const entryId = crypto.randomUUID();
      await entryStore.saveEntry({
        id: entryId,
        integration: id,
        label: String(args.label),
        config,
        enabled: true,
      });
      logger.info({ integration: id, entryId }, 'Integration entry created via chat');

      // Auto-restart
      try { await registry.restart(id); } catch (err) {
        logger.error({ integration: id, err }, 'Auto-restart after chat entry create failed');
      }

      return { success: true, entryId, message: `Created entry "${args.label}" for ${info.name}. Integration restarted.` };
    }

    case 'update_integration_entry': {
      const id = String(args.integration) as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return { error: `Unknown integration: ${id}` };

      const existing = await entryStore.getEntry(String(args.entryId));
      if (!existing) return { error: 'Entry not found' };

      const mergedConfig = { ...existing.config };
      if (args.config) {
        for (const [key, value] of Object.entries(args.config as Record<string, string>)) {
          if (value !== '••••••••') mergedConfig[key] = value;
        }
      }

      await entryStore.saveEntry({
        ...existing,
        label: args.label != null ? String(args.label) : existing.label,
        config: mergedConfig,
        enabled: args.enabled != null ? Boolean(args.enabled) : existing.enabled,
      });
      logger.info({ integration: id, entryId: args.entryId }, 'Integration entry updated via chat');

      try { await registry.restart(id); } catch (err) {
        logger.error({ integration: id, err }, 'Auto-restart after chat entry update failed');
      }

      return { success: true, message: `Updated entry "${existing.label}" for ${info.name}. Integration restarted.` };
    }

    case 'restart_integration': {
      const id = String(args.integration) as IntegrationId;
      try {
        await registry.restart(id);
        return { success: true, message: `${id} integration restarted.` };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    }

    case 'navigate_ui': {
      return { navigate: String(args.path) };
    }

    case 'ecobee_request_pin': {
      const apiKey = String(args.apiKey);
      try {
        const res = await fetch(
          `https://api.ecobee.com/authorize?response_type=ecobeePin&client_id=${encodeURIComponent(apiKey)}&scope=smartWrite`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) {
          const text = await res.text();
          return { error: `Ecobee authorize failed (${res.status}): ${text}` };
        }
        const data = (await res.json()) as { ecobeePin: string; code: string; expires_in: number };
        return {
          pin: data.ecobeePin,
          code: data.code,
          expiresInMinutes: Math.round(data.expires_in / 60),
          nextStep: 'Tell the user to go to https://www.ecobee.com/consumerportal/index.html#/my-apps, click "Add Application", enter the PIN, and click "Authorize". Then call ecobee_exchange_token with the apiKey and this code.',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to request ecobee PIN: ${message}` };
      }
    }

    case 'ecobee_exchange_token': {
      const apiKey = String(args.apiKey);
      const code = String(args.code);
      try {
        const res = await fetch('https://api.ecobee.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'ecobeePin',
            code,
            client_id: apiKey,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          const text = await res.text();
          return { error: `Ecobee token exchange failed (${res.status}): ${text}. The user may not have authorized the PIN yet — ask them to confirm they completed that step.` };
        }
        const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
        return {
          refreshToken: data.refresh_token,
          nextStep: 'Now use create_integration_entry with integration "ecobee", providing the api_key and this refresh_token in the config.',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to exchange ecobee token: ${message}` };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Integration-specific setup instructions
// ---------------------------------------------------------------------------

function getIntegrationInstructions(id: string): string {
  const instructions: Record<string, string> = {
    meross: `Meross devices connect via local network using the device's IP address and key.

To find the required values:
1. Open the Meross app on your phone
2. Go to the device you want to add and tap the gear icon
3. Note the device's IP address from your router's DHCP client list, or use the Meross app's device info
4. The Device Key can be found by sniffing the initial pairing traffic or using the meross-iot Python library to extract it
5. Device Type is printed on the device label (e.g. MSG100 for garage door opener, MSS310 for smart plug, MS100 for sensor)

Common device types:
- MSG100: Smart Garage Door Opener
- MSS310: Smart Plug with Energy Monitor
- MSS110: Smart Plug
- MS100: Temperature/Humidity Sensor
- MSL120: Smart Light Bulb`,

    lutron: `Lutron Caseta Pro connects via the LEAP protocol over TCP.

To set up:
1. You need a Lutron Caseta Smart Bridge Pro (L-BDGPRO2-WH) — the standard bridge does NOT work
2. Find the bridge's IP address on your router's DHCP client list
3. The default port is 8081 for the LEAP protocol
4. On first connection, you may need to press the button on the bridge to pair`,

    tesla: `Tesla connects via the Tesla Fleet API using a refresh token.

To set up:
1. Generate a refresh token using the Tesla auth flow (tesla_auth tool or similar)
2. Enter your Tesla account email and the refresh token
3. Enable vehicles and/or energy sites as needed`,

    yamaha: `Yamaha MusicCast receivers connect via HTTP on the local network.

To set up:
1. Find the receiver's IP address on your router or in the MusicCast app
2. Enter the IP address — the default port (80) is used automatically`,

    unifi: `UniFi Protect connects via go2rtc for camera streaming.

To set up:
1. Install and configure go2rtc with your UniFi Protect cameras
2. Enter the go2rtc URL (e.g. http://localhost:1984)
3. Enter your UniFi Protect controller hostname/IP`,

    rachio: `Rachio sprinkler controllers connect via the Rachio cloud API.

To set up:
1. Log in at https://app.rach.io and go to Account Settings
2. Click "Get API Key" and copy it
3. Provide the API key here`,

    ecobee: `Ecobee thermostats connect via the Ecobee cloud API using OAuth.

IMPORTANT: You have tools (ecobee_request_pin, ecobee_exchange_token) to automate the hard parts. Walk the user through this step by step:

Step 1 — Create a Developer App (user does this):
- Direct the user to: https://www.ecobee.com/consumerportal/index.html#/my-apps
- They must log in with their ecobee account
- Click "Create New" in the Developer section
- Enter any app name (e.g. "Home Automation")
- Set Authorization Method to "ecobee PIN"
- After creating, the app page shows an API Key — ask the user to paste it to you

Step 2 — Request a PIN (you do this):
- Once you have the API key, call the ecobee_request_pin tool with it
- It returns a 4-character PIN and an authorization code (save the code for step 3)
- Tell the user the PIN, then direct them to: https://www.ecobee.com/consumerportal/index.html#/my-apps
- They click "Add Application" on My Apps page, enter the PIN, and click "Authorize"
- Ask the user to confirm when they have completed this

Step 3 — Exchange for Tokens (you do this):
- After the user confirms authorization, call ecobee_exchange_token with the apiKey and code
- This returns the refresh_token
- Use create_integration_entry to save both api_key and refresh_token

The authorization code expires in about 10 minutes, so guide them promptly through steps 2-3.`,

    wyze: `Wyze connects via the Wyze cloud API using your account credentials and an API key.

To set up:
1. Go to https://developer-api-console.wyze.com/#/apikey/view
2. Create a new API key — note the Key ID and API Key
3. Provide your Wyze email, password, Key ID, and API Key here`,

    spotify: `Spotify connects via the Spotify Web API using OAuth.

To set up:
1. Go to https://developer.spotify.com/dashboard and create an app
2. Note the Client ID and Client Secret
3. Use the Spotify OAuth flow to obtain a refresh token with the required scopes
4. Provide the Client ID, Client Secret, and Refresh Token here`,
  };

  return instructions[id] ?? 'No specific setup instructions available. Check the integration documentation for configuration details.';
}

// ---------------------------------------------------------------------------
// Build dynamic system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(user: { username: string; role: UserRole }): string {
  const devices = stateStore.getAll();
  const health = registry.getHealthAll();

  const deviceCounts: Record<string, number> = {};
  for (const d of devices) {
    deviceCounts[d.type] = (deviceCounts[d.type] || 0) + 1;
  }

  const activeIntegrations = Object.entries(health)
    .filter(([, h]) => h.state === 'connected')
    .map(([id]) => id);

  const roleDesc = user.role === 'admin'
    ? 'You have full admin access — you can control devices, manage integrations, create/edit entries, and change settings.'
    : 'You have read-only access — you can view devices and status but cannot control devices or change settings. If the user tries to do something that requires admin, let them know they need admin privileges.';

  return `You are a helpful home automation assistant for the Kerry household. You can check device status, view history, and navigate the UI.

Current user: ${user.username} (role: ${user.role})
${roleDesc}

Current system overview:
- Total devices: ${devices.length}
- Device types: ${Object.entries(deviceCounts).map(([t, c]) => `${t} (${c})`).join(', ')}
- Active integrations: ${activeIntegrations.join(', ') || 'none'}

DEVICE RESOLUTION RULES — follow these strictly:
1. When the user refers to a device, match their words against the device name, displayName, AND aliases (alternative names). Use case-insensitive partial/fuzzy matching. For example, "patio fans" matches "Patio Patio Fans", "flood lights" matches a device with alias "flood lights".
2. If exactly ONE device matches, act on it immediately — do NOT ask for confirmation. Just execute the command and report what you did.
3. If MULTIPLE devices match, list them briefly and ask which one. Do not list devices that clearly don't match.
4. When the user confirms ("yes", "yeah", "do it", "go ahead") or provides clarification, execute the action immediately. Never respond to a confirmation by asking about settings, connections, or configuration — just do the thing.
5. If a command fails, retry once. Only then report the error concisely and suggest checking the device.
6. Always confirm what you did AFTER acting, not before. Be concise: "Done — turned on Patio Flood." not a paragraph.

When the user asks to "show" or "go to" something, use the navigate_ui tool.

Integration setup guidelines:
- When a user asks to set up an integration, call get_integration_setup_info first.
- If the setup info includes a setupUrl, give the user a clickable link and tell them exactly what to do there (e.g. "create an app", "copy the API key").
- List the specific values you'll need from them (e.g. "I'll need your API Key and Refresh Token").
- Keep each step short and actionable — one thing at a time.
- Once the user provides all required values, offer to configure it automatically using create_integration_entry. If they prefer, offer to navigate them to the integrations page instead.
- After creating an entry, automatically call restart_integration so it connects immediately.
- Format setup steps as a numbered list with bold step titles for readability.`;
}

// ---------------------------------------------------------------------------
// Build tool list based on user role
// ---------------------------------------------------------------------------

function getToolsForRole(role: UserRole): ChatCompletionTool[] {
  if (role === 'admin') return [...readTools, ...writeTools];
  return readTools;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerChatRoutes(app: FastifyInstance): void {
  app.post<{ Body: { messages: Array<{ role: string; content: string }> } }>(
    '/api/chat',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const user = req.user!;

      // Load API key from system settings
      const { rows } = await query<{ value: unknown }>(
        "SELECT value FROM system_settings WHERE key = 'llm_api_key'",
      );
      const apiKey = rows[0]?.value as string | undefined;
      if (!apiKey) {
        return reply.code(400).send({ error: 'OpenAI API key not configured. Go to Settings → LLM Integration to add one.' });
      }

      const openai = new OpenAI({ apiKey });
      const tools = getToolsForRole(user.role);
      const toolCtx: ToolContext = { userRole: user.role };

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: buildSystemPrompt(user) },
        ...req.body.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      let navigateTo: string | undefined;

      // Tool call loop — keep calling until we get a final text response
      const MAX_ITERATIONS = 10;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            tools,
            temperature: 0.3,
          });

          const choice = completion.choices[0];
          if (!choice) {
            return reply.code(500).send({ error: 'No response from LLM' });
          }

          const msg = choice.message;

          // If no tool calls, we have the final response
          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            return {
              reply: msg.content || '',
              ...(navigateTo && { navigate: navigateTo }),
            };
          }

          // Execute tool calls
          messages.push(msg);

          for (const toolCall of msg.tool_calls) {
            if (!('function' in toolCall) || !toolCall.function) continue;
            const fn = toolCall.function;
            const args = JSON.parse(fn.arguments);
            logger.info({ tool: fn.name, args, user: user.username }, 'Chat tool call');
            const result = await executeTool(fn.name, args, toolCtx);

            // Capture navigation instructions
            if (fn.name === 'navigate_ui' && typeof result === 'object' && result !== null && 'navigate' in result) {
              navigateTo = (result as { navigate: string }).navigate;
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ err }, 'Chat completion error');
          return reply.code(500).send({ error: `LLM error: ${message}` });
        }
      }

      return reply.code(500).send({ error: 'Too many tool call iterations' });
    },
  );

  // Test connection — verify the API key works by making a minimal API call
  app.post('/api/chat/test', { preHandler: [authenticate] }, async (_req, reply) => {
    const { rows } = await query<{ value: unknown }>(
      "SELECT value FROM system_settings WHERE key = 'llm_api_key'",
    );
    const apiKey = rows[0]?.value as string | undefined;
    if (!apiKey) {
      return reply.code(400).send({ error: 'No API key configured' });
    }

    try {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      return { ok: true, model: completion.model, response: text };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'LLM test connection failed');
      return reply.code(400).send({ error: message });
    }
  });
}
