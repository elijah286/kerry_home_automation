// ---------------------------------------------------------------------------
// Chat API: OpenAI or Anthropic (Claude) assistant with function calling
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { Automation, AutomationCreate, AutomationExecutionLog, AutomationUpdate, DeviceCommand, IntegrationId, UserRole } from '@ha/shared';
import { KNOWN_INTEGRATIONS, Permission, ROLE_PERMISSIONS } from '@ha/shared';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ContentBlockParam, MessageParam, Tool as AnthropicToolDef } from '@anthropic-ai/sdk/resources/messages.js';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { authenticate } from './auth.js';
import * as entryStore from '../db/integration-entry-store.js';
import { tryFastPath } from './chat-fast-path.js';
import {
  getPaprikaRecipesFromStore,
  isPaprikaConfigured,
  searchPaprikaRecipes,
} from '../lib/paprika-recipe-search.js';
import { getAggregatedCalendarFeeds, filterCalendarEventsInRange } from '../lib/calendar-feeds.js';
import {
  saveAutomationProposal,
  takeAutomationProposal,
  type PendingAutomationOp,
} from '../lib/chat-automation-proposals.js';
import { applyAutomationProposal } from '../lib/apply-automation-proposal.js';
import { apiKeyForActiveProvider, loadLlmRuntimeSettings } from './llm-config.js';

// ---------------------------------------------------------------------------
// Tool definitions for OpenAI function calling
// ---------------------------------------------------------------------------

const readTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_devices',
      description: 'List devices in the home automation system. Returns device ID, name, aliases, type, area, integration, state summary, and availability. Use this to get device IDs and current state after identifying devices from the inventory in the system prompt. Can filter by type, area, or integration for efficiency.',
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
      description:
        'Navigate the UI to a page — PRIMARY response tool for any "show/find/list/open" request. Always navigate first, then reply with one brief sentence. Paths: /devices, /cameras, /calendar, /settings, /integrations, /areas, /alarms, /settings/automations. Recipes: /recipes?uids=uid1,uid2,uid3 (use the navigatePath returned by search_recipes — this shows exactly the matched recipes), /recipes?open=<uid> (single recipe), /recipes (bare list). Devices: /devices?ids=id1,id2 (exact set from get_devices), /devices?type=<type>&area=<area> (filtered browse).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The UI path (may include query, e.g. /recipes?open=abc-123)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_recipes',
      description:
        "Search the user's Paprika recipe library (names, ingredients, directions, notes, source). Call whenever the user asks about recipes by ingredient, keyword, cuisine, or dish type. The result includes a navigatePath field — always call navigate_ui with that path immediately after. It encodes the exact UIDs of matches so the UI shows precisely those recipes. Never list results in chat. Reply with one brief sentence: 'Showing X pork-and-vegetable recipes — want to open one?' If zero matches, suggest broadening the search.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text, e.g. "chicken basil", "slow cooker", "pasta tomato"',
          },
          match_all_terms: {
            type: 'boolean',
            description:
              'If true (default), every significant word in the query must appear in the recipe (good for "chicken and basil"). If false, any word can match (broader).',
          },
          limit: { type: 'number', description: 'Max recipes to return (default 20, max 40)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current documentation, setup guides, or troubleshooting information. Use this when the user asks how to set up an integration and you want to find the latest official instructions or community guides.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch the text content of a web page. Use this after search_web to read the full content of a relevant documentation page or guide.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_events',
      description:
        'Read upcoming calendar events from ICS feeds synced in HomeOS (Temporal / Calendar). Use for questions about schedule, what is on the calendar, appointments, or events in the next days/weeks. Returns events per configured feed with start times and summaries.',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: {
            type: 'number',
            description: 'How many days forward from now to include (default 14, max 90)',
          },
          feed_label_contains: {
            type: 'string',
            description: 'Optional — only include feeds whose label contains this text (case-insensitive)',
          },
        },
      },
    },
  },
];

const automationChatTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_automations',
      description:
        'List HomeOS automations (triggers, conditions, actions). Requires Manage Automations permission. Use to answer questions about existing rules or to find automation IDs before editing.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_automation',
      description: 'Get one automation by ID including full definition. Requires Manage Automations permission.',
      parameters: {
        type: 'object',
        properties: {
          automation_id: { type: 'string', description: 'Automation id' },
        },
        required: ['automation_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_automation_run_history',
      description:
        'Recent automation execution history (runs, success/failure). Optionally filter to one automation. Requires Manage Automations permission.',
      parameters: {
        type: 'object',
        properties: {
          automation_id: { type: 'string', description: 'Optional — limit to this automation' },
          limit: { type: 'number', description: 'Max rows (default 25, max 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_automation_change',
      description:
        'Stage a create, update, or delete of an automation for later commit. Does NOT apply changes. Always returns a proposal_id and a human-readable summary. You MUST ask the user to confirm explicitly before calling commit_automation_change. Requires Manage Automations permission.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'], description: 'What to do' },
          automation: {
            type: 'object',
            description:
              'For create: full automation object with id, name, triggers[], actions[], optional conditions[], group, description, enabled, mode',
          },
          automation_id: { type: 'string', description: 'For update/delete: target automation id' },
          updates: {
            type: 'object',
            description:
              'For update: partial fields (name, group, description, enabled, mode, triggers, conditions, actions)',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commit_automation_change',
      description:
        'Apply a previously prepared automation change. Only call after the user clearly confirms (e.g. yes, proceed, confirm). Requires proposal_id from prepare_automation_change. Requires Manage Automations permission.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: { type: 'string', description: 'The proposal_id returned by prepare_automation_change' },
        },
        required: ['proposal_id'],
      },
    },
  },
];

const adminWriteTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_device_settings',
      description:
        'Update HomeOS metadata for a device (not integration bridge config). Use when the user asks to add nicknames, alternative names, or aliases so they can refer to the device with different wording later. Requires the device ID from get_devices. Prefer add_aliases to merge new names with existing ones. Use aliases only when replacing the entire list or clearing aliases (empty array). Admin only.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device ID from get_devices' },
          add_aliases: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Names to add; merged with existing aliases (case-insensitive dedupe). Use for "also call it X", "add Y as an alias", etc.',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description:
              'If provided, replaces the entire alias list. Use only when the user explicitly wants to set or clear the full list.',
          },
        },
        required: ['deviceId'],
      },
    },
  },
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

function hasPermission(role: UserRole, p: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(p);
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface ToolContext {
  userRole: UserRole;
  userId: string;
}

interface AutomationRow {
  id: string;
  name: string;
  group_name: string | null;
  description: string | null;
  enabled: boolean;
  mode: string;
  definition: { triggers: []; conditions: []; actions: [] };
  last_triggered: Date | null;
  created_at: Date;
  updated_at: Date;
}

function automationRowToApi(r: AutomationRow): Automation {
  return {
    id: r.id,
    name: r.name,
    group: r.group_name ?? undefined,
    description: r.description ?? undefined,
    enabled: r.enabled,
    mode: (r.mode as Automation['mode']) ?? 'single',
    triggers: r.definition.triggers ?? [],
    conditions: r.definition.conditions ?? [],
    actions: r.definition.actions ?? [],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    lastTriggered: r.last_triggered?.toISOString() ?? null,
  };
}

interface ExecutionRow {
  id: string;
  automation_id: string;
  triggered_at: Date;
  trigger_type: string;
  trigger_detail: Record<string, unknown> | null;
  conditions_passed: boolean;
  actions_executed: AutomationExecutionLog['actionsExecuted'];
  status: string;
  error: string | null;
  completed_at: Date | null;
}

function executionRowToApi(r: ExecutionRow): AutomationExecutionLog {
  return {
    id: r.id,
    automationId: r.automation_id,
    triggeredAt: r.triggered_at.toISOString(),
    triggerType: r.trigger_type,
    triggerDetail: r.trigger_detail ?? undefined,
    conditionsPassed: r.conditions_passed,
    actionsExecuted: r.actions_executed,
    status: r.status as AutomationExecutionLog['status'],
    error: r.error ?? undefined,
    completedAt: r.completed_at?.toISOString() ?? undefined,
  };
}

function buildPendingAutomationOp(
  args: Record<string, unknown>,
): { op: PendingAutomationOp; summary: string } | { error: string } {
  const action = String(args.action);
  if (action === 'create') {
    const raw = args.automation as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') return { error: 'create requires an automation object' };
    const id = raw.id != null ? String(raw.id) : '';
    const nm = raw.name != null ? String(raw.name) : '';
    const triggers = raw.triggers;
    const actions = raw.actions;
    if (!id || !nm || !Array.isArray(triggers) || !Array.isArray(actions)) {
      return { error: 'automation must include id, name, triggers (array), and actions (array)' };
    }
    const body: AutomationCreate = {
      id,
      name: nm,
      group: raw.group != null ? String(raw.group) : undefined,
      description: raw.description != null ? String(raw.description) : undefined,
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : undefined,
      mode: raw.mode as AutomationCreate['mode'],
      triggers: triggers as AutomationCreate['triggers'],
      conditions: Array.isArray(raw.conditions) ? (raw.conditions as AutomationCreate['conditions']) : undefined,
      actions: actions as AutomationCreate['actions'],
    };
    const summary = `Create automation "${nm}" (${id}): ${triggers.length} trigger(s), ${actions.length} action(s).`;
    return { op: { action: 'create', body }, summary };
  }
  if (action === 'update') {
    const id = args.automation_id != null ? String(args.automation_id) : '';
    const updates = args.updates as Record<string, unknown> | undefined;
    if (!id || !updates || typeof updates !== 'object') {
      return { error: 'update requires automation_id and updates object' };
    }
    if (Object.keys(updates).length === 0) return { error: 'updates must not be empty' };
    const body = updates as AutomationUpdate;
    const summary = `Update automation "${id}": ${Object.keys(updates).join(', ')}`;
    return { op: { action: 'update', id, body }, summary };
  }
  if (action === 'delete') {
    const id = args.automation_id != null ? String(args.automation_id) : '';
    if (!id) return { error: 'delete requires automation_id' };
    return { op: { action: 'delete', id }, summary: `Delete automation "${id}".` };
  }
  return { error: `Unknown action: ${action}` };
}

const automationPermissionTools = [
  'list_automations',
  'get_automation',
  'get_automation_run_history',
  'prepare_automation_change',
  'commit_automation_change',
];

async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  if (automationPermissionTools.includes(name) && !hasPermission(ctx.userRole, Permission.ManageAutomations)) {
    return {
      error:
        'Permission denied. Automation features require the "Manage Automations" permission for your role (Settings → Users / role permissions).',
    };
  }

  // Admin-only write tools
  const adminOnlyTools = [
    'send_command',
    'update_device_settings',
    'create_integration_entry',
    'update_integration_entry',
    'restart_integration',
    'ecobee_request_pin',
    'ecobee_exchange_token',
  ];
  if (adminOnlyTools.includes(name) && ctx.userRole !== 'admin') {
    return { error: 'Permission denied. This action requires admin privileges.' };
  }

  switch (name) {
    case 'get_devices': {
      const areaMap = await getAreaMap();
      let devices = stateStore.getAll();
      if (args.type) devices = devices.filter((d) => d.type === args.type);
      if (args.integration) devices = devices.filter((d) => d.integration === args.integration);
      if (args.area) {
        const areaLower = String(args.area).toLowerCase();
        const matchingAreaIds = [...areaMap.entries()]
          .filter(([, name]) => name.toLowerCase().includes(areaLower))
          .map(([id]) => id);
        devices = devices.filter((d) => d.userAreaId && matchingAreaIds.includes(d.userAreaId));
      }
      const deviceSummaries = devices.map((d) => {
        const summary: Record<string, unknown> = {
          id: d.id,
          name: d.displayName || d.name,
          type: d.type,
          integration: d.integration,
          available: d.available,
        };
        if (d.userAreaId) { const area = areaMap.get(d.userAreaId); if (area) summary.area = area; }
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
      const idList = deviceSummaries.map((d) => d.id as string).join(',');
      return {
        count: deviceSummaries.length,
        devices: deviceSummaries,
        navigatePath: deviceSummaries.length > 0 ? `/devices?ids=${encodeURIComponent(idList)}` : null,
        hint: deviceSummaries.length === 0
          ? 'No devices matched those filters.'
          : `Call navigate_ui with the navigatePath above — it contains the exact IDs of the ${deviceSummaries.length} matched devices. The UI will show precisely those devices with an "AI filtered" banner. Do NOT list them in chat; reply with one brief sentence instead.`,
      };
    }

    case 'get_device_state': {
      const device = stateStore.get(String(args.deviceId));
      if (!device) return { error: 'Device not found' };
      return device;
    }

    case 'update_device_settings': {
      const deviceId = String(args.deviceId);
      const device = stateStore.get(deviceId);
      if (!device) return { error: 'Device not found' };

      const addRaw = Array.isArray(args.add_aliases) ? args.add_aliases.map((a) => String(a).trim()).filter(Boolean) : [];
      const hasFullReplace = Array.isArray(args.aliases);
      const replaceRaw = hasFullReplace ? (args.aliases as unknown[]).map((a) => String(a).trim()) : [];

      if (!hasFullReplace && addRaw.length === 0) {
        return {
          error: 'Provide add_aliases (one or more strings to merge) or aliases (full replacement list, may be empty to clear).',
        };
      }

      const mergeDedupe = (base: string[], extra: string[]) => {
        const byLower = new Map<string, string>();
        for (const a of base) byLower.set(a.toLowerCase(), a);
        for (const a of extra) byLower.set(a.toLowerCase(), a);
        return [...byLower.values()];
      };

      let nextAliases: string[];
      if (hasFullReplace) {
        nextAliases = addRaw.length > 0 ? mergeDedupe(replaceRaw, addRaw) : replaceRaw;
      } else {
        let existing: string[] = [];
        try {
          const { rows } = await query<{ aliases: string[] | null }>(
            'SELECT COALESCE(aliases, \'{}\') as aliases FROM device_settings WHERE device_id = $1',
            [deviceId],
          );
          existing = rows[0]?.aliases?.length ? rows[0].aliases : device.aliases ?? [];
        } catch {
          existing = device.aliases ?? [];
        }
        nextAliases = mergeDedupe(existing, addRaw);
      }

      try {
        await query(
          `INSERT INTO device_settings (device_id, aliases, updated_at)
           VALUES ($1, $2::text[], NOW())
           ON CONFLICT (device_id) DO UPDATE SET
             aliases = EXCLUDED.aliases,
             updated_at = NOW()`,
          [deviceId, nextAliases],
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ deviceId, err }, 'update_device_settings failed');
        return { success: false, error: `Could not save aliases: ${message}` };
      }

      const updated = { ...device, aliases: nextAliases.length ? nextAliases : undefined };
      stateStore.update(updated);
      logger.info({ deviceId, aliasCount: nextAliases.length }, 'Device aliases updated via chat');

      return {
        success: true,
        message: `Updated aliases for "${device.displayName || device.name}".`,
        aliases: nextAliases,
      };
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

    case 'search_recipes': {
      const configured = await isPaprikaConfigured();
      if (!configured) {
        return {
          error:
            'Paprika is not configured in HomeOS. The user should add Paprika email/password under Integrations, then open the Recipes page once to sync.',
        };
      }
      const recipes = await getPaprikaRecipesFromStore();
      if (recipes.length === 0) {
        return {
          matches: [],
          totalInLibrary: 0,
          hint: 'Library cache is empty. Ask the user to open Recipes in HomeOS (Replicator) once to trigger a full sync, then try again.',
        };
      }
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 40);
      const matchAllTerms = args.match_all_terms !== false;
      const hits = searchPaprikaRecipes(recipes, String(args.query), {
        maxResults: limit,
        matchAllTerms,
      });
      const uidList = hits.map((h) => h.uid).join(',');
      return {
        totalInLibrary: recipes.length,
        matchCount: hits.length,
        matchAllTerms,
        matches: hits.map((h) => ({
          uid: h.uid,
          name: h.name,
          total_time: h.total_time,
          source: h.source,
          rating: h.rating,
        })),
        navigatePath: hits.length > 0 ? `/recipes?uids=${encodeURIComponent(uidList)}` : null,
        hint:
          hits.length === 0
            ? 'No recipes matched. Try fewer words, synonyms, or match_all_terms=false.'
            : `Call navigate_ui with the navigatePath above — it contains the exact UIDs of the ${hits.length} matches so the page shows precisely those recipes. Do NOT list them in chat; reply with one brief sentence instead.`,
      };
    }

    case 'search_web': {
      const q = encodeURIComponent(String(args.query));
      try {
        const res = await fetch(
          `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`,
          { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'HomeAutomationAssistant/1.0' } },
        );
        if (!res.ok) return { error: `Search failed (${res.status})` };
        const data = (await res.json()) as {
          AbstractText?: string;
          AbstractURL?: string;
          AbstractSource?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>;
          Results?: Array<{ Text?: string; FirstURL?: string }>;
        };

        const results: Array<{ title: string; url: string; snippet: string }> = [];

        if (data.AbstractText && data.AbstractURL) {
          results.push({ title: data.AbstractSource ?? 'Overview', url: data.AbstractURL, snippet: data.AbstractText });
        }

        for (const r of data.Results ?? []) {
          if (r.FirstURL && r.Text) results.push({ title: r.Text.split('\n')[0], url: r.FirstURL, snippet: r.Text });
          if (results.length >= 5) break;
        }

        for (const r of data.RelatedTopics ?? []) {
          if ('Topics' in r) continue; // skip category groupings
          if (r.FirstURL && r.Text) results.push({ title: r.Text.split('\n')[0].slice(0, 80), url: r.FirstURL, snippet: r.Text });
          if (results.length >= 6) break;
        }

        if (results.length === 0) {
          return { message: 'No results found. Try fetching a specific documentation URL directly.' };
        }

        return { results };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Search failed: ${message}` };
      }
    }

    case 'fetch_url': {
      const url = String(args.url);
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'HomeAutomationAssistant/1.0' },
        });
        if (!res.ok) return { error: `Fetch failed (${res.status})` };
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text')) return { error: 'URL did not return text content' };

        let text = await res.text();
        // Strip HTML tags
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{3,}/g, '\n\n')
          .trim();

        // Truncate to avoid token explosion
        const MAX_CHARS = 6000;
        const truncated = text.length > MAX_CHARS;
        return { url, content: text.slice(0, MAX_CHARS) + (truncated ? '\n\n[content truncated]' : '') };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Fetch failed: ${message}` };
      }
    }

    case 'get_calendar_events': {
      const days = Math.min(Math.max(Number(args.days_ahead) || 14, 1), 90);
      const fromMs = Date.now();
      const toMs = fromMs + days * 86400_000;
      const feeds = await getAggregatedCalendarFeeds();
      const labelFilter = args.feed_label_contains != null ? String(args.feed_label_contains) : undefined;
      const { feeds: filtered, range } = filterCalendarEventsInRange(feeds, fromMs, toMs, labelFilter);
      const totalEvents = filtered.reduce((n, f) => n + f.events.length, 0);
      return {
        range,
        daysAhead: days,
        totalEvents,
        feeds: filtered.map((f) => ({
          label: f.label,
          entryId: f.entryId,
          integration: f.integration,
          eventCount: f.events.length,
          events: f.events.map((e) => ({
            summary: e.summary,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            location: e.location,
          })),
        })),
        feedStatus: feeds.map((f) => ({
          label: f.label,
          fetchedAt: f.fetchedAt,
          error: f.error,
          storedEventCount: f.events.length,
        })),
      };
    }

    case 'list_automations': {
      const { rows } = await query<AutomationRow>(
        'SELECT * FROM automations ORDER BY group_name NULLS LAST, name',
      );
      return { automations: rows.map((r) => automationRowToApi(r)) };
    }

    case 'get_automation': {
      const { rows } = await query<AutomationRow>('SELECT * FROM automations WHERE id = $1', [
        String(args.automation_id),
      ]);
      if (rows.length === 0) return { error: 'Automation not found' };
      return { automation: automationRowToApi(rows[0]) };
    }

    case 'get_automation_run_history': {
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
      if (args.automation_id) {
        const { rows } = await query<ExecutionRow>(
          `SELECT * FROM automation_execution_log WHERE automation_id = $1 ORDER BY triggered_at DESC LIMIT $2`,
          [String(args.automation_id), limit],
        );
        return { executions: rows.map(executionRowToApi) };
      }
      const { rows } = await query<ExecutionRow>(
        `SELECT * FROM automation_execution_log ORDER BY triggered_at DESC LIMIT $1`,
        [limit],
      );
      return { executions: rows.map(executionRowToApi) };
    }

    case 'prepare_automation_change': {
      const built = buildPendingAutomationOp(args);
      if ('error' in built) return { error: built.error };
      const { op, summary } = built;

      if (op.action === 'create') {
        const { rows } = await query('SELECT id FROM automations WHERE id = $1', [op.body.id]);
        if (rows.length > 0) return { error: `An automation with id "${op.body.id}" already exists.` };
      } else {
        const { rows } = await query('SELECT id FROM automations WHERE id = $1', [op.id]);
        if (rows.length === 0) return { error: `Automation "${op.id}" not found.` };
      }

      try {
        const proposalId = saveAutomationProposal(ctx.userId, op, summary);
        return {
          status: 'pending_confirmation',
          proposal_id: proposalId,
          summary,
          instructions:
            'Ask the user to confirm this change explicitly. Only after they confirm, call commit_automation_change with this proposal_id.',
          expires_in_minutes: 15,
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { error: message };
      }
    }

    case 'commit_automation_change': {
      const proposalId = String(args.proposal_id);
      const pending = takeAutomationProposal(proposalId, ctx.userId);
      if (!pending) {
        return {
          error:
            'Invalid or expired proposal. Run prepare_automation_change again. Proposals expire after 15 minutes and are single-use.',
        };
      }
      try {
        const result = await applyAutomationProposal(pending.op);
        if (result.deleted && pending.op.action === 'delete') {
          return { success: true, deleted: true, message: `Deleted automation "${pending.op.id}".` };
        }
        return { success: true, automation: result.automation };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error({ proposalId, err: e }, 'commit_automation_change failed');
        return { success: false, error: message };
      }
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

    ring: `Ring doorbells and cameras connect via the Ring cloud API using a refresh token.

To set up:
1. The user needs to generate a refresh token using the ring-client-api authentication CLI that is already installed in this system
2. Run: npx -p ring-client-api ring-auth-cli from the HomeOS server terminal
3. This will prompt for the Ring account email, password, and 2FA code
4. It outputs a refresh token — the user should paste that token here
5. Only one Ring entry is needed (it discovers all doorbells and cameras on the account automatically)

IMPORTANT: Do NOT tell the user to install ring-client-api — it is already available. They just need to run the auth CLI command on the server to get their refresh token, then provide it here.`,
  };

  return instructions[id] ?? 'No specific setup instructions available. Check the integration documentation for configuration details.';
}

// ---------------------------------------------------------------------------
// Area lookup cache (small table, rarely changes)
// ---------------------------------------------------------------------------

let areaCache: Map<string, string> | null = null;
let areaCacheTime = 0;
const AREA_CACHE_TTL = 60_000; // 1 minute

async function getAreaMap(): Promise<Map<string, string>> {
  if (areaCache && Date.now() - areaCacheTime < AREA_CACHE_TTL) return areaCache;
  const { rows } = await query<{ id: string; name: string }>('SELECT id, name FROM areas');
  areaCache = new Map(rows.map((r) => [r.id, r.name]));
  areaCacheTime = Date.now();
  return areaCache;
}

// ---------------------------------------------------------------------------
// Build compact device inventory for the system prompt
// ---------------------------------------------------------------------------

const EXCLUDED_DEVICE_TYPES = new Set([
  'sun', 'weather', 'speedtest', 'screensaver', 'energy_monitor', 'energy_site',
  'water_softener', 'pool_chemistry', 'recipe_library', 'network_device', 'hub',
  'helper_sensor', 'helper_counter', 'helper_timer', 'helper_button',
  'helper_number', 'helper_text', 'helper_datetime', 'helper_select',
]);

function buildDeviceInventory(devices: ReturnType<typeof stateStore.getAll>, areaMap: Map<string, string>): string {
  const grouped = new Map<string, string[]>();

  for (const d of devices) {
    if (EXCLUDED_DEVICE_TYPES.has(d.type)) continue;
    const areaName = d.userAreaId ? areaMap.get(d.userAreaId) ?? 'Unassigned' : 'Unassigned';
    if (!grouped.has(areaName)) grouped.set(areaName, []);
    const name = d.displayName || d.name;
    const aliases = d.aliases?.length ? ` [${d.aliases.join(', ')}]` : '';
    grouped.get(areaName)!.push(`- ${name} (${d.type}) [id:${d.id}]${aliases}`);
  }

  const sections: string[] = [];
  // Sort areas alphabetically, but put Unassigned last
  const sortedAreas = [...grouped.keys()].sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  for (const area of sortedAreas) {
    const lines = grouped.get(area)!;
    sections.push(`### ${area}\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Build dynamic system prompt
// ---------------------------------------------------------------------------

async function buildSystemPrompt(user: { username: string; role: UserRole }): Promise<string> {
  const devices = stateStore.getAll();
  const areaMap = await getAreaMap();
  const health = registry.getHealthAll();

  const deviceCounts: Record<string, number> = {};
  for (const d of devices) {
    deviceCounts[d.type] = (deviceCounts[d.type] || 0) + 1;
  }

  const activeIntegrations = Object.entries(health)
    .filter(([, h]) => h.state === 'connected')
    .map(([id]) => id);

  const canManageAutomations = hasPermission(user.role, Permission.ManageAutomations);
  const roleDesc =
    user.role === 'admin'
      ? 'You have full admin access — you can control devices, manage integrations, create/edit entries, and change settings.'
      : canManageAutomations
        ? 'You are a non-admin user with **Manage Automations**: you can inspect and change automations using the two-step proposal flow, but admin-only tools (typical device control, integration entry management, device aliases) are not available unless you are an admin.'
        : 'You have read-only access — you can view devices and status but cannot control devices or change settings. If the user tries to do something that requires admin, let them know they need admin privileges.';

  return `You are the built-in AI assistant for HomeOS — a custom home automation platform built specifically for the Kerry household. You are NOT Home Assistant, SmartThings, or any other third-party platform. HomeOS is a bespoke system with its own integrations, device model, and UI.

## What HomeOS is
HomeOS is a self-hosted platform that aggregates smart home devices across multiple vendor integrations (Lutron, Meross, Yamaha, Tesla, UniFi, Ecobee, Rachio, Ring, Wyze, Pentair, Spotify, and others). Each integration runs as a bridge inside HomeOS and syncs device state into a central Postgres-backed state store. The frontend is a React/Next.js dashboard.

## What you can do
- Check device status, state history, and availability across all integrations
- Answer **calendar and schedule** questions using get_calendar_events (ICS feeds synced from the Calendar integration — Temporal in LCARS)
- Control devices (lights, fans, switches, covers, media players, vacuum, sprinklers, garage doors, vehicles) — admin only
- Add or replace **device aliases** (alternative names for matching voice/chat requests) via update_device_settings — admin only. This is separate from integration entry config.
- **Automations** — if the user's role includes Manage Automations (you will have list/get/prepare/commit tools): list and inspect rules, and propose create/update/delete using prepare_automation_change, then commit_automation_change **only after the user explicitly confirms**. If those tools are missing or return permission errors, the user needs an admin to grant "Manage Automations" for their role.
- Navigate the HomeOS UI to any section
- Help set up new integrations by walking the user through the required config
- Search the web and read documentation pages to find the latest setup instructions for any integration or device
- Manage integration entries (create, update, restart) — admin only. Use this for bridge credentials and integration config, **not** for renaming devices or adding device nicknames (use update_device_settings for aliases).

## What you are NOT
- You are not Home Assistant and have no access to Home Assistant concepts (automations.yaml, integrations.yaml, HA add-ons, HA entities, Supervisor, etc.)
- You are not a general-purpose voice assistant — focus on the home and this system
- Do not reference HACS, HA config entries, HA UI flows, or any HA-specific terminology

## Current session
User: ${user.username} (role: ${user.role})
Manage Automations permission: ${canManageAutomations ? 'yes' : 'no'}
${roleDesc}

## Live system state
- Total devices: ${devices.length}
- Device types: ${Object.entries(deviceCounts).map(([t, c]) => `${t} (${c})`).join(', ')}
- Active integrations: ${activeIntegrations.join(', ') || 'none'}

## Device inventory
This is the complete list of controllable devices in the system, grouped by area. Use this to identify devices when the user refers to them by name.
${buildDeviceInventory(devices, areaMap)}

## DEVICE RESOLUTION RULES — follow these strictly
1. The Device Inventory above contains every device with its **[id:xxx]** — use these IDs directly. Do NOT call get_devices just to look up an ID you already have.
2. Exactly one inventory match → use its ID, call send_command immediately. No confirmation needed.
3. Multiple inventory matches → list them briefly and ask which one.
4. Zero inventory matches → tell the user the device was not found. Do NOT guess or fabricate. Suggest similar names if possible.
5. Only call get_devices when you need CURRENT STATE (e.g. "is the light on?", "what's the brightness?") — not for IDs.
6. For bulk operations ("turn off all kitchen lights") → use the IDs directly from the inventory for each matching device, send_command for each in parallel.
7. On confirmation ("yes", "go ahead", etc.) → execute immediately, no follow-up questions.
8. Command fails → retry once, then report the error concisely.
9. Confirm AFTER acting, not before. Be concise: "Done — turned on Patio Flood."
10. To add or change **device aliases**, call update_device_settings with add_aliases (merge) or aliases (full replace). Never use update_integration_entry for device names.

## Calendar
- Use **get_calendar_events** for upcoming events, schedule, and "what is on the calendar". Respect days_ahead. If feeds report errors or empty data, explain (feeds sync from the Calendar integration; user may need to open Calendar or refresh the integration).

## Automations (HomeOS native — not Home Assistant)
- **Never** claim to edit automations.yaml or HA automations.
- If you have automation tools: use list_automations / get_automation to answer questions. To change anything: (1) prepare_automation_change with a clear summary, (2) ask the user to confirm explicitly, (3) only then commit_automation_change with the returned proposal_id. Do not commit without clear user confirmation.
- Automation definitions use triggers (time, device_state, sun, manual), optional conditions, and actions (device_command, delay, etc.). Prefer small, testable changes.

## UI-First Interaction Protocol — follow this strictly for every response

The HomeOS UI is your primary output surface. The chat window is for brief confirmations, clarifying questions, and errors — NOT for displaying data that the UI can show.

### The rule
**Navigate first, then say one sentence.** If a page exists that can show the requested information, call navigate_ui immediately. Your chat reply should be ≤ 2 sentences: what you did + one offer to refine.

### When to navigate (don't list in chat)
| User intent | Action |
|---|---|
| Find/show/list recipes by any criteria | search_recipes → navigate_ui with the returned navigatePath (/recipes?uids=...) |
| Open a specific recipe | navigate_ui /recipes?open=<uid> |
| Show/find/list devices by type, area, or any criteria | get_devices → navigate_ui with the returned navigatePath (/devices?ids=...) |
| Browse all devices | navigate_ui /devices |
| Show cameras | navigate_ui /cameras |
| Show calendar / schedule | navigate_ui /calendar |
| Show automations | navigate_ui /settings/automations |
| Go to settings, integrations, areas, alarms | navigate_ui <path> |

### When to respond in chat (don't navigate)
- Single-fact status: "Is the garage open?", "What's the thermostat set to?" → answer directly, no navigation
- Action confirmation: "Done — turned off the patio lights." (≤1 sentence)
- Error or failure explanation
- Clarifying question when intent is ambiguous
- Follow-up refinement after user responds to your offer

### Never do these
- Never list more than 3 items in chat when a UI page can show them
- Never show a recipe list in chat — always call navigate_ui with the navigatePath from search_recipes
- Never use /recipes?q=<keyword> — that re-runs a dumb keyword search; use ?uids= instead
- Never dump a device list in chat — call get_devices then navigate_ui with the returned navigatePath
- Never use /devices?type= or /devices?area= for filtered results — get_devices returns a navigatePath with exact IDs; use that
- Never say "Here are the results:" followed by a long list

### Chat reply format after navigating
✓ "Showing 4 pork-and-vegetable recipes — want to open one?"
✓ "Navigated to Cameras."
✗ Never: "Here are 20 chicken recipes: 1. Chicken Parm... 2. Butter Chicken..."

## Paprika / recipes
- Recipe library is Paprika, synced into HomeOS under **Recipes**. Always call search_recipes for ingredient/keyword queries.
- After search_recipes: use the navigatePath field in the result — it's /recipes?uids=... with the exact matched UIDs. Call navigate_ui with that path. The UI will show precisely those recipes with an "AI filtered" banner.
- For one specific recipe: navigate_ui /recipes?open=<uid>.

## Navigation
navigate_ui paths: /devices?ids=id1,id2 (exact), /devices?type=X&area=Y (browse), /cameras, /calendar, /settings, /integrations, /areas, /alarms, /recipes, /settings/automations, /recipes?uids=uid1,uid2 (exact AI results), /recipes?open=<uid>.

## Integration setup guidelines
- When a user asks to set up an integration, call get_integration_setup_info first.
- If the setup info includes a setupUrl, give the user a clickable markdown link and tell them exactly what to do there.
- For any integration where the setup process is unclear, or when the user asks HOW to do something (e.g. "how do I get a refresh token"), use search_web to find the latest official docs or community guide, then use fetch_url to read the best result. Always include a direct clickable link to the source.
- List the specific values you'll need (e.g. "I'll need your Client ID and Refresh Token").
- One actionable step at a time. Format as a numbered list with bold step titles.
- Once the user provides all values, offer to configure it automatically via create_integration_entry, then restart_integration immediately after.
- Always cite sources with clickable markdown links when using web search.`;
}

// ---------------------------------------------------------------------------
// Build tool list based on user role
// ---------------------------------------------------------------------------

function getToolsForRole(role: UserRole): ChatCompletionTool[] {
  const tools = [...readTools];
  if (hasPermission(role, Permission.ManageAutomations)) {
    tools.push(...automationChatTools);
  }
  if (role === 'admin') {
    tools.push(...adminWriteTools);
  }
  return tools;
}

function openAiToolsToAnthropic(tools: ChatCompletionTool[]): AnthropicToolDef[] {
  const out: AnthropicToolDef[] = [];
  for (const t of tools) {
    if (t.type !== 'function' || !t.function) continue;
    out.push({
      name: t.function.name,
      description: t.function.description ?? '',
      input_schema: t.function.parameters as AnthropicToolDef['input_schema'],
    });
  }
  return out;
}

function clientMessagesToAnthropic(
  msgs: Array<{ role: string; content: string }>,
): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: m.content });
    }
  }
  return out;
}

type AnthropicChatOutcome =
  | { ok: true; reply: string; navigate?: string }
  | { ok: false; status: number; error: string };

async function runAnthropicChatWithTools(opts: {
  anthropic: Anthropic;
  model: string;
  systemPrompt: string;
  conversation: Array<{ role: string; content: string }>;
  tools: ChatCompletionTool[];
  toolCtx: ToolContext;
  username: string;
}): Promise<AnthropicChatOutcome> {
  const anthropicTools = openAiToolsToAnthropic(opts.tools);
  let messages = clientMessagesToAnthropic(opts.conversation);
  let navigateTo: string | undefined;
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      const msg = await opts.anthropic.messages.create({
        model: opts.model,
        max_tokens: 8192,
        temperature: 0.3,
        system: opts.systemPrompt,
        messages,
        tools: anthropicTools,
      });

      const textParts: string[] = [];
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: (typeof block.input === 'object' && block.input !== null
              ? (block.input as Record<string, unknown>)
              : {}),
          });
        }
      }

      if (toolUses.length === 0) {
        return { ok: true, reply: textParts.join(''), ...(navigateTo ? { navigate: navigateTo } : {}) };
      }

      messages.push({
        role: 'assistant',
        content: msg.content as unknown as ContentBlockParam[],
      });

      const toolResultBlocks: ContentBlockParam[] = [];
      for (const tu of toolUses) {
        logger.info({ tool: tu.name, args: tu.input, user: opts.username }, 'Chat tool call');
        const result = await executeTool(tu.name, tu.input, opts.toolCtx);
        if (tu.name === 'navigate_ui' && typeof result === 'object' && result !== null && 'navigate' in result) {
          navigateTo = (result as { navigate: string }).navigate;
        }
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResultBlocks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Anthropic chat completion error');
      return { ok: false, status: 500, error: `LLM error: ${message}` };
    }
  }

  return { ok: false, status: 500, error: 'Too many tool call iterations' };
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
      const llmSettings = await loadLlmRuntimeSettings();
      const active = apiKeyForActiveProvider(llmSettings);

      if (!active) {
        const err =
          llmSettings.provider === 'anthropic'
            ? 'Anthropic API key not configured. Go to Settings → LLM Integration to add one.'
            : 'OpenAI API key not configured. Go to Settings → LLM Integration to add one.';
        return reply.code(400).send({ error: err });
      }

      // --- Fast path: handle simple device commands without LLM ---
      const lastMessage = req.body.messages.at(-1);
      if (lastMessage?.role === 'user' && req.body.messages.length === 1) {
        const fast = await tryFastPath(lastMessage.content, user.role);
        if (fast.handled) {
          return { reply: fast.reply ?? 'Done.' };
        }
      }

      const tools = getToolsForRole(user.role);
      const toolCtx: ToolContext = { userRole: user.role, userId: user.id };
      const systemPrompt = await buildSystemPrompt(user);
      const conversation = req.body.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      if (active.kind === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: active.key });
        const outcome = await runAnthropicChatWithTools({
          anthropic,
          model: llmSettings.anthropicModel,
          systemPrompt,
          conversation,
          tools,
          toolCtx,
          username: user.username,
        });
        if (!outcome.ok) return reply.code(outcome.status).send({ error: outcome.error });
        return {
          reply: outcome.reply,
          ...(outcome.navigate ? { navigate: outcome.navigate } : {}),
        };
      }

      const openai = new OpenAI({ apiKey: active.key });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversation.map((m) => ({
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
            model: llmSettings.openaiModel,
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
    const llmSettings = await loadLlmRuntimeSettings();
    const active = apiKeyForActiveProvider(llmSettings);

    if (!active) {
      const err =
        llmSettings.provider === 'anthropic'
          ? 'Anthropic API key not configured'
          : 'OpenAI API key not configured';
      return reply.code(400).send({ error: err });
    }

    try {
      if (active.kind === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: active.key });
        const msg = await anthropic.messages.create({
          model: llmSettings.anthropicModel,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        });
        const text =
          msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
        return { ok: true, provider: 'anthropic', model: msg.model, response: text };
      }

      const openai = new OpenAI({ apiKey: active.key });
      const completion = await openai.chat.completions.create({
        model: llmSettings.openaiModel,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      return { ok: true, provider: 'openai', model: completion.model, response: text };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'LLM test connection failed');
      return reply.code(400).send({ error: message });
    }
  });
}
