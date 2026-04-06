import type { AutomationRule } from '../engine.js';

export const cleaningRules: AutomationRule[] = [
  // ── Daily Vacuum Schedule ──────────────────────────────────────────────
  {
    id: 'vacuum-daily-schedule',
    name: 'Daily vacuum at 10 AM',
    description: 'Start whole-house vacuum when nobody is home at 10 AM',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 10 * * *' }],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'off' },
      { type: 'mode', mode: ['away', 'vacation'] },
    ],
    actions: [
      { type: 'command', entity_id: 'vacuum.roborock_s7', command: 'start' },
    ],
    mode: 'single',
  },

  // ── Fallback Vacuum – Evening ──────────────────────────────────────────
  {
    id: 'vacuum-fallback-evening',
    name: 'Fallback vacuum in the evening',
    description: 'If the daily vacuum was skipped (someone was home), run at 7 PM',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 19 * * *' }],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const vac = ctx.getState('vacuum.roborock_s7');
          const lastClean = vac?.attributes['last_clean_start'] as string | undefined;
          if (!lastClean) return true;
          const hoursSince = (Date.now() - new Date(lastClean).getTime()) / 3_600_000;
          return hoursSince > 20;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'vacuum.roborock_s7', command: 'start' },
    ],
    mode: 'single',
  },

  // ── Water Tank Low Alert ───────────────────────────────────────────────
  {
    id: 'vacuum-water-tank-low',
    name: 'Roborock water tank low',
    description: 'Alert when the mop water tank needs refilling',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.roborock_s7_water_level', to: 'low' },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Vacuum', message: 'Roborock water tank is low — please refill before next mop cycle.' },
      },
    ],
    mode: 'single',
  },

  // ── Dust Bin Full Alert ────────────────────────────────────────────────
  {
    id: 'vacuum-dustbin-full',
    name: 'Dust bin full alert',
    description: 'Notify when the vacuum dustbin needs emptying',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.roborock_s7_dustbin_full', to: 'on' },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Vacuum', message: 'Roborock dust bin is full — please empty it.' },
      },
    ],
    mode: 'single',
  },

  // ── Vacuum Error Notification ──────────────────────────────────────────
  {
    id: 'vacuum-error-notification',
    name: 'Vacuum error notification',
    description: 'Send alert when the vacuum encounters an error (stuck, brush jam, etc.)',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'vacuum.roborock_s7', to: 'error' },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Vacuum Error',
          message: 'Roborock has encountered an error and stopped. Please check the robot.',
        },
      },
    ],
    mode: 'single',
  },

  // ── Kitchen Clean After Cooking ────────────────────────────────────────
  {
    id: 'vacuum-kitchen-after-cooking',
    name: 'Kitchen vacuum after cooking',
    description: 'Send vacuum to kitchen 15 minutes after the stove turns off',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.kitchen_stove_power', to: 'off' },
    ],
    conditions: [
      { type: 'time_window', after: '08:00', before: '22:00' },
    ],
    actions: [
      { type: 'delay', delay_ms: 900_000 },
      {
        type: 'command',
        entity_id: 'vacuum.roborock_s7',
        command: 'send_command',
        data: { command: 'app_segment_clean', params: [18] },
      },
    ],
    mode: 'restart',
  },

  // ── Return to Dock on Arrival ──────────────────────────────────────────
  {
    id: 'vacuum-dock-on-arrival',
    name: 'Vacuum returns to dock when someone arrives',
    description: 'Send the vacuum home immediately when someone arrives',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', to: 'on' },
    ],
    conditions: [
      { type: 'state', entity_id: 'vacuum.roborock_s7', state: 'cleaning' },
    ],
    actions: [
      { type: 'command', entity_id: 'vacuum.roborock_s7', command: 'return_to_base' },
    ],
    mode: 'single',
  },

  // ── Mop Mode on Weekends ───────────────────────────────────────────────
  {
    id: 'vacuum-weekend-mop',
    name: 'Weekend mop cycle',
    description: 'Run a full mop-only pass on Saturday mornings',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 9 * * 6' }],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'off' },
    ],
    actions: [
      {
        type: 'command',
        entity_id: 'vacuum.roborock_s7',
        command: 'send_command',
        data: { command: 'app_start_wash', params: { mode: 'deep' } },
      },
    ],
    mode: 'single',
  },

  // ── Dining Room After Dinner ───────────────────────────────────────────
  {
    id: 'vacuum-dining-after-dinner',
    name: 'Dining room clean after dinner',
    description: 'Spot-clean the dining room at 8:30 PM on weekdays',
    enabled: true,
    triggers: [{ type: 'time', cron: '30 20 * * 1-5' }],
    conditions: [
      { type: 'state', entity_id: 'vacuum.roborock_s7', state: ['docked', 'idle'] },
    ],
    actions: [
      {
        type: 'command',
        entity_id: 'vacuum.roborock_s7',
        command: 'send_command',
        data: { command: 'app_segment_clean', params: [22] },
      },
    ],
    mode: 'single',
  },

  // ── Vacuum Maintenance Reminder ────────────────────────────────────────
  {
    id: 'vacuum-maintenance-reminder',
    name: 'Vacuum maintenance reminder',
    description: 'Weekly reminder to check brushes, filters, and sensors',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 10 * * 0' }],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Vacuum Maintenance',
          message: 'Weekly reminder: check Roborock brushes, filter, and cliff sensors.',
        },
      },
    ],
    mode: 'single',
  },

  // ── Quiet Hours – Prevent Cleaning ─────────────────────────────────────
  {
    id: 'vacuum-quiet-hours-stop',
    name: 'Stop vacuum during quiet hours',
    description: 'If the vacuum is running after 10 PM, send it back to dock',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 22 * * *' }],
    conditions: [
      { type: 'state', entity_id: 'vacuum.roborock_s7', state: 'cleaning' },
    ],
    actions: [
      { type: 'command', entity_id: 'vacuum.roborock_s7', command: 'return_to_base' },
    ],
    mode: 'single',
  },

  // ── Guest Mode – Disable Auto Vacuum ───────────────────────────────────
  {
    id: 'vacuum-guest-mode-disable',
    name: 'Pause auto-vacuum in guest mode',
    description: 'Disable automatic vacuum schedules while guests are staying',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', to: 'guest' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.vacuum_auto_schedule', state: 'off' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Vacuum', message: 'Automatic vacuum schedule paused for guest mode.' },
      },
    ],
    mode: 'single',
  },
];
