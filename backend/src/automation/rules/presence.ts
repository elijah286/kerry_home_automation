import type { AutomationRule, ActionConfig } from '../engine.js';

// ---------------------------------------------------------------------------
// Entity constants
// ---------------------------------------------------------------------------

const MODE_ENTITY = 'sensor.system_mode';
const SOLAR_ENTITY = 'sensor.apf_generation_entity';
const ALARM_ENTITY = 'alarm_control_panel.home';
const HVAC_ENTITY = 'climate.home';
const ANYONE_HOME_ENTITY = 'binary_sensor.anyone_home';

const PERSON_ENTITIES = [
  'person.elijah',
  'person.meghan',
] as const;

const DOOR_SENSORS = [
  { entityId: 'binary_sensor.front_door', name: 'Front Door' },
  { entityId: 'binary_sensor.back_door', name: 'Back Door' },
  { entityId: 'binary_sensor.garage_entry_door', name: 'Garage Entry Door' },
  { entityId: 'binary_sensor.patio_door', name: 'Patio Door' },
] as const;

const WINDOW_SENSORS = [
  { entityId: 'binary_sensor.kitchen_window', name: 'Kitchen Window' },
  { entityId: 'binary_sensor.living_room_window_left', name: 'Living Room Window Left' },
  { entityId: 'binary_sensor.living_room_window_right', name: 'Living Room Window Right' },
  { entityId: 'binary_sensor.office_window', name: 'Office Window' },
  { entityId: 'binary_sensor.main_bedroom_window', name: 'Main Bedroom Window' },
  { entityId: 'binary_sensor.master_bedroom_window', name: 'Master Bedroom Window' },
] as const;

const ALL_PORTAL_SENSORS = [
  ...DOOR_SENSORS.map((d) => d.entityId),
  ...WINDOW_SENSORS.map((w) => w.entityId),
];

const ALL_LIGHT_ENTITIES = [
  'light.kitchen_main', 'light.kitchen_island', 'light.kitchen_under_cabinet',
  'light.living_room_main', 'light.living_room_lamps',
  'light.office_overhead', 'light.office_desk_lamp',
  'light.dining_room_chandelier', 'light.entry_pendant',
  'light.game_room_main', 'light.game_room_accent',
  'light.movie_room_main', 'light.movie_room_sconces',
  'light.main_bedroom_overhead', 'light.main_bedroom_lamps',
  'light.master_bedroom_overhead', 'light.master_bedroom_nightstands',
  'light.stairs_main', 'light.top_of_stairs_main',
  'light.garage_main', 'light.laundry_room_main',
  'light.front_porch_main', 'light.front_porch_sconces',
  'light.backyard_flood', 'light.backyard_string_lights',
  'light.boys_bathroom_vanity', 'light.boys_bathroom_overhead',
  'light.sloanes_bathroom_vanity', 'light.sloanes_bathroom_overhead',
  'light.bathroom_suite_vanity', 'light.bathroom_suite_overhead',
  'light.powder_room_vanity',
  'light.guest_room_overhead', 'light.guest_room_lamp',
  'light.patio_overhead', 'light.patio_string_lights',
];

const NIGHT_ALERT_LIGHTS = [
  'light.main_bedroom_lamps',
  'light.master_bedroom_nightstands',
  'light.stairs_main',
  'light.entry_pendant',
];

// ---------------------------------------------------------------------------
// Mode supplementary automations
// ---------------------------------------------------------------------------

const lateEveningMode: AutomationRule = {
  id: 'presence.mode.late_evening',
  name: 'Late evening mode at 9 PM',
  description: 'Supplementary trigger for late evening mode at 9 PM (backs up mode machine)',
  enabled: true,
  triggers: [
    { type: 'time', cron: '0 21 * * *' },
  ],
  conditions: [
    { type: 'mode', mode: 'evening' },
  ],
  actions: [
    { type: 'set_state', entity_id: MODE_ENTITY, state: 'late_evening' },
  ],
};

const nightMode: AutomationRule = {
  id: 'presence.mode.night',
  name: 'Night mode at 11 PM',
  description: 'Supplementary trigger for late night mode at 11 PM',
  enabled: true,
  triggers: [
    { type: 'time', cron: '0 23 * * *' },
  ],
  conditions: [
    { type: 'mode', mode: 'late_evening' },
  ],
  actions: [
    { type: 'set_state', entity_id: MODE_ENTITY, state: 'late_night' },
  ],
};

const darkDaytimeMode: AutomationRule = {
  id: 'presence.mode.dark_daytime_on',
  name: 'Dark daytime – low solar triggers evening-like state',
  description: 'When solar drops below 1.5kW during day mode, publish a dark_daytime event for lighting automations',
  enabled: true,
  triggers: [
    {
      type: 'threshold',
      entity_id: SOLAR_ENTITY,
      below: 1500,
    },
  ],
  conditions: [
    { type: 'mode', mode: 'day' },
    { type: 'time_window', after: '09:00', before: '17:00' },
  ],
  actions: [
    {
      type: 'set_state',
      entity_id: 'input_boolean.dark_daytime',
      state: 'on',
      attributes: { source: 'solar_threshold', timestamp: Date.now() },
    },
  ],
};

const darkDaytimeOff: AutomationRule = {
  id: 'presence.mode.dark_daytime_off',
  name: 'Dark daytime – solar recovery',
  description: 'When solar rises above 1.5kW during day mode, clear the dark daytime flag',
  enabled: true,
  triggers: [
    {
      type: 'threshold',
      entity_id: SOLAR_ENTITY,
      above: 1500,
    },
  ],
  conditions: [
    { type: 'mode', mode: 'day' },
    {
      type: 'state',
      entity_id: 'input_boolean.dark_daytime',
      state: 'on',
    },
  ],
  actions: [
    {
      type: 'set_state',
      entity_id: 'input_boolean.dark_daytime',
      state: 'off',
    },
  ],
};

const weekdayMorningRoutine: AutomationRule = {
  id: 'presence.mode.weekday_morning',
  name: 'Weekday morning routine',
  description: 'At 6:15 AM on weekdays, begin morning routine transitions',
  enabled: true,
  triggers: [
    { type: 'time', cron: '15 6 * * 1-5' },
  ],
  conditions: [
    { type: 'mode', mode: 'night' },
  ],
  actions: [
    { type: 'set_state', entity_id: MODE_ENTITY, state: 'morning' },
  ],
};

const weekendMorningRoutine: AutomationRule = {
  id: 'presence.mode.weekend_morning',
  name: 'Weekend morning routine',
  description: 'At 7:30 AM on weekends, begin morning routine transitions',
  enabled: true,
  triggers: [
    { type: 'time', cron: '30 7 * * 0,6' },
  ],
  conditions: [
    { type: 'mode', mode: 'night' },
  ],
  actions: [
    { type: 'set_state', entity_id: MODE_ENTITY, state: 'morning' },
  ],
};

// ---------------------------------------------------------------------------
// Presence automations
// ---------------------------------------------------------------------------

const lastPersonLeaves: AutomationRule = {
  id: 'presence.away.last_person_leaves',
  name: 'Last person leaves – arm & shutdown',
  description: 'When nobody is home, arm the alarm, turn off all lights, and set HVAC to away mode',
  enabled: true,
  mode: 'single',
  triggers: [
    {
      type: 'state_change',
      entity_id: ANYONE_HOME_ENTITY,
      to: 'off',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: ALARM_ENTITY, command: 'arm_away' },
    { type: 'command', entity_id: HVAC_ENTITY, command: 'set_preset_mode', data: { preset_mode: 'away' } },
    ...ALL_LIGHT_ENTITIES.map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_off',
    })),
    {
      type: 'set_state',
      entity_id: 'input_boolean.away_mode',
      state: 'on',
    },
  ],
};

const firstPersonArrives: AutomationRule = {
  id: 'presence.home.first_person_arrives',
  name: 'First person arrives – disarm & restore',
  description: 'When someone arrives home, disarm alarm and restore HVAC to normal schedule',
  enabled: true,
  mode: 'single',
  triggers: [
    {
      type: 'state_change',
      entity_id: ANYONE_HOME_ENTITY,
      from: 'off',
      to: 'on',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: ALARM_ENTITY, command: 'disarm' },
    { type: 'command', entity_id: HVAC_ENTITY, command: 'set_preset_mode', data: { preset_mode: 'home' } },
    {
      type: 'set_state',
      entity_id: 'input_boolean.away_mode',
      state: 'off',
    },
    {
      type: 'choose',
      choices: [
        {
          conditions: [{ type: 'mode', mode: ['evening', 'late_evening'] }],
          actions: [
            { type: 'command', entity_id: 'light.entry_pendant', command: 'turn_on', data: { brightness_pct: 80 } },
            { type: 'command', entity_id: 'light.kitchen_main', command: 'turn_on', data: { brightness_pct: 60 } },
            { type: 'command', entity_id: 'light.living_room_lamps', command: 'turn_on', data: { brightness_pct: 50 } },
          ],
        },
        {
          conditions: [{ type: 'mode', mode: ['late_night', 'night'] }],
          actions: [
            { type: 'command', entity_id: 'light.entry_pendant', command: 'turn_on', data: { brightness_pct: 20 } },
            { type: 'command', entity_id: 'light.stairs_main', command: 'turn_on', data: { brightness_pct: 10 } },
          ],
        },
      ],
      default_actions: [],
    },
  ],
};

function personArriveRule(person: string): AutomationRule {
  const slug = person.replace('person.', '');
  return {
    id: `presence.home.${slug}_arrives`,
    name: `${slug.charAt(0).toUpperCase() + slug.slice(1)} arrives home`,
    description: `Track when ${slug} arrives home and update presence state`,
    enabled: true,
    triggers: [
      {
        type: 'state_change',
        entity_id: person,
        to: 'home',
      },
    ],
    conditions: [],
    actions: [
      {
        type: 'set_state',
        entity_id: `binary_sensor.${slug}_home`,
        state: 'on',
        attributes: { arrived_at: new Date().toISOString() },
      },
      {
        type: 'call',
        fn: async (ctx) => {
          const allHome = PERSON_ENTITIES.every((p) => {
            const st = ctx.getState(p);
            return st?.state === 'home';
          });
          if (allHome) {
            ctx.sendCommand(ANYONE_HOME_ENTITY, 'set_state', { state: 'on' });
          }
        },
      },
    ],
  };
}

function personLeaveRule(person: string): AutomationRule {
  const slug = person.replace('person.', '');
  return {
    id: `presence.away.${slug}_leaves`,
    name: `${slug.charAt(0).toUpperCase() + slug.slice(1)} leaves home`,
    description: `Track when ${slug} leaves and update presence state`,
    enabled: true,
    triggers: [
      {
        type: 'state_change',
        entity_id: person,
        from: 'home',
      },
    ],
    conditions: [],
    actions: [
      {
        type: 'set_state',
        entity_id: `binary_sensor.${slug}_home`,
        state: 'off',
      },
      {
        type: 'call',
        fn: async (ctx) => {
          const anyHome = PERSON_ENTITIES.some((p) => {
            const st = ctx.getState(p);
            return st?.state === 'home';
          });
          if (!anyHome) {
            ctx.sendCommand(ANYONE_HOME_ENTITY, 'set_state', { state: 'off' });
          }
        },
      },
    ],
  };
}

const personRules = PERSON_ENTITIES.flatMap((p) => [personArriveRule(p), personLeaveRule(p)]);

// ---------------------------------------------------------------------------
// Door / window monitoring
// ---------------------------------------------------------------------------

function doorNightAlertRule(
  sensor: { entityId: string; name: string },
): AutomationRule {
  const slug = sensor.entityId.replace('binary_sensor.', '');
  return {
    id: `presence.door.${slug}_night_alert`,
    name: `${sensor.name} – night open alert`,
    description: `Flash lights and send alert when ${sensor.name.toLowerCase()} opens during night mode`,
    enabled: true,
    mode: 'single',
    triggers: [
      {
        type: 'state_change',
        entity_id: sensor.entityId,
        to: 'on',
      },
    ],
    conditions: [
      { type: 'mode', mode: ['late_night', 'night'] },
    ],
    actions: [
      {
        type: 'sequence',
        actions: [
          ...NIGHT_ALERT_LIGHTS.map<ActionConfig>((entity) => ({
            type: 'command',
            entity_id: entity,
            command: 'turn_on',
            data: { brightness_pct: 100, flash: 'short' },
          })),
          {
            type: 'set_state',
            entity_id: 'input_boolean.portal_alert',
            state: 'on',
            attributes: { source: sensor.entityId, name: sensor.name, opened_at: Date.now() },
          },
        ],
      },
    ],
  };
}

function portalLeftOpenRule(
  sensor: { entityId: string; name: string },
): AutomationRule {
  const slug = sensor.entityId.replace('binary_sensor.', '');
  return {
    id: `presence.portal.${slug}_left_open`,
    name: `${sensor.name} – left open alert`,
    description: `Send alert when ${sensor.name.toLowerCase()} has been open for more than 1 minute`,
    enabled: true,
    mode: 'restart',
    triggers: [
      {
        type: 'state_change',
        entity_id: sensor.entityId,
        to: 'on',
      },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 60_000 },
      {
        type: 'call',
        fn: async (ctx) => {
          const state = ctx.getState(sensor.entityId);
          if (state?.state === 'on') {
            ctx.sendCommand('notify.mobile_app', 'send', {
              title: 'Portal Alert',
              message: `${sensor.name} has been open for over 1 minute`,
              data: { entity_id: sensor.entityId, priority: 'high' },
            });
          }
        },
      },
    ],
  };
}

const doorNightAlertRules = DOOR_SENSORS.map(doorNightAlertRule);

const portalLeftOpenRules = [
  ...DOOR_SENSORS.map(portalLeftOpenRule),
  ...WINDOW_SENSORS.map(portalLeftOpenRule),
];

const allPortalsClosed: AutomationRule = {
  id: 'presence.portal.all_closed',
  name: 'All portals closed – clear alert',
  description: 'Clear the portal alert flag when all doors and windows are closed',
  enabled: true,
  triggers: ALL_PORTAL_SENSORS.map((entityId) => ({
    type: 'state_change' as const,
    entity_id: entityId,
    to: 'off',
  })),
  conditions: [
    {
      type: 'template',
      fn: (ctx) =>
        ALL_PORTAL_SENSORS.every((id) => {
          const st = ctx.getState(id);
          return !st || st.state === 'off';
        }),
    },
  ],
  actions: [
    {
      type: 'set_state',
      entity_id: 'input_boolean.portal_alert',
      state: 'off',
    },
  ],
};

// ---------------------------------------------------------------------------
// Extended away detection
// ---------------------------------------------------------------------------

const extendedAway: AutomationRule = {
  id: 'presence.away.extended',
  name: 'Extended away – deep energy savings',
  description: 'After 4 hours with nobody home, reduce HVAC further and disable non-essential systems',
  enabled: true,
  mode: 'single',
  triggers: [
    {
      type: 'state_change',
      entity_id: ANYONE_HOME_ENTITY,
      to: 'off',
    },
  ],
  conditions: [],
  actions: [
    { type: 'delay', delay_ms: 14_400_000 },
    {
      type: 'call',
      fn: async (ctx) => {
        const homeState = ctx.getState(ANYONE_HOME_ENTITY);
        if (homeState?.state !== 'off') return;
        ctx.sendCommand(HVAC_ENTITY, 'set_temperature', { temperature: 60 });
        ctx.sendCommand('water_heater.main', 'set_temperature', { temperature: 95 });
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Occupancy-linked HVAC boost
// ---------------------------------------------------------------------------

const occupancyHvacBoost: AutomationRule = {
  id: 'presence.hvac.occupancy_boost',
  name: 'Occupied rooms – HVAC boost',
  description: 'When high-traffic areas are occupied in extreme temperatures, boost HVAC',
  enabled: true,
  mode: 'restart',
  triggers: [
    { type: 'state_change', entity_id: 'binary_sensor.e5459ce674a2413db021c981cba209da_occupancy', to: 'on' },
    { type: 'state_change', entity_id: 'binary_sensor.f9a4c709625e4bbeb1ed2738f553ced5_occupancy', to: 'on' },
  ],
  conditions: [
    {
      type: 'template',
      fn: (ctx) => {
        const outdoor = ctx.getState('sensor.outdoor_temperature');
        if (!outdoor) return false;
        const temp = parseFloat(outdoor.state);
        return temp > 95 || temp < 35;
      },
    },
  ],
  actions: [
    { type: 'command', entity_id: HVAC_ENTITY, command: 'set_preset_mode', data: { preset_mode: 'boost' } },
    { type: 'delay', delay_ms: 1_800_000 },
    { type: 'command', entity_id: HVAC_ENTITY, command: 'set_preset_mode', data: { preset_mode: 'home' } },
  ],
};

// ---------------------------------------------------------------------------
// Guest mode detection
// ---------------------------------------------------------------------------

const guestPresenceDetected: AutomationRule = {
  id: 'presence.guest.detected',
  name: 'Guest presence detected in guest room',
  description: 'Enable guest mode when sustained occupancy detected in guest room while nobody assigned lives there',
  enabled: true,
  mode: 'single',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'binary_sensor.meghan_s_office_occupancy',
      to: 'on',
    },
  ],
  conditions: [
    { type: 'mode', mode: ['late_night', 'night'] },
  ],
  actions: [
    { type: 'delay', delay_ms: 600_000 },
    {
      type: 'call',
      fn: async (ctx) => {
        const occ = ctx.getState('binary_sensor.meghan_s_office_occupancy');
        if (occ?.state !== 'on') return;
        ctx.sendCommand('input_boolean.guest_mode', 'turn_on', {});
        ctx.sendCommand('notify.mobile_app', 'send', {
          title: 'Guest Detected',
          message: 'Sustained occupancy in guest room during night — guest mode enabled',
          data: { priority: 'low' },
        });
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Consolidated export
// ---------------------------------------------------------------------------

export const presenceRules: AutomationRule[] = [
  // Mode supplementary
  lateEveningMode,
  nightMode,
  darkDaytimeMode,
  darkDaytimeOff,
  weekdayMorningRoutine,
  weekendMorningRoutine,

  // Presence
  lastPersonLeaves,
  firstPersonArrives,
  ...personRules,
  extendedAway,
  occupancyHvacBoost,
  guestPresenceDetected,

  // Door / window monitoring
  ...doorNightAlertRules,
  ...portalLeftOpenRules,
  allPortalsClosed,
];
