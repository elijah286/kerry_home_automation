import type { AutomationRule } from '../engine.js';

export const hvacRules: AutomationRule[] = [
  // -------------------------------------------------------------------------
  // Fireplace
  // -------------------------------------------------------------------------
  {
    id: 'hvac.fireplace_on_cold',
    name: 'Fireplace on when temp drops below 50°F',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.outdoor_temperature', below: 50 },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
      { type: 'mode', mode: ['evening', 'late_evening'] },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.fireplace', command: 'turn_on' },
    ],
    mode: 'single',
  },

  {
    id: 'hvac.fireplace_off_warm',
    name: 'Fireplace off when temp rises above 55°F',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.outdoor_temperature', above: 55 },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.fireplace', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.fireplace', command: 'turn_off' },
    ],
  },

  {
    id: 'hvac.fireplace_off_bedtime',
    name: 'Fireplace off at bedtime',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'late_night' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.fireplace', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Fan on arrival
  // -------------------------------------------------------------------------
  {
    id: 'hvac.fan_on_arrival_hot',
    name: 'Fan on when arriving home if temp over 70°F',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'off', to: 'on' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const temp = ctx.getState('sensor.indoor_temperature');
          return temp !== undefined && parseFloat(temp.state) > 70;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'fan.living_room', command: 'turn_on', data: { speed: 'high' } },
      { type: 'command', entity_id: 'fan.master_bedroom', command: 'turn_on', data: { speed: 'medium' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Night HVAC setback
  // -------------------------------------------------------------------------
  {
    id: 'hvac.night_setback',
    name: 'Night HVAC setback – lower temp',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'late_evening' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
    ],
    actions: [
      {
        type: 'choose',
        choices: [
          {
            conditions: [{
              type: 'template',
              fn: (ctx) => {
                const mode = ctx.getState('climate.whole_house');
                return mode?.attributes?.hvac_mode === 'cool';
              },
            }],
            actions: [
              { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 68 } },
            ],
          },
          {
            conditions: [{
              type: 'template',
              fn: (ctx) => {
                const mode = ctx.getState('climate.whole_house');
                return mode?.attributes?.hvac_mode === 'heat';
              },
            }],
            actions: [
              { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 65 } },
            ],
          },
        ],
        default_actions: [
          { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 68 } },
        ],
      },
    ],
  },

  {
    id: 'hvac.morning_restore',
    name: 'Morning HVAC restore – comfortable temp',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'sensor.system_mode', to: 'morning' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.anyone_home', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 72 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Vacation HVAC mode
  // -------------------------------------------------------------------------
  {
    id: 'hvac.vacation_mode_on',
    name: 'Vacation mode – energy saving setpoints',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.vacation_mode', to: 'on' },
    ],
    conditions: [],
    actions: [
      {
        type: 'choose',
        choices: [
          {
            conditions: [{
              type: 'template',
              fn: (ctx) => {
                const temp = ctx.getState('sensor.outdoor_temperature');
                return temp !== undefined && parseFloat(temp.state) > 60;
              },
            }],
            actions: [
              { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 82 } },
            ],
          },
        ],
        default_actions: [
          { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 58 } },
        ],
      },
      { type: 'command', entity_id: 'fan.living_room', command: 'turn_off' },
      { type: 'command', entity_id: 'fan.master_bedroom', command: 'turn_off' },
    ],
  },

  {
    id: 'hvac.vacation_mode_off',
    name: 'Vacation mode off – restore comfortable',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.vacation_mode', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 72 } },
    ],
  },

  // -------------------------------------------------------------------------
  // Game room fans with motion
  // -------------------------------------------------------------------------
  {
    id: 'hvac.game_room_fan_motion_hot',
    name: 'Game room fan on with motion if temp over 70°F',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.game_room_motion', to: 'on' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => {
          const temp = ctx.getState('sensor.game_room_temperature');
          return temp !== undefined && parseFloat(temp.state) > 70;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'fan.game_room', command: 'turn_on', data: { speed: 'medium' } },
    ],
    mode: 'single',
  },

  {
    id: 'hvac.game_room_fan_no_motion',
    name: 'Game room fan off after no motion for 30 min',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.game_room_motion', to: 'off' },
    ],
    conditions: [
      { type: 'state', entity_id: 'fan.game_room', state: 'on' },
    ],
    actions: [
      { type: 'delay', delay_ms: 1_800_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'binary_sensor.game_room_motion', state: 'off' }],
            actions: [
              { type: 'command', entity_id: 'fan.game_room', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Window open → disable HVAC zone
  // -------------------------------------------------------------------------
  {
    id: 'hvac.window_open_disable_zone',
    name: 'Window open – disable HVAC for that zone',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.kitchen_window', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.master_bedroom_window', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.living_room_window', to: 'on' },
      { type: 'state_change', entity_id: 'binary_sensor.game_room_window', to: 'on' },
    ],
    conditions: [],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          const windowToZone: Record<string, string> = {
            'binary_sensor.kitchen_window': 'climate.zone_kitchen',
            'binary_sensor.master_bedroom_window': 'climate.zone_master',
            'binary_sensor.living_room_window': 'climate.zone_living',
            'binary_sensor.game_room_window': 'climate.zone_game_room',
          };
          const entityId = ctx.trigger.entity_id;
          if (entityId && windowToZone[entityId]) {
            ctx.sendCommand(windowToZone[entityId], 'set_hvac_mode', { hvac_mode: 'off' });
            ctx.sendCommand('notify.mobile_family', 'send', {
              title: 'HVAC',
              message: `Window open – disabled HVAC for ${entityId.replace('binary_sensor.', '').replace('_window', '')} zone`,
            });
          }
        },
      },
    ],
    mode: 'parallel',
  },

  {
    id: 'hvac.window_closed_restore_zone',
    name: 'Window closed – restore HVAC zone',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.kitchen_window', to: 'off' },
      { type: 'state_change', entity_id: 'binary_sensor.master_bedroom_window', to: 'off' },
      { type: 'state_change', entity_id: 'binary_sensor.living_room_window', to: 'off' },
      { type: 'state_change', entity_id: 'binary_sensor.game_room_window', to: 'off' },
    ],
    conditions: [],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          const windowToZone: Record<string, string> = {
            'binary_sensor.kitchen_window': 'climate.zone_kitchen',
            'binary_sensor.master_bedroom_window': 'climate.zone_master',
            'binary_sensor.living_room_window': 'climate.zone_living',
            'binary_sensor.game_room_window': 'climate.zone_game_room',
          };
          const entityId = ctx.trigger.entity_id;
          if (entityId && windowToZone[entityId]) {
            ctx.sendCommand(windowToZone[entityId], 'set_hvac_mode', { hvac_mode: 'auto' });
          }
        },
      },
    ],
    mode: 'parallel',
  },

  // -------------------------------------------------------------------------
  // Humidity management
  // -------------------------------------------------------------------------
  {
    id: 'hvac.high_humidity_dehumidify',
    name: 'High humidity – enable dehumidifier',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.indoor_humidity', above: 65 },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.dehumidifier', command: 'turn_on' },
    ],
    mode: 'single',
  },

  {
    id: 'hvac.humidity_normal_dehumidify_off',
    name: 'Humidity normal – dehumidifier off',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.indoor_humidity', below: 50 },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.dehumidifier', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.dehumidifier', command: 'turn_off' },
    ],
  },
];
