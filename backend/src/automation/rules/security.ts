import type { AutomationRule } from '../engine.js';

export const securityRules: AutomationRule[] = [
  // -------------------------------------------------------------------------
  // Door / entry alerts
  // -------------------------------------------------------------------------
  {
    id: 'security.door_open_night_alert',
    name: 'Door opens during night – alert & flash hallway',
    description: 'Any exterior door opening after dark triggers a notification and hallway light flash',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.front_door_contact', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.back_door_contact', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.garage_entry_contact', to: 'on' },
    ],
    conditions: [
      { type: 'mode', mode: ['night', 'late_night', 'late_evening'] },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Door opened during night mode' } },
      { type: 'command', entity_id: 'light.hallway', command: 'flash', data: { flashes: 3, color: 'red' } },
    ],
    mode: 'parallel',
  },

  {
    id: 'security.front_door_unlocked_too_long',
    name: 'Front door unlocked too long – alert',
    description: 'Alert if front door lock is unlocked for more than 10 minutes',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'lock.front_door', to: 'unlocked' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 600_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'lock.front_door', state: 'unlocked' }],
            actions: [
              { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Front door has been unlocked for 10 minutes' } },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'security.back_door_unlocked_too_long',
    name: 'Back door unlocked too long – alert',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'lock.back_door', to: 'unlocked' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 600_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'lock.back_door', state: 'unlocked' }],
            actions: [
              { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Back door has been unlocked for 10 minutes' } },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Motion detection
  // -------------------------------------------------------------------------
  {
    id: 'security.motion_outside_night_porch',
    name: 'Motion outside at night – porch lights on',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.front_porch_motion', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.driveway_motion', to: 'on' },
    ],
    conditions: [
      { type: 'mode', mode: ['evening', 'late_evening', 'late_night', 'night'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.front_porch', command: 'turn_on', data: { brightness_pct: 100 } },
      { type: 'command', entity_id: 'light.driveway', command: 'turn_on', data: { brightness_pct: 100 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.front_porch', command: 'turn_off' },
      { type: 'command', entity_id: 'light.driveway', command: 'turn_off' },
    ],
    mode: 'restart',
  },

  {
    id: 'security.motion_backyard_night',
    name: 'Motion backyard at night – backyard lights on',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.backyard_motion', to: 'on' },
    ],
    conditions: [
      { type: 'mode', mode: ['evening', 'late_evening', 'late_night', 'night'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.backyard_flood', command: 'turn_on', data: { brightness_pct: 100 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.backyard_flood', command: 'turn_off' },
    ],
    mode: 'restart',
  },

  {
    id: 'security.motion_side_yard_night',
    name: 'Motion side yard at night – side lights on',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.side_yard_motion', to: 'on' },
    ],
    conditions: [
      { type: 'mode', mode: ['evening', 'late_evening', 'late_night', 'night'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.side_yard', command: 'turn_on', data: { brightness_pct: 100 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.side_yard', command: 'turn_off' },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Alarm
  // -------------------------------------------------------------------------
  {
    id: 'security.alarm_triggered',
    name: 'Alarm triggered – flash all lights, send alert',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'alarm_control_panel.home', to: 'triggered' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'ALARM', message: 'Home alarm has been triggered!', priority: 'critical' } },
      { type: 'command', entity_id: 'light.all_interior', command: 'flash', data: { flashes: 10, color: 'red' } },
      { type: 'command', entity_id: 'light.all_exterior', command: 'turn_on', data: { brightness_pct: 100 } },
      { type: 'command', entity_id: 'siren.home', command: 'turn_on' },
    ],
    mode: 'single',
  },

  {
    id: 'security.alarm_disarmed_siren_off',
    name: 'Alarm disarmed – stop siren & restore lights',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'alarm_control_panel.home', to: 'disarmed' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'siren.home', command: 'turn_off' },
      { type: 'command', entity_id: 'light.all_interior', command: 'restore_scene' },
    ],
    mode: 'single',
  },

  // -------------------------------------------------------------------------
  // Locks – night mode
  // -------------------------------------------------------------------------
  {
    id: 'security.lock_doors_night',
    name: 'Lock all doors at night mode',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'late_evening' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'lock.front_door', command: 'lock' },
      { type: 'command', entity_id: 'lock.back_door', command: 'lock' },
      { type: 'command', entity_id: 'lock.garage_entry', command: 'lock' },
    ],
  },

  {
    id: 'security.verify_locks_night',
    name: 'Verify all doors locked at midnight',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 0 * * *' },
    ],
    conditions: [],
    actions: [
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'lock.front_door', state: 'unlocked' }],
            actions: [
              { type: 'command', entity_id: 'lock.front_door', command: 'lock' },
              { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Front door was unlocked at midnight – auto-locked' } },
            ],
          },
        ],
        default_actions: [],
      },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'lock.back_door', state: 'unlocked' }],
            actions: [
              { type: 'command', entity_id: 'lock.back_door', command: 'lock' },
              { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Back door was unlocked at midnight – auto-locked' } },
            ],
          },
        ],
        default_actions: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Presence-based locking
  // -------------------------------------------------------------------------
  {
    id: 'security.unlock_first_arrival',
    name: 'Unlock front door when first person arrives',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'off', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'lock.front_door', command: 'unlock' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Welcome', message: 'Front door unlocked – someone arrived home' } },
    ],
  },

  {
    id: 'security.lock_everyone_left',
    name: 'Lock all doors when everyone leaves',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'on', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 120_000 },
      { type: 'command', entity_id: 'lock.front_door', command: 'lock' },
      { type: 'command', entity_id: 'lock.back_door', command: 'lock' },
      { type: 'command', entity_id: 'lock.garage_entry', command: 'lock' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'All doors locked – everyone left' } },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Garage door
  // -------------------------------------------------------------------------
  {
    id: 'security.garage_left_open',
    name: 'Garage door left open – alert',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'cover.garage_door', to: 'open' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 900_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'cover.garage_door', state: 'open' }],
            actions: [
              { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Garage door has been open for 15 minutes' } },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'security.garage_auto_close_night',
    name: 'Auto-close garage at night if left open',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'late_evening' },
    ],
    conditions: [
      { type: 'state', entity_id: 'cover.garage_door', state: 'open' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.garage_door', command: 'close' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Garage door auto-closed for night' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Window sensors
  // -------------------------------------------------------------------------
  {
    id: 'security.window_open_away',
    name: 'Window open when nobody home – alert',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', to: 'off' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const windows = [
            'binary_sensor.kitchen_window', 'binary_sensor.master_bedroom_window',
            'binary_sensor.living_room_window', 'binary_sensor.game_room_window',
          ];
          return windows.some((w) => ctx.getState(w)?.state === 'on');
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Security', message: 'Windows left open while away from home' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Alarm arming
  // -------------------------------------------------------------------------
  {
    id: 'security.arm_alarm_away',
    name: 'Arm alarm when everyone leaves',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'on', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 180_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'off' }],
            actions: [
              { type: 'command', entity_id: 'alarm_control_panel.home', command: 'arm_away' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'security.disarm_alarm_arrival',
    name: 'Disarm alarm when someone arrives',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'off', to: 'on' },
    ],
    conditions: [
      { type: 'state', entity_id: 'alarm_control_panel.home', state: ['armed_away', 'armed_home'] },
    ],
    actions: [
      { type: 'command', entity_id: 'alarm_control_panel.home', command: 'disarm' },
    ],
  },

  {
    id: 'security.arm_alarm_night',
    name: 'Arm alarm in home mode at night',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'late_night' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'alarm_control_panel.home', command: 'arm_home' },
    ],
  },

  // -------------------------------------------------------------------------
  // Doorbell
  // -------------------------------------------------------------------------
  {
    id: 'security.doorbell_ring',
    name: 'Doorbell ring – notify and snapshot',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'doorbell_ring' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'camera.front_door', command: 'snapshot', data: { filename: '/tmp/doorbell_snapshot.jpg' } },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Doorbell', message: 'Someone is at the front door', image: '/tmp/doorbell_snapshot.jpg' } },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'mode', mode: ['late_evening', 'late_night', 'night'] }],
            actions: [
              { type: 'command', entity_id: 'light.front_porch', command: 'turn_on', data: { brightness_pct: 100 } },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'parallel',
  },
];
