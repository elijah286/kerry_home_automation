// ---------------------------------------------------------------------------
// Chat API: OpenAI or Anthropic (Claude) assistant with function calling
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { Automation, AutomationCreate, AutomationExecutionLog, AutomationUpdate, DeviceCommand, DeviceState, IntegrationId, UserRole } from '@ha/shared';
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
  getPaprikaMealsFromStore,
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
import { apiKeyFor, loadLlmRuntimeSettings, type TtsVoice } from './llm-config.js';
import { extractSentences, stripMarkdownForTts, synthesizeSentence } from './tts.js';
import { effectiveUiPreferences, mergeUserPreferences } from '../lib/ui-preferences.js';
import { VALID_UI_THEME_IDS, type ValidUiThemeId } from '@ha/shared';
import { loadChatHistory, saveChatMessage, cleanupOldMessages } from './chat-history.js';

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
      name: 'set_theme',
      description: 'Change the active UI theme for the current user. Takes effect immediately across all of HomeOS — the browser does not need to refresh. Use this whenever the user asks to switch, change, set, or try a theme (e.g. "change the theme to lcars", "switch to dark mode", "make it forest"). Valid theme IDs: default, midnight, glass, forest, rose, slate, ocean, amber, lcars. Map natural phrases to IDs: "dark"/"night" → midnight, "light"/"default" → default, "star trek"/"lcars" → lcars. After the tool succeeds, reply with ONE short sentence confirming the change — do not list other themes.',
      parameters: {
        type: 'object',
        properties: {
          theme: {
            type: 'string',
            enum: ['default', 'midnight', 'glass', 'forest', 'rose', 'slate', 'ocean', 'amber', 'lcars'],
            description: 'The theme ID to activate.',
          },
        },
        required: ['theme'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_ui',
      description:
        'Navigate the UI to a page — PRIMARY response tool for any "show/find/list/open" request. Always navigate first, then reply with one brief sentence. Paths: /devices, /cameras, /calendar, /settings, /integrations, /areas, /alarms, /settings/automations. Recipes: /recipes?uids=uid1,uid2,uid3 (use the navigatePath returned by search_recipes — this shows exactly the matched recipes), /recipes?open=<uid> (single recipe), /recipes (bare list). Devices: /devices?ids=id1,id2 (exact set from get_devices), /devices?type=<type>&area=<area> (filtered browse). Cameras: /cameras?open=<cameraName> opens a specific camera in fullscreen (use the device name from get_devices of type camera, e.g. "living_room", "driveway", "front_porch") — use this for "show me / fullscreen / open the X camera" requests.',
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
  {
    type: 'function',
    function: {
      name: 'manage_timer',
      description:
        'Create, start, pause, resume, reset, or delete a kitchen/cooking timer. The timer runs in the browser (the user sees it in the Timers sidebar) — this tool instructs the UI to perform the action. For "start a 9 minute timer for the pasta", action="start", label="Pasta", seconds=540. For natural speech, parse the duration: "9 minutes" → seconds=540, "1 hour 30 min" → seconds=5400, "45 sec" → seconds=45. Come up with a concise label from the user\'s phrasing ("for the pasta" → "Pasta", "boil eggs" → "Eggs"). For stop/pause/resume/reset/delete, use list_timers first to get the timer id unless the user gave exactly one timer name.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'pause', 'resume', 'reset', 'delete'],
            description: 'What to do. "start" creates a new timer and starts it. Others need a timer_id.',
          },
          label: {
            type: 'string',
            description: 'For action=start: short label (e.g. "Pasta", "Eggs"). Title case, under 24 chars. Required for start.',
          },
          seconds: {
            type: 'number',
            description: 'For action=start: total duration in seconds. Required for start.',
          },
          timer_id: {
            type: 'string',
            description: 'For pause/resume/reset/delete: the id of the target timer (from list_timers).',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_alarms',
      description:
        'List all alarms/wake-up schedules configured in HomeOS. Each alarm has id, name, time (HH:MM), daysOfWeek (0=Sun..6=Sat), enabled, and devices (list of wake actions like turning on a light or opening a blind). Use to answer "what alarms do I have" or to find an alarm id for update/delete.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_alarm',
      description:
        'Create a new alarm/wake-up schedule. IMPORTANT: before calling this, you should know HOW the user wants to be woken (which device should activate). If they haven\'t said, ASK FIRST — e.g. "Sure, at 8 AM tomorrow. How should I wake you? I can turn on a light, open a blind, play a media player, or just create the alarm without any wake action." Only call with empty devices if the user explicitly says "no action" or "just remind me". Time is HH:MM (24-hour). daysOfWeek is an array of 0-6 (0=Sun, 6=Sat). For "tomorrow at 8am", compute tomorrow\'s day-of-week from today (in your system context) and pass that single day. For recurring, pass multiple days. Devices is an array of {deviceId, action, params} — use get_devices first to find IDs.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short alarm name like "Wake up" or "Morning alarm"' },
          time: { type: 'string', description: '24-hour time HH:MM (e.g. "08:00", "06:30")' },
          daysOfWeek: {
            type: 'array',
            items: { type: 'number' },
            description: 'Days to fire: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat. Example: [1,2,3,4,5] for weekdays, [6] for just Saturday.',
          },
          enabled: { type: 'boolean', description: 'Enabled by default. Set false to create disabled.' },
          devices: {
            type: 'array',
            description: 'Wake actions — list of {deviceId, action, params}. action examples: "turn_on", "open", "set_brightness". params: optional per-action object like {brightness: 80}.',
            items: {
              type: 'object',
              properties: {
                deviceId: { type: 'string' },
                action: { type: 'string' },
                params: { type: 'object' },
              },
              required: ['deviceId', 'action'],
            },
          },
        },
        required: ['name', 'time', 'daysOfWeek'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_alarm',
      description: 'Delete an existing alarm by id. Call list_alarms first to resolve the id from a name.',
      parameters: {
        type: 'object',
        properties: { alarm_id: { type: 'string' } },
        required: ['alarm_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_alarm',
      description: 'Update an existing alarm — change time, days, enabled state, or wake devices. Only include fields you want to change. Call list_alarms first if you need the id.',
      parameters: {
        type: 'object',
        properties: {
          alarm_id: { type: 'string' },
          name: { type: 'string' },
          time: { type: 'string', description: 'HH:MM 24-hour' },
          daysOfWeek: { type: 'array', items: { type: 'number' } },
          enabled: { type: 'boolean' },
          devices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                deviceId: { type: 'string' },
                action: { type: 'string' },
                params: { type: 'object' },
              },
              required: ['deviceId', 'action'],
            },
          },
        },
        required: ['alarm_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ui_preferences',
      description:
        'Read the current user\'s UI preferences: colorMode (light/dark/system), activeTheme (default, midnight, glass, forest, rose, slate, ocean, amber, lcars), fontSize (number), magnification (1.0=100%, 1.5=150%), lcarsVariant, lcarsSoundsEnabled.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ui_preferences',
      description:
        'Change the current user\'s UI preferences. Any user can change their own preferences — no admin needed. Supported keys: colorMode ("light"|"dark"|"system"), activeTheme (one of: default, midnight, glass, forest, rose, slate, ocean, amber, lcars), fontSize (e.g. 14, 16, 18), magnification (e.g. 1.0, 1.25, 1.5), lcarsVariant, lcarsSoundsEnabled. Only include fields you want to change. Example: {"activeTheme":"default"} to switch back to the default theme.',
      parameters: {
        type: 'object',
        properties: {
          colorMode: { type: 'string', enum: ['light', 'dark', 'system'] },
          activeTheme: { type: 'string', description: 'One of: default, midnight, glass, forest, rose, slate, ocean, amber, lcars' },
          fontSize: { type: 'number' },
          magnification: { type: 'number' },
          lcarsVariant: { type: 'string' },
          lcarsSoundsEnabled: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_timers',
      description:
        'List all active cooking/kitchen timers the user currently has. Returns id, label, remaining seconds, and running state. Use before pause/resume/reset/delete when the user references a timer by name ("stop the pasta timer").',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_meal_plan',
      description:
        'Look up meals the user planned/made on specific dates from the Paprika meal plan. Use for questions like "what did I make last Sunday", "what\'s on the meal plan for next week", "did I cook chicken this week". Returns meals within a date range with their recipe UID (use with /recipes?open=<uid> to open the recipe). Dates are YYYY-MM-DD. Today\'s date is available in your system context.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start of range (inclusive), YYYY-MM-DD format. Example: "2026-04-12" for last Sunday.',
          },
          end_date: {
            type: 'string',
            description: 'End of range (inclusive), YYYY-MM-DD format. For a single day, set end_date = start_date.',
          },
        },
        required: ['start_date', 'end_date'],
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

interface TimerSnapshot {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
}

interface ClientContext {
  timers?: TimerSnapshot[];
}

interface ToolContext {
  userRole: UserRole;
  userId: string;
  clientContext?: ClientContext;
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

/**
 * Verify that a device command actually took effect by comparing device
 * state before and after. Returns:
 *   true  — state changed as expected
 *   false — state clearly did NOT change as expected (report failure)
 *   null  — can't determine (unknown state shape, transitional state, etc.)
 */
function verifyCommandEffect(
  cmd: DeviceCommand,
  before: DeviceState | undefined,
  after: DeviceState | undefined,
): boolean | null {
  if (!after) return null; // Device disappeared or never found
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;

  switch (cmd.action) {
    case 'turn_on':
      if (typeof a.on === 'boolean') return a.on === true;
      if (typeof a.power === 'string') return a.power.toLowerCase() !== 'off';
      return null;
    case 'turn_off':
      if (typeof a.on === 'boolean') return a.on === false;
      if (typeof a.power === 'string') return a.power.toLowerCase() === 'off';
      return null;
    case 'open':
      // Cover opened — position should be > 0 or 'opening' transient state OK
      if (typeof a.position === 'number') return a.position > 0 || (typeof a.opening === 'boolean' && a.opening);
      if (typeof a.open === 'boolean') return a.open === true;
      return null;
    case 'close':
      if (typeof a.position === 'number') return a.position === 0 || (typeof a.closing === 'boolean' && a.closing);
      if (typeof a.open === 'boolean') return a.open === false;
      return null;
    case 'set_brightness': {
      const target = typeof cmd.brightness === 'number' ? cmd.brightness : null;
      if (target == null || typeof a.brightness !== 'number') return null;
      // Allow ±5% tolerance
      return Math.abs(a.brightness - target) <= 5;
    }
    case 'set_position': {
      const target = typeof cmd.position === 'number' ? cmd.position : null;
      if (target == null || typeof a.position !== 'number') return null;
      // Mid-transition is acceptable success signal too (opening/closing flag)
      if (typeof a.opening === 'boolean' && a.opening) return true;
      if (typeof a.closing === 'boolean' && a.closing) return true;
      return Math.abs(a.position - target) <= 5;
    }
    default:
      // Don't know how to verify this specific action — assume OK (no false alarm).
      return null;
  }
}

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

      // Snapshot state BEFORE sending so we can verify the command took effect.
      const beforeState = stateStore.get(cmd.deviceId);

      try {
        await registry.handleCommand(cmd);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message, message: `Command failed: ${message}` };
      }

      // Wait briefly for the integration to push the new state. Most
      // integrations update stateStore within 200-800ms; covers may take
      // longer because they have mechanical transitions.
      const waitMs = cmd.type === 'cover' || cmd.type === 'garage_door' ? 1500 : 800;
      await new Promise((r) => setTimeout(r, waitMs));

      const afterState = stateStore.get(cmd.deviceId);
      const verified = verifyCommandEffect(cmd, beforeState, afterState);

      if (verified === false) {
        // We can see the state and it didn't change as expected — report honestly.
        return {
          success: false,
          commandSent: true,
          verified: false,
          beforeState,
          afterState,
          message: `Command "${cmd.action}" was sent but the device state did not change as expected. It may be unreachable, already at the target, or the integration may not report state changes reliably. DO NOT claim this worked — tell the user it appears to have failed and suggest they check the device.`,
        };
      }

      return {
        success: true,
        verified: verified === true, // null = unknown, true = confirmed
        afterState,
        message: verified === true
          ? `Command ${cmd.action} confirmed on ${cmd.deviceId}.`
          : `Command ${cmd.action} sent to ${cmd.deviceId} (state change not verified).`,
      };
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

    case 'set_theme': {
      const raw = String(args.theme ?? '').trim();
      if (!(VALID_UI_THEME_IDS as readonly string[]).includes(raw)) {
        return {
          success: false,
          error: `Invalid theme. Must be one of: ${VALID_UI_THEME_IDS.join(', ')}.`,
        };
      }
      const theme = raw as ValidUiThemeId;

      const { rows } = await query<{ ui_preferences: unknown; ui_preferences_admin: unknown }>(
        'SELECT ui_preferences, ui_preferences_admin FROM users WHERE id = $1',
        [ctx.userId],
      );
      if (rows.length === 0) {
        return { success: false, error: 'User not found.' };
      }
      const { locks } = effectiveUiPreferences(rows[0].ui_preferences, rows[0].ui_preferences_admin);
      if (locks.activeTheme) {
        return {
          success: false,
          error: 'The active theme is admin-locked for this user and cannot be changed from the assistant.',
        };
      }
      const merged = mergeUserPreferences(rows[0].ui_preferences, { activeTheme: theme });
      await query(
        'UPDATE users SET ui_preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(merged), ctx.userId],
      );
      return { success: true, activeTheme: theme, uiPreferencesUpdated: true };
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

    case 'list_alarms': {
      const { rows } = await query<{
        id: string;
        name: string;
        time: string;
        days_of_week: number[];
        enabled: boolean;
        devices: unknown;
      }>('SELECT id, name, time, days_of_week, enabled, devices FROM alarms ORDER BY time ASC');
      return {
        count: rows.length,
        alarms: rows.map((r) => ({
          id: r.id,
          name: r.name,
          time: typeof r.time === 'string' ? r.time.slice(0, 5) : r.time,
          daysOfWeek: r.days_of_week,
          enabled: r.enabled,
          devices: r.devices,
        })),
      };
    }

    case 'create_alarm': {
      const name = String(args.name ?? '').trim();
      const time = String(args.time ?? '').trim();
      const daysOfWeek = Array.isArray(args.daysOfWeek) ? args.daysOfWeek.map(Number).filter((n) => n >= 0 && n <= 6) : [];
      const enabled = args.enabled !== false;
      const devices = Array.isArray(args.devices) ? args.devices : [];
      if (!name) return { error: 'name is required' };
      if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'time must be HH:MM 24-hour format (e.g. "08:00")' };
      if (daysOfWeek.length === 0) return { error: 'daysOfWeek must contain at least one day (0-6, where 0=Sun)' };
      try {
        const { rows } = await query<{ id: string }>(
          `INSERT INTO alarms (name, time, days_of_week, enabled, devices, automation_id)
           VALUES ($1, $2, $3, $4, $5, NULL)
           RETURNING id`,
          [name, time, daysOfWeek, enabled, JSON.stringify(devices)],
        );
        logger.info({ alarmId: rows[0].id, user: ctx.userId }, 'Alarm created via chat');
        return {
          success: true,
          alarmId: rows[0].id,
          message: `Alarm "${name}" created for ${time} on days ${daysOfWeek.join(',')}${devices.length > 0 ? ` with ${devices.length} wake action(s)` : ' (no wake actions — will just fire silently)'}.`,
          navigatePath: '/alarms',
          clientAction: { kind: 'data_changed', resources: ['alarms'] },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Failed to create alarm: ${msg}` };
      }
    }

    case 'update_alarm': {
      const id = String(args.alarm_id ?? '').trim();
      if (!id) return { error: 'alarm_id is required' };
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (typeof args.name === 'string') { sets.push(`name = $${i++}`); values.push(args.name); }
      if (typeof args.time === 'string') {
        if (!/^\d{2}:\d{2}$/.test(args.time)) return { error: 'time must be HH:MM' };
        sets.push(`time = $${i++}`); values.push(args.time);
      }
      if (Array.isArray(args.daysOfWeek)) { sets.push(`days_of_week = $${i++}`); values.push(args.daysOfWeek); }
      if (typeof args.enabled === 'boolean') { sets.push(`enabled = $${i++}`); values.push(args.enabled); }
      if (Array.isArray(args.devices)) { sets.push(`devices = $${i++}::jsonb`); values.push(JSON.stringify(args.devices)); }
      if (sets.length === 0) return { error: 'No fields to update' };
      sets.push('updated_at = NOW()');
      values.push(id);
      const { rows } = await query<{ id: string }>(
        `UPDATE alarms SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
        values,
      );
      if (rows.length === 0) return { error: 'Alarm not found' };
      logger.info({ alarmId: id, user: ctx.userId }, 'Alarm updated via chat');
      return {
        success: true,
        alarmId: id,
        message: `Alarm updated.`,
        clientAction: { kind: 'data_changed', resources: ['alarms'] },
      };
    }

    case 'delete_alarm': {
      const id = String(args.alarm_id ?? '').trim();
      if (!id) return { error: 'alarm_id is required' };
      const result = await query('DELETE FROM alarms WHERE id = $1', [id]);
      if ((result.rowCount ?? 0) === 0) return { error: 'Alarm not found' };
      logger.info({ alarmId: id, user: ctx.userId }, 'Alarm deleted via chat');
      return {
        success: true,
        message: 'Alarm deleted.',
        clientAction: { kind: 'data_changed', resources: ['alarms'] },
      };
    }

    case 'get_ui_preferences': {
      if (ctx.userId.startsWith('tunnel:')) {
        return { error: 'Remote/tunnel sessions do not have local preferences. Sign in directly on the hub to manage UI settings.' };
      }
      const { rows } = await query<{ ui_preferences: Record<string, unknown> | null }>(
        'SELECT ui_preferences FROM users WHERE id = $1',
        [ctx.userId],
      );
      if (rows.length === 0) return { error: 'User not found' };
      return { preferences: rows[0].ui_preferences ?? {} };
    }

    case 'update_ui_preferences': {
      if (ctx.userId.startsWith('tunnel:')) {
        return { error: 'Remote/tunnel sessions cannot change local preferences. Sign in directly on the hub to change theme or display settings.' };
      }
      const allowedKeys = ['colorMode', 'activeTheme', 'fontSize', 'magnification', 'lcarsVariant', 'lcarsSoundsEnabled'];
      const validThemes = ['default', 'midnight', 'glass', 'forest', 'rose', 'slate', 'ocean', 'amber', 'lcars'];
      const validColorModes = ['light', 'dark', 'system'];
      const patch: Record<string, unknown> = {};
      for (const k of allowedKeys) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return { error: 'No preferences to update' };
      if (typeof patch.activeTheme === 'string' && !validThemes.includes(patch.activeTheme)) {
        return { error: `Invalid activeTheme. Must be one of: ${validThemes.join(', ')}` };
      }
      if (typeof patch.colorMode === 'string' && !validColorModes.includes(patch.colorMode)) {
        return { error: `Invalid colorMode. Must be one of: ${validColorModes.join(', ')}` };
      }
      // Read current prefs + any admin locks
      const { rows } = await query<{ ui_preferences: Record<string, unknown> | null; ui_preferences_admin: Record<string, unknown> | null }>(
        'SELECT ui_preferences, ui_preferences_admin FROM users WHERE id = $1',
        [ctx.userId],
      );
      if (rows.length === 0) return { error: 'User not found' };
      const currentPrefs = rows[0].ui_preferences ?? {};
      const adminLocks = rows[0].ui_preferences_admin ?? {};
      // Respect admin-locked keys — non-admins can't override them
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (adminLocks[k] !== undefined && ctx.userRole !== 'admin') {
          // Skip locked key
          continue;
        }
        filtered[k] = v;
      }
      if (Object.keys(filtered).length === 0) {
        return { error: 'All requested preferences are locked by admin policy.' };
      }
      const merged = { ...currentPrefs, ...filtered };
      await query(
        'UPDATE users SET ui_preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(merged), ctx.userId],
      );
      logger.info({ user: ctx.userId, changed: Object.keys(filtered) }, 'UI preferences updated via chat');
      return {
        success: true,
        updated: Object.keys(filtered),
        preferences: merged,
        message: `Updated: ${Object.keys(filtered).join(', ')}. The UI will refresh shortly.`,
        clientAction: { kind: 'refresh_auth' },
      };
    }

    case 'list_timers': {
      // Timers live in the browser; the frontend passes its current list
      // as conversation context on each request. We stash it on the request
      // in ToolContext.clientContext. If missing, tell the LLM there are none.
      const timers = ctx.clientContext?.timers ?? [];
      return {
        count: timers.length,
        timers: timers.map((t) => ({
          id: t.id,
          label: t.label,
          totalSeconds: t.totalSeconds,
          remainingSeconds: t.remainingSeconds,
          running: t.running,
        })),
      };
    }

    case 'manage_timer': {
      const action = String(args.action ?? '');
      const allowed = ['start', 'pause', 'resume', 'reset', 'delete'];
      if (!allowed.includes(action)) {
        return { error: `Invalid action. Must be one of: ${allowed.join(', ')}.` };
      }
      if (action === 'start') {
        const seconds = Math.round(Number(args.seconds));
        const label = String(args.label ?? '').trim();
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) {
          return { error: 'For action=start, seconds must be between 1 and 86400.' };
        }
        if (!label) return { error: 'For action=start, label is required.' };
        return {
          clientAction: {
            kind: 'timer',
            action: 'start',
            label,
            seconds,
          },
          success: true,
          message: `Timer "${label}" (${Math.floor(seconds / 60)}m ${seconds % 60}s) queued to start.`,
        };
      }
      const timerId = String(args.timer_id ?? '').trim();
      if (!timerId) {
        return { error: `For action=${action}, timer_id is required. Call list_timers first.` };
      }
      return {
        clientAction: {
          kind: 'timer',
          action,
          timerId,
        },
        success: true,
        message: `Timer ${action} queued for id ${timerId}.`,
      };
    }

    case 'get_meal_plan': {
      const startRaw = String(args.start_date ?? '').trim();
      const endRaw = String(args.end_date ?? '').trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      if (!iso.test(startRaw) || !iso.test(endRaw)) {
        return { error: 'start_date and end_date must be YYYY-MM-DD.' };
      }
      if (!(await isPaprikaConfigured())) {
        return { error: 'Paprika is not configured. Add credentials in Integrations settings.' };
      }

      // Inclusive date comparison using string ordering (YYYY-MM-DD is lex-sortable)
      const [start, end] = startRaw <= endRaw ? [startRaw, endRaw] : [endRaw, startRaw];
      const allMeals = await getPaprikaMealsFromStore();
      const inRange = allMeals
        .filter((m) => m.date >= start && m.date <= end)
        .sort((a, b) => (a.date === b.date ? a.order_flag - b.order_flag : a.date.localeCompare(b.date)));

      const meals = inRange.map((m) => ({
        date: m.date,
        name: m.name,
        recipeUid: m.recipe_uid,
        // navigatePath for opening the recipe directly
        navigatePath: m.recipe_uid ? `/recipes?open=${encodeURIComponent(m.recipe_uid)}` : null,
      }));

      return {
        range: { start, end },
        count: meals.length,
        meals,
        hint:
          meals.length === 0
            ? 'No meals planned in that range.'
            : `Found ${meals.length} meal${meals.length === 1 ? '' : 's'}. If opening a specific one, call navigate_ui with that meal's navigatePath.`,
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
| "What did I make/cook on <date>" or meal plan questions | get_meal_plan with a date range → if the user wants a specific meal opened, use navigate_ui with that meal's navigatePath |
| Start a cooking timer ("9 minute timer for the pasta") | manage_timer action=start, parse duration → seconds, infer short label from context ("Pasta", "Eggs", "Rice") |
| Stop/pause/resume/reset/delete a timer | list_timers → find by label → manage_timer with the matching timer_id |
| Set an alarm ("wake me at 7 tomorrow", "6:30 on weekdays") | FIRST ask how to wake them if not specified — "I can turn on a light, open a blind, play music, or just fire silently — what would you like?" THEN create_alarm with the appropriate devices. Compute daysOfWeek from today's date. |
| List/change/delete an existing alarm | list_alarms → update_alarm / delete_alarm |
| Change UI theme / dark mode / font size / magnification | update_ui_preferences ({activeTheme, colorMode, fontSize, magnification}). Available themes: default, midnight, glass, forest, rose, slate, ocean, amber, lcars. Always use the exact theme ID — e.g. "go back to normal" → activeTheme:"default". |
| Open a specific recipe | navigate_ui /recipes?open=<uid> |
| Show/find/list devices by type, area, or any criteria | get_devices → navigate_ui with the returned navigatePath (/devices?ids=...) |
| Browse all devices | navigate_ui /devices |
| Show cameras (grid of all) | navigate_ui /cameras |
| Show/fullscreen/open a specific camera | navigate_ui /cameras?open=<cameraName> (use the device name, e.g. living_room, driveway) |
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
// Tool display labels for SSE streaming status events
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  get_devices: 'Fetching devices…',
  get_device_state: 'Reading device state…',
  update_device_settings: 'Updating device…',
  search_recipes: 'Searching recipes…',
  get_meal_plan: 'Checking meal plan…',
  list_timers: 'Checking timers…',
  manage_timer: 'Updating timer…',
  list_alarms: 'Checking alarms…',
  create_alarm: 'Creating alarm…',
  update_alarm: 'Updating alarm…',
  delete_alarm: 'Deleting alarm…',
  get_ui_preferences: 'Reading preferences…',
  update_ui_preferences: 'Updating preferences…',
  navigate_ui: 'Navigating…',
  set_theme: 'Changing theme…',
  get_calendar_events: 'Loading calendar…',
  list_automations: 'Loading automations…',
  get_automation: 'Reading automation…',
  prepare_automation_change: 'Preparing change…',
  commit_automation_change: 'Applying change…',
  send_device_command: 'Sending command…',
  search_web: 'Searching the web…',
  fetch_url: 'Reading page…',
  create_integration_entry: 'Setting up integration…',
  restart_integration: 'Restarting integration…',
  get_integration_setup_info: 'Loading setup info…',
  add_device_to_area: 'Updating area…',
};

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
      const active = apiKeyFor('chat', llmSettings);

      if (!active) {
        const err =
          llmSettings.chatProvider === 'anthropic'
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

  // ---------------------------------------------------------------------------
  // POST /api/chat/stream — SSE streaming version with tool status events
  // ---------------------------------------------------------------------------
  app.post<{ Body: { messages: Array<{ role: string; content: string }>; tts?: boolean; context?: ClientContext } }>(
    '/api/chat/stream',
    { preHandler: [authenticate] },
    async (req, reply) => {
      // Manually echo CORS headers — reply.hijack() below bypasses @fastify/cors,
      // so we must add them ourselves to match the plugin's behavior.
      const originHeader = req.headers.origin;
      const corsHeaders: Record<string, string> = {};
      if (originHeader) {
        corsHeaders['Access-Control-Allow-Origin'] = originHeader;
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
        corsHeaders['Vary'] = 'Origin';
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });

      let closed = false;
      req.raw.on('close', () => { closed = true; });

      const emit = (obj: object) => {
        if (closed) return;
        reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      const user = req.user!;

      // --- TTS pipeline (sentence-streaming) -----------------------------
      // Buffers assistant text, flushes on sentence boundaries, and emits
      // 'audio' SSE events in monotonic seq order so the client can play
      // them back in sequence even if later synthesis finishes first.
      const ttsRequested = req.body.tts !== false;
      let ttsBuffer = '';
      let ttsSeq = 0;
      let lastTtsEmit: Promise<void> = Promise.resolve();
      const ttsAll: Promise<void>[] = [];
      let ttsKey: string | undefined;
      let ttsVoice = 'sage';
      let ttsInstructions = '';
      let ttsSpeed = 1.15;
      let ttsEnabled = false;

      const enqueueTts = (text: string) => {
        const cleaned = stripMarkdownForTts(text);
        if (!cleaned || !ttsKey) return;
        const n = ttsSeq++;
        const prev = lastTtsEmit;
        const synth = synthesizeSentence(cleaned, {
          apiKey: ttsKey,
          voice: ttsVoice as TtsVoice,
          instructions: ttsInstructions,
          speed: ttsSpeed,
        }).catch((err) => {
          logger.warn({ err, seq: n }, 'tts synth failed');
          return null;
        });
        const p = Promise.all([prev, synth]).then(([, buf]) => {
          if (buf && !closed) {
            emit({ type: 'audio', seq: n, mime: 'audio/mpeg', data: buf.toString('base64') });
          }
        });
        lastTtsEmit = p;
        ttsAll.push(p);
      };

      const feedTts = (delta: string) => {
        if (!ttsEnabled) return;
        ttsBuffer += delta;
        const { sentences, rest } = extractSentences(ttsBuffer);
        ttsBuffer = rest;
        for (const s of sentences) enqueueTts(s);
      };

      const flushTts = async () => {
        if (!ttsEnabled) return;
        if (ttsBuffer.trim()) {
          const tail = ttsBuffer;
          ttsBuffer = '';
          enqueueTts(tail);
        }
        await Promise.all(ttsAll);
        if (!closed) emit({ type: 'audio_end' });
      };

      // --- Performance instrumentation ---
      const t0 = Date.now();
      const tMark = (label: string) => {
        const elapsed = Date.now() - t0;
        logger.info({ perf: label, ms: elapsed, user: user.username }, `[chat-perf] ${label} +${elapsed}ms`);
      };

      try {
        const llmSettings = await loadLlmRuntimeSettings();
        const active = apiKeyFor('chat', llmSettings);
        tMark('llm_settings_loaded');

        if (!active) {
          const err = llmSettings.chatProvider === 'anthropic'
            ? 'Anthropic API key not configured. Go to Settings → LLM Integration to add one.'
            : 'OpenAI API key not configured. Go to Settings → LLM Integration to add one.';
          emit({ type: 'error', error: err });
          reply.raw.end();
          return;
        }

        // Resolve TTS (independent of chat provider — TTS is always OpenAI).
        // Per-request `tts` flag from the speaker button is sufficient; the
        // global `ttsEnabled` setting only sets the default and doesn't veto.
        if (ttsRequested) {
          const ttsActive = apiKeyFor('tts', llmSettings);
          if (ttsActive) {
            ttsKey = ttsActive.key;
            ttsVoice = llmSettings.ttsVoice;
            ttsInstructions = llmSettings.ttsInstructions;
            ttsSpeed = llmSettings.ttsSpeed;
            ttsEnabled = true;
          }
        }

        // Fast path: handle simple device commands without LLM
        const lastMessage = req.body.messages.at(-1);
        if (lastMessage?.role === 'user' && req.body.messages.length === 1) {
          const fast = await tryFastPath(lastMessage.content, user.role);
          tMark(fast.handled ? 'fast_path_hit' : 'fast_path_miss');
          if (fast.handled) {
            const reply_text = fast.reply ?? 'Done.';
            // Save to history (fire-and-forget)
            saveChatMessage(user.id, 'user', lastMessage.content);
            saveChatMessage(user.id, 'assistant', reply_text);
            emit({ type: 'token', text: reply_text });
            feedTts(reply_text);
            await flushTts();
            emit({ type: 'done' });
            reply.raw.end();
            return;
          }
        }

        // Save incoming user message to history
        if (lastMessage?.role === 'user') {
          saveChatMessage(user.id, 'user', lastMessage.content);
        }

        const tools = getToolsForRole(user.role);
        const toolCtx: ToolContext = {
          userRole: user.role,
          userId: user.id,
          clientContext: req.body.context,
        };
        const systemPrompt = await buildSystemPrompt(user);
        tMark(`system_prompt_built (${systemPrompt.length} chars, ${tools.length} tools)`);
        const conversation = req.body.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        let navigateTo: string | undefined;
        let assistantResponse = ''; // Collect assistant response for history
        const MAX_ITERATIONS = 10;

        if (active.kind === 'anthropic') {
          const anthropic = new Anthropic({ apiKey: active.key });
          const anthropicTools = openAiToolsToAnthropic(tools);
          let msgs = clientMessagesToAnthropic(conversation);

          for (let i = 0; i < MAX_ITERATIONS; i++) {
            if (closed) break;

            const tLlmStart = Date.now();
            // Anthropic prompt caching: mark the system prompt (and the tail
            // of the tools list) with cache_control: ephemeral. Anthropic will
            // reuse the cached content for 5 minutes — on cache hits this is
            // ~2-4x faster and ~90% cheaper. For a home-automation assistant
            // whose system prompt + tools change rarely, this is a huge win.
            const streamObj = anthropic.messages.stream({
              model: llmSettings.anthropicModel,
              max_tokens: 8192,
              temperature: 0.3,
              system: [
                {
                  type: 'text',
                  text: systemPrompt,
                  cache_control: { type: 'ephemeral' },
                },
              ],
              messages: msgs,
              tools: anthropicTools.length > 0
                ? anthropicTools.map((t, idx) =>
                    idx === anthropicTools.length - 1
                      ? { ...t, cache_control: { type: 'ephemeral' as const } }
                      : t,
                  )
                : anthropicTools,
            });

            for await (const event of streamObj) {
              if (closed) break;
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                assistantResponse += event.delta.text;
                emit({ type: 'token', text: event.delta.text });
                feedTts(event.delta.text);
              }
            }

            const finalMsg = await streamObj.finalMessage();
            tMark(`llm_iter_${i}_done (${Date.now() - tLlmStart}ms, model=${llmSettings.anthropicModel})`);
            const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            for (const block of finalMsg.content) {
              if (block.type === 'tool_use') {
                toolUses.push({
                  id: block.id,
                  name: block.name,
                  input: (typeof block.input === 'object' && block.input !== null
                    ? (block.input as Record<string, unknown>) : {}),
                });
              }
            }

            if (toolUses.length === 0) {
              // Save assistant response to history (fire-and-forget)
              if (assistantResponse) {
                saveChatMessage(user.id, 'assistant', assistantResponse);
              }
              await flushTts();
              emit({ type: 'done', ...(navigateTo ? { navigate: navigateTo } : {}) });
              tMark('total_anthropic');
              break;
            }

            msgs.push({ role: 'assistant', content: finalMsg.content as unknown as ContentBlockParam[] });
            const toolResultBlocks: ContentBlockParam[] = [];

            for (const tu of toolUses) {
              if (closed) break;
              emit({ type: 'tool_status', tool: tu.name, label: TOOL_LABELS[tu.name] ?? `Running ${tu.name}…` });
              const tToolStart = Date.now();
              logger.info({ tool: tu.name, args: tu.input, user: user.username }, 'Chat stream tool call');
              const result = await executeTool(tu.name, tu.input, toolCtx);
              tMark(`tool_${tu.name} (${Date.now() - tToolStart}ms)`);
              if (tu.name === 'navigate_ui' && typeof result === 'object' && result !== null && 'navigate' in result) {
                navigateTo = (result as { navigate: string }).navigate;
                // Emit navigate IMMEDIATELY — do not wait for the LLM's
                // "I'm opening it now…" narration to finish on the next
                // iteration. Frontend can navigate while the LLM is still
                // generating its response text.
                emit({ type: 'navigate', navigate: navigateTo });
              }
              if (
                tu.name === 'set_theme' && typeof result === 'object' && result !== null
                && 'uiPreferencesUpdated' in result
                && (result as { uiPreferencesUpdated?: unknown }).uiPreferencesUpdated
              ) {
                emit({ type: 'ui_preferences_update' });
              }
              // Relay client-side actions (timers, etc.) to the frontend.
              if (typeof result === 'object' && result !== null && 'clientAction' in result) {
                const ca = (result as { clientAction: Record<string, unknown> }).clientAction;
                emit({ type: 'client_action', action: ca });
              }
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(result),
              });
            }

            msgs.push({ role: 'user', content: toolResultBlocks });
          }
        } else {
          // OpenAI streaming
          const openai = new OpenAI({ apiKey: active.key });
          const msgs: ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...conversation.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          ];

          for (let i = 0; i < MAX_ITERATIONS; i++) {
            if (closed) break;

            const stream = await openai.chat.completions.create({
              model: llmSettings.openaiModel,
              messages: msgs,
              tools,
              temperature: 0.3,
              stream: true,
            });

            let content = '';
            const tcAcc = new Map<number, { id: string; name: string; args: string }>();

            for await (const chunk of stream) {
              if (closed) break;
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                emit({ type: 'token', text: delta.content });
                content += delta.content;
                assistantResponse += delta.content;
                feedTts(delta.content);
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const ex = tcAcc.get(idx) ?? { id: '', name: '', args: '' };
                  if (tc.id) ex.id = tc.id;
                  if (tc.function?.name) ex.name = tc.function.name;
                  if (tc.function?.arguments) ex.args += tc.function.arguments;
                  tcAcc.set(idx, ex);
                }
              }
            }

            const toolCalls = [...tcAcc.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);

            if (toolCalls.length === 0) {
              // Save assistant response to history (fire-and-forget)
              if (assistantResponse) {
                saveChatMessage(user.id, 'assistant', assistantResponse);
              }
              await flushTts();
              emit({ type: 'done', ...(navigateTo ? { navigate: navigateTo } : {}) });
              break;
            }

            msgs.push({
              role: 'assistant',
              content: content || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.args },
              })),
            });

            for (const tc of toolCalls) {
              if (closed) break;
              emit({ type: 'tool_status', tool: tc.name, label: TOOL_LABELS[tc.name] ?? `Running ${tc.name}…` });
              const args = JSON.parse(tc.args);
              logger.info({ tool: tc.name, args, user: user.username }, 'Chat stream tool call');
              const result = await executeTool(tc.name, args, toolCtx);
              if (tc.name === 'navigate_ui' && typeof result === 'object' && result !== null && 'navigate' in result) {
                navigateTo = (result as { navigate: string }).navigate;
                // Emit navigate immediately (don't wait for LLM to finish narrating)
                emit({ type: 'navigate', navigate: navigateTo });
              }
              if (
                tc.name === 'set_theme' && typeof result === 'object' && result !== null
                && 'uiPreferencesUpdated' in result
                && (result as { uiPreferencesUpdated?: unknown }).uiPreferencesUpdated
              ) {
                emit({ type: 'ui_preferences_update' });
              }
              if (typeof result === 'object' && result !== null && 'clientAction' in result) {
                const ca = (result as { clientAction: Record<string, unknown> }).clientAction;
                emit({ type: 'client_action', action: ca });
              }
              msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err }, 'Chat stream error');
        emit({ type: 'error', error: `LLM error: ${message}` });
      }

      reply.raw.end();
    },
  );

  // GET /api/chat/history — Load chat history for the current user (last 24 hours)
  app.get('/api/chat/history', { preHandler: [authenticate] }, loadChatHistory);

  // Test connection — verify the API key works by making a minimal API call
  app.post('/api/chat/test', { preHandler: [authenticate] }, async (_req, reply) => {
    const llmSettings = await loadLlmRuntimeSettings();
    const active = apiKeyFor('chat', llmSettings);

    if (!active) {
      const err =
        llmSettings.chatProvider === 'anthropic'
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
