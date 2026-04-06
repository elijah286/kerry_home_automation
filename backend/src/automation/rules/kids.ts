import type { AutomationRule } from '../engine.js';

export const kidsRules: AutomationRule[] = [
  // -------------------------------------------------------------------------
  // Boys bedroom lamps – evening routine
  // -------------------------------------------------------------------------
  {
    id: 'kids.boys_bedroom_lamps_on',
    name: 'Boys bedroom lamps on at 7:45 PM',
    enabled: true,
    triggers: [
      { type: 'time', cron: '45 19 * * *' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 50, color_temp_kelvin: 2700 } },
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 50, color_temp_kelvin: 2700 } },
    ],
  },

  {
    id: 'kids.sloane_bedroom_lamp_on',
    name: "Sloane's bedroom lamp on at 7:45 PM",
    enabled: true,
    triggers: [
      { type: 'time', cron: '45 19 * * *' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 40, color_temp_kelvin: 2700 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Boys overhead light timer
  // -------------------------------------------------------------------------
  {
    id: 'kids.boys_overhead_timer_night',
    name: 'Boys overhead light auto-off after 30 min at night',
    description: 'If boys overhead light turns on after 8 PM, auto-off after 30 minutes',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'light.boys_bedroom_overhead', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '20:00', before: '06:00' },
    ],
    actions: [
      { type: 'delay', delay_ms: 1_800_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'light.boys_bedroom_overhead', state: 'on' }],
            actions: [
              { type: 'command', entity_id: 'light.boys_bedroom_overhead', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Levi's lamp timer
  // -------------------------------------------------------------------------
  {
    id: 'kids.levi_lamp_bedtime_off',
    name: "Levi's lamp off at bedtime",
    description: 'Auto-off at 8:30 PM on school nights, 9:00 PM otherwise',
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 20 * * 0-4' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.levi_lamp_weekend_off',
    name: "Levi's lamp off at weekend bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 21 * * 5-6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.levi_lamp_auto_off_timer',
    name: "Levi's lamp auto-off 45 min after on",
    description: 'If Levi turns his lamp on at night, auto-off after 45 min as reading timer',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'light.levi_bedroom_lamp', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '20:00', before: '06:00' },
    ],
    actions: [
      { type: 'delay', delay_ms: 2_700_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'light.levi_bedroom_lamp', state: 'on' }],
            actions: [
              { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Asher's lamp timer
  // -------------------------------------------------------------------------
  {
    id: 'kids.asher_lamp_bedtime_off',
    name: "Asher's lamp off at bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 20 * * 0-4' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.asher_lamp_weekend_off',
    name: "Asher's lamp off at weekend bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 21 * * 5-6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.asher_lamp_auto_off_timer',
    name: "Asher's lamp auto-off 45 min after on",
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'light.asher_bedroom_lamp', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '20:00', before: '06:00' },
    ],
    actions: [
      { type: 'delay', delay_ms: 2_700_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'light.asher_bedroom_lamp', state: 'on' }],
            actions: [
              { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Sloane's lamp timer
  // -------------------------------------------------------------------------
  {
    id: 'kids.sloane_lamp_bedtime_off',
    name: "Sloane's lamp off at bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * 0-4' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.sloane_lamp_weekend_off',
    name: "Sloane's lamp off at weekend bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 20 * * 5-6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.sloane_nightlight',
    name: "Sloane's nightlight on at bedtime",
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_nightlight', command: 'turn_on', data: { brightness_pct: 10, color_temp_kelvin: 2200 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Wake-up routines
  // -------------------------------------------------------------------------
  {
    id: 'kids.school_wakeup_boys',
    name: 'School day wake-up – boys at 6:30 AM',
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 6 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 20, color_temp_kelvin: 3000 } },
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 20, color_temp_kelvin: 3000 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 60, color_temp_kelvin: 4000 } },
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 60, color_temp_kelvin: 4000 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.boys_bedroom_overhead', command: 'turn_on', data: { brightness_pct: 100 } },
    ],
  },

  {
    id: 'kids.school_wakeup_sloane',
    name: 'School day wake-up – Sloane at 6:30 AM',
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 6 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_nightlight', command: 'turn_off' },
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 20, color_temp_kelvin: 3000 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 60, color_temp_kelvin: 4000 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.sloane_bedroom_overhead', command: 'turn_on', data: { brightness_pct: 100 } },
    ],
  },

  {
    id: 'kids.weekend_wakeup_boys',
    name: 'Weekend wake-up – boys at 8:00 AM (gentle)',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 8 * * 0,6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 15, color_temp_kelvin: 2700 } },
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 15, color_temp_kelvin: 2700 } },
    ],
  },

  {
    id: 'kids.weekend_wakeup_sloane',
    name: 'Weekend wake-up – Sloane at 8:00 AM (gentle)',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 8 * * 0,6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_nightlight', command: 'turn_off' },
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 15, color_temp_kelvin: 2700 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Screen time tracking – Xbox
  // -------------------------------------------------------------------------
  {
    id: 'kids.xbox_session_start',
    name: 'Xbox turned on – start session timer',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'sensor.xbox_session_start', state: new Date().toISOString(), attributes: { friendly_name: 'Xbox Session Start' } },
      { type: 'set_state', entity_id: 'input_boolean.xbox_session_active', state: 'on' },
    ],
  },

  {
    id: 'kids.xbox_session_end',
    name: 'Xbox turned off – end session timer',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'off' },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.xbox_session_active', state: 'on' },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.xbox_session_active', state: 'off' },
      {
        type: 'call',
        fn: async (ctx) => {
          const start = ctx.getState('sensor.xbox_session_start');
          if (!start) return;
          const elapsed = Math.round((Date.now() - new Date(start.state).getTime()) / 60_000);
          const today = ctx.getState('sensor.xbox_time_today');
          const total = (today ? parseInt(today.state, 10) : 0) + elapsed;
          ctx.sendCommand('input_number.xbox_time_today', 'set_value', { value: total });
        },
      },
    ],
  },

  {
    id: 'kids.xbox_time_limit_warning',
    name: 'Xbox time limit warning',
    description: 'Warn when Xbox time reaches 90 minutes',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'input_number.xbox_time_today', above: 90 },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.xbox_session_active', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Xbox has been on for 90 minutes today' } },
      { type: 'command', entity_id: 'light.game_room', command: 'flash', data: { flashes: 3, color: 'yellow' } },
    ],
  },

  {
    id: 'kids.xbox_time_limit_reached',
    name: 'Xbox time limit reached – shut down',
    description: 'Auto-off when Xbox time hits 120 minutes on school days',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'input_number.xbox_time_today', above: 120 },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.xbox_session_active', state: 'on' },
      {
        type: 'template',
        fn: () => {
          const day = new Date().getDay();
          return day >= 1 && day <= 5;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Xbox time limit reached – powering off' } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // -------------------------------------------------------------------------
  // Screen time tracking – Nintendo Switch
  // -------------------------------------------------------------------------
  {
    id: 'kids.nintendo_session_start',
    name: 'Nintendo on – start session timer',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'sensor.nintendo_session_start', state: new Date().toISOString(), attributes: { friendly_name: 'Nintendo Session Start' } },
      { type: 'set_state', entity_id: 'input_boolean.nintendo_session_active', state: 'on' },
    ],
  },

  {
    id: 'kids.nintendo_session_end',
    name: 'Nintendo off – end session timer',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'off' },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.nintendo_session_active', state: 'on' },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.nintendo_session_active', state: 'off' },
      {
        type: 'call',
        fn: async (ctx) => {
          const start = ctx.getState('sensor.nintendo_session_start');
          if (!start) return;
          const elapsed = Math.round((Date.now() - new Date(start.state).getTime()) / 60_000);
          const today = ctx.getState('sensor.nintendo_time_today');
          const total = (today ? parseInt(today.state, 10) : 0) + elapsed;
          ctx.sendCommand('input_number.nintendo_time_today', 'set_value', { value: total });
        },
      },
    ],
  },

  {
    id: 'kids.nintendo_time_limit_warning',
    name: 'Nintendo time limit warning',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'input_number.nintendo_time_today', above: 90 },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.nintendo_session_active', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Nintendo Switch has been on for 90 minutes today' } },
      { type: 'command', entity_id: 'light.game_room', command: 'flash', data: { flashes: 3, color: 'yellow' } },
    ],
  },

  {
    id: 'kids.nintendo_time_limit_reached',
    name: 'Nintendo time limit reached – shut down',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'input_number.nintendo_time_today', above: 120 },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.nintendo_session_active', state: 'on' },
      {
        type: 'template',
        fn: () => {
          const day = new Date().getDay();
          return day >= 1 && day <= 5;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Nintendo time limit reached – powering off' } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
    ],
    mode: 'single',
  },

  {
    id: 'kids.reset_screen_time_counters',
    name: 'Reset daily screen time counters at midnight',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 0 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'input_number.xbox_time_today', command: 'set_value', data: { value: 0 } },
      { type: 'command', entity_id: 'input_number.nintendo_time_today', command: 'set_value', data: { value: 0 } },
    ],
  },

  // -------------------------------------------------------------------------
  // No gaming during school hours
  // -------------------------------------------------------------------------
  {
    id: 'kids.no_xbox_school_hours',
    name: 'No Xbox during school hours',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '08:00', before: '15:00' },
      {
        type: 'template',
        fn: () => {
          const day = new Date().getDay();
          return day >= 1 && day <= 5;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Xbox turned on during school hours – auto-powered off' } },
    ],
  },

  {
    id: 'kids.no_nintendo_school_hours',
    name: 'No Nintendo during school hours',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '08:00', before: '15:00' },
      {
        type: 'template',
        fn: () => {
          const day = new Date().getDay();
          return day >= 1 && day <= 5;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Nintendo turned on during school hours – auto-powered off' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Bedtime mode – dim lights in kids rooms
  // -------------------------------------------------------------------------
  {
    id: 'kids.bedtime_mode_boys',
    name: 'Bedtime mode – boys rooms dim',
    description: 'At 8 PM, dim boys room lights to reading level',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.boys_bedroom_overhead', command: 'turn_off' },
      { type: 'command', entity_id: 'light.levi_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 30, color_temp_kelvin: 2200 } },
      { type: 'command', entity_id: 'light.asher_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 30, color_temp_kelvin: 2200 } },
    ],
  },

  {
    id: 'kids.bedtime_mode_sloane',
    name: 'Bedtime mode – Sloane room dim',
    enabled: true,
    triggers: [
      { type: 'time', cron: '45 19 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.sloane_bedroom_overhead', command: 'turn_off' },
      { type: 'command', entity_id: 'light.sloane_bedroom_lamp', command: 'turn_on', data: { brightness_pct: 30, color_temp_kelvin: 2200 } },
    ],
  },

  // -------------------------------------------------------------------------
  // No gaming after bedtime
  // -------------------------------------------------------------------------
  {
    id: 'kids.no_xbox_after_bedtime',
    name: 'No Xbox after bedtime',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '20:30', before: '06:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Xbox turned on after bedtime – auto-powered off' } },
    ],
  },

  {
    id: 'kids.no_nintendo_after_bedtime',
    name: 'No Nintendo after bedtime',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '20:30', before: '06:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Screen Time', message: 'Nintendo turned on after bedtime – auto-powered off' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Kids bathroom night light
  // -------------------------------------------------------------------------
  {
    id: 'kids.bathroom_nightlight_on',
    name: 'Kids bathroom nightlight on at bedtime',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.kids_bathroom_nightlight', command: 'turn_on', data: { brightness_pct: 5, color_temp_kelvin: 2200 } },
    ],
  },

  {
    id: 'kids.bathroom_nightlight_off',
    name: 'Kids bathroom nightlight off in morning',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 7 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.kids_bathroom_nightlight', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Hallway nightlight for kids
  // -------------------------------------------------------------------------
  {
    id: 'kids.hallway_nightlight_on',
    name: 'Hallway nightlight on at bedtime',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.upstairs_hallway', command: 'turn_on', data: { brightness_pct: 5, color_temp_kelvin: 2200 } },
    ],
  },

  {
    id: 'kids.hallway_nightlight_off',
    name: 'Hallway nightlight off in morning',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'morning' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.upstairs_hallway', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Game room – kids away at school
  // -------------------------------------------------------------------------
  {
    id: 'kids.game_room_off_school',
    name: 'Game room devices off during school',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 8 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Game room TV auto-off at bedtime
  // -------------------------------------------------------------------------
  {
    id: 'kids.game_room_tv_bedtime',
    name: 'Game room TV off at bedtime',
    enabled: true,
    triggers: [
      { type: 'time', cron: '30 20 * * 0-4' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
    ],
  },

  {
    id: 'kids.game_room_tv_weekend_bedtime',
    name: 'Game room TV off at weekend bedtime',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 21 * * 5-6' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Morning routine reminder
  // -------------------------------------------------------------------------
  {
    id: 'kids.morning_routine_reminder',
    name: 'Morning routine – flash hallway at 7 AM',
    description: 'Gentle hallway flash to signal kids should be getting ready',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 7 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.upstairs_hallway', command: 'turn_on', data: { brightness_pct: 100, color_temp_kelvin: 5000 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Screen time – weekly summary
  // -------------------------------------------------------------------------
  {
    id: 'kids.weekly_screen_time_report',
    name: 'Weekly screen time report',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * 0' },
    ],
    conditions: [],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          const xbox = ctx.getState('sensor.xbox_time_weekly');
          const nintendo = ctx.getState('sensor.nintendo_time_weekly');
          const msg = [
            `Xbox: ${xbox?.state ?? '0'} min this week`,
            `Nintendo: ${nintendo?.state ?? '0'} min this week`,
          ].join('\n');
          ctx.sendCommand('notify.mobile_family', 'send', { title: 'Weekly Screen Time', message: msg });
        },
      },
    ],
  },
];
