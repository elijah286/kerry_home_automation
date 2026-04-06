import type { AutomationRule } from '../engine.js';

export const poolRules: AutomationRule[] = [
  // ── Pool Heater – Morning warm-up ──────────────────────────────────────
  {
    id: 'pool-heater-morning-on',
    name: 'Pool heater morning warm-up',
    description: 'Turn on pool heater at 6 AM to reach target temp before first swim',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 6 * * *' }],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.pool_cover', state: 'on' },
      { type: 'mode', mode: ['home', 'guest'] },
    ],
    actions: [
      { type: 'command', entity_id: 'climate.pool_heater', command: 'set_temperature', data: { temperature: 82 } },
      { type: 'command', entity_id: 'climate.pool_heater', command: 'turn_on' },
    ],
    mode: 'single',
  },

  // ── Pool Heater – Off at midday ────────────────────────────────────────
  {
    id: 'pool-heater-midday-off',
    name: 'Pool heater midday off',
    description: 'Turn off pool heater at noon to save energy when sun takes over',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 12 * * *' }],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'climate.pool_heater', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Spa Pre-heat ───────────────────────────────────────────────────────
  {
    id: 'spa-preheat-evening',
    name: 'Spa pre-heat before evening',
    description: 'Start heating the spa at 4 PM so it is ready by 6 PM',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 16 * * *' }],
    conditions: [
      { type: 'mode', mode: ['home', 'guest'] },
    ],
    actions: [
      { type: 'command', entity_id: 'climate.spa_heater', command: 'set_temperature', data: { temperature: 102 } },
      { type: 'command', entity_id: 'climate.spa_heater', command: 'turn_on' },
      { type: 'command', entity_id: 'switch.spa_jets', command: 'turn_on' },
    ],
    mode: 'single',
  },

  // ── Spa Auto-off ───────────────────────────────────────────────────────
  {
    id: 'spa-auto-off',
    name: 'Spa auto-off at 10 PM',
    description: 'Turn off spa heater and jets at night for safety',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 22 * * *' }],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'climate.spa_heater', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.spa_jets', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Pump Schedule – On ─────────────────────────────────────────────────
  {
    id: 'pool-pump-on',
    name: 'Pool pump daily start',
    description: 'Run pool pump 8 hours a day starting at 6 AM (off-peak electric)',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 6 * * *' }],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
    ],
    mode: 'single',
  },

  // ── Pump Schedule – Off ────────────────────────────────────────────────
  {
    id: 'pool-pump-off',
    name: 'Pool pump daily stop',
    description: 'Stop pool pump after 8-hour cycle',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 14 * * *' }],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Water Temp – Too Hot Alert ─────────────────────────────────────────
  {
    id: 'pool-temp-too-hot',
    name: 'Pool water too hot alert',
    description: 'Notify when pool water exceeds safe temperature',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.pool_water_temperature', above: 95 },
    ],
    conditions: [],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Pool Alert', message: 'Pool water temperature is above 95°F — check heater settings.' },
      },
      { type: 'command', entity_id: 'climate.pool_heater', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Water Temp – Too Cold Alert ────────────────────────────────────────
  {
    id: 'pool-temp-too-cold',
    name: 'Pool water too cold alert',
    description: 'Notify when pool water drops below comfortable swimming temperature',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.pool_water_temperature', below: 65 },
    ],
    conditions: [{ type: 'mode', mode: ['home', 'guest'] }],
    actions: [
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Pool Alert', message: 'Pool water temperature dropped below 65°F.' },
      },
    ],
    mode: 'single',
  },

  // ── Pool Party Mode ────────────────────────────────────────────────────
  {
    id: 'pool-party-mode',
    name: 'Pool party mode',
    description: 'Activate all pool equipment, lighting and music for pool parties',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.pool_party_mode', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
      { type: 'command', entity_id: 'switch.pool_waterfall', command: 'turn_on' },
      { type: 'command', entity_id: 'light.pool_lights', command: 'turn_on', data: { brightness: 255, color_name: 'blue' } },
      { type: 'command', entity_id: 'light.pool_deck_lights', command: 'turn_on', data: { brightness: 200 } },
      { type: 'command', entity_id: 'switch.pool_speaker', command: 'turn_on' },
      { type: 'command', entity_id: 'climate.pool_heater', command: 'set_temperature', data: { temperature: 84 } },
    ],
    mode: 'restart',
  },

  // ── Pool Party Mode – Off ──────────────────────────────────────────────
  {
    id: 'pool-party-mode-off',
    name: 'Pool party mode off',
    description: 'Deactivate pool party extras when mode is turned off',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.pool_party_mode', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_waterfall', command: 'turn_off' },
      { type: 'command', entity_id: 'light.pool_lights', command: 'turn_off' },
      { type: 'command', entity_id: 'light.pool_deck_lights', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.pool_speaker', command: 'turn_off' },
    ],
    mode: 'single',
  },

  // ── Winter Freeze Protection ───────────────────────────────────────────
  {
    id: 'pool-freeze-protection',
    name: 'Pool freeze protection',
    description: 'Run pump and low-heat when outside temp nears freezing to prevent pipe damage',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.outdoor_temperature', below: 36 },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
      { type: 'command', entity_id: 'climate.pool_heater', command: 'set_temperature', data: { temperature: 50 } },
      { type: 'command', entity_id: 'climate.pool_heater', command: 'turn_on' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Freeze Protection', message: 'Pool freeze protection activated — pump and heater running.' },
      },
    ],
    mode: 'single',
  },

  // ── Freeze Protection – All Clear ─────────────────────────────────────
  {
    id: 'pool-freeze-protection-clear',
    name: 'Pool freeze protection all-clear',
    description: 'Restore normal pool operation once temperature rises above freezing',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.outdoor_temperature', above: 42 },
    ],
    conditions: [
      { type: 'state', entity_id: 'climate.pool_heater', state: 'heat' },
    ],
    actions: [
      { type: 'command', entity_id: 'climate.pool_heater', command: 'turn_off' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Freeze Protection', message: 'Temperature recovered — freeze protection deactivated.' },
      },
    ],
    mode: 'single',
  },
];
