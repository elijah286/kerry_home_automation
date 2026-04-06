import type { AutomationRule } from '../engine.js';

const RANDOM_LIGHT_ENTITIES = [
  'light.living_room_main',
  'light.kitchen_pendant',
  'light.office_desk',
  'light.master_bedroom_lamp',
  'light.hallway',
  'light.dining_room',
];

export const seasonalRules: AutomationRule[] = [
  // ── Vacation Mode – Simulate Occupancy ─────────────────────────────────
  {
    id: 'vacation-simulate-occupancy',
    name: 'Vacation occupancy simulation',
    description: 'Turn random lights on/off every 30 minutes to simulate someone home',
    enabled: true,
    triggers: [{ type: 'time', cron: '*/30 * * * *' }],
    conditions: [{ type: 'mode', mode: 'vacation' }],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          for (const entityId of RANDOM_LIGHT_ENTITIES) {
            const shouldBeOn = Math.random() > 0.55;
            ctx.sendCommand(entityId, shouldBeOn ? 'turn_on' : 'turn_off');
          }
        },
      },
    ],
    mode: 'single',
  },

  // ── Vacation Mode – All Off at Late Night ──────────────────────────────
  {
    id: 'vacation-lights-off-late',
    name: 'Vacation lights off at midnight',
    description: 'Turn off all simulated lights at midnight for realism',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 0 * * *' }],
    conditions: [{ type: 'mode', mode: 'vacation' }],
    actions: RANDOM_LIGHT_ENTITIES.map((entityId) => ({
      type: 'command' as const,
      entity_id: entityId,
      command: 'turn_off',
    })),
    mode: 'single',
  },

  // ── Vacation Mode Reminder ─────────────────────────────────────────────
  {
    id: 'vacation-reminder',
    name: 'Vacation mode still active reminder',
    description: 'Daily reminder that vacation mode is on, in case you forgot to disable it',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 9 * * *' }],
    conditions: [{ type: 'mode', mode: 'vacation' }],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Vacation Mode Active',
          message: 'Your home is still in vacation mode. Disable it if you have returned.',
        },
      },
    ],
    mode: 'single',
  },

  // ── Dishwasher Not Run Alert ───────────────────────────────────────────
  {
    id: 'dishwasher-not-run',
    name: 'Dishwasher not run today alert',
    description: 'Remind to run the dishwasher if it hasn\'t been used by 9 PM',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 21 * * *' }],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const dw = ctx.getState('sensor.dishwasher_power');
          const lastRun = dw?.attributes['last_run'] as string | undefined;
          if (!lastRun) return true;
          const today = new Date().toDateString();
          return new Date(lastRun).toDateString() !== today;
        },
      },
      { type: 'mode', mode: ['home', 'guest'] },
    ],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Dishwasher', message: 'The dishwasher hasn\'t run today. Want to start a cycle?' },
      },
    ],
    mode: 'single',
  },

  // ── Holiday Lighting – On ──────────────────────────────────────────────
  {
    id: 'holiday-lights-on',
    name: 'Holiday lights on at sunset',
    description: 'Turn on holiday / decorative lights at sunset during holiday season',
    enabled: true,
    triggers: [{ type: 'sun', entity_id: 'sunset' }],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.holiday_season', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.holiday_lights_front', command: 'turn_on' },
      { type: 'command', entity_id: 'switch.holiday_lights_tree', command: 'turn_on' },
      { type: 'command', entity_id: 'switch.holiday_lights_patio', command: 'turn_on' },
    ],
    mode: 'single',
  },

  // ── Holiday Lighting – Off ─────────────────────────────────────────────
  {
    id: 'holiday-lights-off',
    name: 'Holiday lights off at 11 PM',
    description: 'Turn off holiday lights to save energy and be a good neighbor',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 23 * * *' }],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.holiday_season', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.holiday_lights_front', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.holiday_lights_tree', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.holiday_lights_patio', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Guest Mode – Keep Lights On ────────────────────────────────────────
  {
    id: 'guest-mode-lights-on',
    name: 'Guest mode: keep common area lights on',
    description: 'Prevent auto-off in common areas while guests are staying',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', to: 'guest' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_living', state: 'off' },
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_kitchen', state: 'off' },
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_hallway', state: 'off' },
      { type: 'command', entity_id: 'light.guest_bedroom_lamp', command: 'turn_on', data: { brightness: 180 } },
      { type: 'command', entity_id: 'light.hallway', command: 'turn_on', data: { brightness: 120 } },
    ],
    mode: 'single',
  },

  // ── Guest Mode – Restore Auto-Off on Exit ──────────────────────────────
  {
    id: 'guest-mode-restore',
    name: 'Guest mode end: restore auto-off',
    description: 'Re-enable automatic light-off timers when guest mode is cleared',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', from: 'guest' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_living', state: 'on' },
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_kitchen', state: 'on' },
      { type: 'set_state', entity_id: 'input_boolean.auto_lights_off_hallway', state: 'on' },
    ],
    mode: 'single',
  },

  // ── Package Delivered ──────────────────────────────────────────────────
  {
    id: 'package-delivered-alert',
    name: 'Package delivery alert',
    description: 'Notify when motion is detected at the front door during delivery hours',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.front_door_motion', to: 'on' },
    ],
    conditions: [
      { type: 'time_window', after: '08:00', before: '19:00' },
      { type: 'state', entity_id: 'binary_sensor.front_door_contact', state: 'off' },
    ],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Front Door Activity',
          message: 'Motion detected at the front door — possible package delivery.',
          data: { image: '/api/camera/front_door/snapshot' },
        },
      },
    ],
    mode: 'single',
  },

  // ── Fans On When Arriving Home If Hot ──────────────────────────────────
  {
    id: 'fans-on-arrive-hot',
    name: 'Turn on fans when arriving if hot',
    description: 'Start ceiling fans when someone comes home and indoor temp is high',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', to: 'on' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const temp = ctx.getState('sensor.indoor_temperature');
          return temp !== undefined && parseFloat(temp.state) > 78;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'fan.living_room_ceiling', command: 'turn_on', data: { speed: 'high' } },
      { type: 'command', entity_id: 'fan.master_bedroom_ceiling', command: 'turn_on', data: { speed: 'medium' } },
      { type: 'command', entity_id: 'fan.office_ceiling', command: 'turn_on', data: { speed: 'medium' } },
    ],
    mode: 'single',
  },

  // ── Battery Low Alerts ─────────────────────────────────────────────────
  {
    id: 'battery-low-alert',
    name: 'Sensor battery low alert',
    description: 'Daily scan for sensors with battery below 15% and send a summary',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 8 * * *' }],
    conditions: [],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          const batteryEntities = [
            'sensor.front_door_battery',
            'sensor.back_door_battery',
            'sensor.garage_door_battery',
            'sensor.motion_hallway_battery',
            'sensor.motion_kitchen_battery',
            'sensor.motion_living_room_battery',
            'sensor.leak_sensor_kitchen_battery',
            'sensor.leak_sensor_laundry_battery',
            'sensor.smoke_detector_battery',
            'sensor.thermostat_battery',
          ];
          const low: string[] = [];
          for (const id of batteryEntities) {
            const state = ctx.getState(id);
            if (state && parseFloat(state.state) < 15) {
              low.push(`${id.replace('sensor.', '').replace(/_battery$/, '').replace(/_/g, ' ')} (${state.state}%)`);
            }
          }
          if (low.length > 0) {
            ctx.sendCommand('notify.mobile_app', 'send', {
              title: 'Low Battery',
              message: `These sensors need batteries: ${low.join(', ')}`,
            });
          }
        },
      },
    ],
    mode: 'single',
  },

  // ── Network Device Offline Alert ───────────────────────────────────────
  {
    id: 'network-device-offline',
    name: 'Network device offline alert',
    description: 'Alert when a critical network device goes offline',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.unifi_gateway_online', to: 'off' },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Network Alert',
          message: 'A critical network device has gone offline. Check the UniFi dashboard.',
          data: { priority: 'high' },
        },
      },
    ],
    mode: 'single',
  },

  // ── NAS Offline Alert ──────────────────────────────────────────────────
  {
    id: 'nas-offline-alert',
    name: 'NAS offline alert',
    description: 'Notify when the NAS becomes unreachable',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.synology_nas_online', to: 'off' },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'NAS Offline',
          message: 'Synology NAS is unreachable — backups may be affected.',
          data: { priority: 'high' },
        },
      },
    ],
    mode: 'single',
  },

  // ── Kiosk Brightness – Day ─────────────────────────────────────────────
  {
    id: 'kiosk-brightness-day',
    name: 'Kiosk bright during the day',
    description: 'Set kiosk screen to full brightness during daytime hours',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 7 * * *' }],
    conditions: [{ type: 'mode', mode: ['home', 'guest'] }],
    actions: [
      { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_on', data: { brightness: 255 } },
    ],
    mode: 'single',
  },

  // ── Kiosk Brightness – Night ───────────────────────────────────────────
  {
    id: 'kiosk-brightness-night',
    name: 'Kiosk dim at night',
    description: 'Dim kiosk screen in the evening to reduce glare',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 21 * * *' }],
    conditions: [{ type: 'mode', mode: ['home', 'guest'] }],
    actions: [
      { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_on', data: { brightness: 30 } },
    ],
    mode: 'single',
  },

  // ── Kiosk Screensaver at Night ─────────────────────────────────────────
  {
    id: 'kiosk-screensaver-night',
    name: 'Kiosk screensaver at midnight',
    description: 'Activate screensaver / screen-off on the kiosk at midnight',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 0 * * *' }],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_off' },
      { type: 'set_state', entity_id: 'input_boolean.kiosk_screensaver', state: 'on' },
    ],
    mode: 'single',
  },

  // ── Kiosk Wake on Motion ───────────────────────────────────────────────
  {
    id: 'kiosk-wake-on-motion',
    name: 'Kiosk wake on motion',
    description: 'Wake the kiosk screen when motion is detected nearby',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.kiosk_proximity', to: 'on' },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.kiosk_screensaver', state: 'on' },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.kiosk_screensaver', state: 'off' },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'time_window', after: '07:00', before: '21:00' }],
            actions: [
              { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_on', data: { brightness: 255 } },
            ],
          },
          {
            conditions: [{ type: 'time_window', after: '21:00', before: '07:00' }],
            actions: [
              { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_on', data: { brightness: 30 } },
            ],
          },
        ],
      },
    ],
    mode: 'single',
  },

  // ── Laundry Done Notification ──────────────────────────────────────────
  {
    id: 'laundry-done-notification',
    name: 'Laundry cycle done notification',
    description: 'Alert when the washing machine power drops, indicating cycle completion',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.washing_machine_power', below: 5 },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const wm = ctx.getState('sensor.washing_machine_power');
          return wm !== undefined && parseFloat(wm.state) < 5;
        },
      },
    ],
    actions: [
      { type: 'delay', delay_ms: 60_000 },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Laundry', message: 'Washing machine cycle is complete. Time to move clothes to the dryer!' },
      },
    ],
    mode: 'single',
  },

  // ── Water Leak Detection ───────────────────────────────────────────────
  {
    id: 'water-leak-alert',
    name: 'Water leak detected',
    description: 'Urgent alert when any water leak sensor triggers',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.leak_sensor_kitchen', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.leak_sensor_laundry', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.leak_sensor_bathroom', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'valve.main_water_shutoff', command: 'close_valve' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'WATER LEAK DETECTED',
          message: 'A water leak sensor has triggered! Main water valve has been shut off.',
          data: { priority: 'critical' },
        },
      },
    ],
    mode: 'parallel',
  },

  // ── Smoke/CO Alarm ─────────────────────────────────────────────────────
  {
    id: 'smoke-co-alarm',
    name: 'Smoke or CO alarm activated',
    description: 'Emergency actions when smoke or CO is detected',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.smoke_alarm', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.co_alarm', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.all_lights', command: 'turn_on', data: { brightness: 255 } },
      { type: 'command', entity_id: 'climate.main_hvac', command: 'turn_off' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'EMERGENCY: Smoke/CO Detected',
          message: 'Smoke or carbon monoxide alarm has been triggered! All lights turned on, HVAC shut off. Evacuate immediately.',
          data: { priority: 'critical' },
        },
      },
    ],
    mode: 'parallel',
  },

  // ── Garage Left Open Alert ─────────────────────────────────────────────
  {
    id: 'garage-left-open',
    name: 'Garage left open alert',
    description: 'Notify if the garage door has been open for over 30 minutes at night',
    enabled: true,
    triggers: [{ type: 'time', cron: '*/30 21-23,0-5 * * *' }],
    conditions: [
      { type: 'state', entity_id: 'cover.garage_door', state: 'open' },
    ],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: {
          title: 'Garage Door',
          message: 'The garage door is still open. Would you like to close it?',
          data: { actions: [{ action: 'close_garage', title: 'Close Garage' }] },
        },
      },
    ],
    mode: 'single',
  },

  // ── Good Morning Routine ───────────────────────────────────────────────
  {
    id: 'good-morning-routine',
    name: 'Good morning routine',
    description: 'Morning sequence: lights, kiosk, weather briefing on weekday alarms',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.morning_alarm', to: 'on' },
    ],
    conditions: [{ type: 'mode', mode: 'home' }],
    actions: [
      { type: 'command', entity_id: 'light.master_bedroom_lamp', command: 'turn_on', data: { brightness: 80, color_temp: 350 } },
      { type: 'delay', delay_ms: 300_000 },
      { type: 'command', entity_id: 'light.kitchen_pendant', command: 'turn_on', data: { brightness: 200 } },
      { type: 'command', entity_id: 'light.kiosk_screen', command: 'turn_on', data: { brightness: 255 } },
      { type: 'set_state', entity_id: 'input_boolean.kiosk_screensaver', state: 'off' },
    ],
    mode: 'restart',
  },
];
