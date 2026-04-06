import type { AutomationRule, ActionConfig, ConditionConfig } from '../engine.js';

// ---------------------------------------------------------------------------
// Area definitions for motion-based lighting
// ---------------------------------------------------------------------------

interface AreaLightingDef {
  areaId: string;
  slug: string;
  name: string;
  lightEntities: string[];
  offDelayMs: number;
  modes: string[];
  eveningBrightness?: number;
  nightlightEntity?: string;
}

const AREA_LIGHTING: AreaLightingDef[] = [
  {
    areaId: 'e5459ce674a2413db021c981cba209da',
    slug: 'kitchen',
    name: 'Kitchen',
    lightEntities: ['light.kitchen_main', 'light.kitchen_island', 'light.kitchen_under_cabinet'],
    offDelayMs: 180_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 60,
    nightlightEntity: 'light.kitchen_under_cabinet',
  },
  {
    areaId: 'f9a4c709625e4bbeb1ed2738f553ced5',
    slug: 'living_room',
    name: 'Living Room',
    lightEntities: ['light.living_room_main', 'light.living_room_lamps'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 50,
  },
  {
    areaId: 'office',
    slug: 'office',
    name: 'Office',
    lightEntities: ['light.office_overhead', 'light.office_desk_lamp'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 70,
  },
  {
    areaId: 'f51beaf21563495897829e971d748ad2',
    slug: 'dining_entry',
    name: 'Dining and Entry',
    lightEntities: ['light.dining_room_chandelier', 'light.entry_pendant'],
    offDelayMs: 180_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 45,
    nightlightEntity: 'light.entry_pendant',
  },
  {
    areaId: '19ff4d3f107a40b6b9fb5d5d3286ba21',
    slug: 'game_room',
    name: 'Game Room',
    lightEntities: ['light.game_room_main', 'light.game_room_accent'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 55,
  },
  {
    areaId: 'efb3aec330e6471fa134e90fb3801cb8',
    slug: 'movie_room',
    name: 'Movie Room',
    lightEntities: ['light.movie_room_main', 'light.movie_room_sconces'],
    offDelayMs: 600_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night'],
    eveningBrightness: 20,
  },
  {
    areaId: '0d29420636684b359c5ae362eebcb218',
    slug: 'main_bedroom',
    name: 'Main Bedroom',
    lightEntities: ['light.main_bedroom_overhead', 'light.main_bedroom_lamps'],
    offDelayMs: 180_000,
    modes: ['morning', 'evening', 'late_evening'],
    eveningBrightness: 35,
    nightlightEntity: 'light.main_bedroom_lamps',
  },
  {
    areaId: 'master_bedroom',
    slug: 'master_bedroom',
    name: 'Master Bedroom',
    lightEntities: ['light.master_bedroom_overhead', 'light.master_bedroom_nightstands'],
    offDelayMs: 180_000,
    modes: ['morning', 'evening', 'late_evening'],
    eveningBrightness: 35,
    nightlightEntity: 'light.master_bedroom_nightstands',
  },
  {
    areaId: 'stairs',
    slug: 'stairs',
    name: 'Stairs',
    lightEntities: ['light.stairs_main'],
    offDelayMs: 120_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 40,
    nightlightEntity: 'light.stairs_main',
  },
  {
    areaId: 'piano',
    slug: 'top_of_stairs',
    name: 'Top of Stairs',
    lightEntities: ['light.top_of_stairs_main'],
    offDelayMs: 120_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 40,
    nightlightEntity: 'light.top_of_stairs_main',
  },
  {
    areaId: 'garage',
    slug: 'garage',
    name: 'Garage',
    lightEntities: ['light.garage_main'],
    offDelayMs: 120_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 80,
  },
  {
    areaId: 'laundry_room',
    slug: 'laundry_room',
    name: 'Laundry Room',
    lightEntities: ['light.laundry_room_main'],
    offDelayMs: 120_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 80,
  },
  {
    areaId: 'front_porch',
    slug: 'front_porch',
    name: 'Front Porch',
    lightEntities: ['light.front_porch_main', 'light.front_porch_sconces'],
    offDelayMs: 300_000,
    modes: ['evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 80,
  },
  {
    areaId: 'backyard',
    slug: 'backyard',
    name: 'Backyard',
    lightEntities: ['light.backyard_flood', 'light.backyard_string_lights'],
    offDelayMs: 300_000,
    modes: ['evening', 'late_evening', 'late_night'],
    eveningBrightness: 80,
  },
  {
    areaId: 'boys_bathroom',
    slug: 'boys_bathroom',
    name: 'Boys Bathroom',
    lightEntities: ['light.boys_bathroom_vanity', 'light.boys_bathroom_overhead'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 60,
    nightlightEntity: 'light.boys_bathroom_vanity',
  },
  {
    areaId: 'sloanes_bathroom',
    slug: 'sloanes_bathroom',
    name: "Sloane's Bathroom",
    lightEntities: ['light.sloanes_bathroom_vanity', 'light.sloanes_bathroom_overhead'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 60,
    nightlightEntity: 'light.sloanes_bathroom_vanity',
  },
  {
    areaId: '497e0e4b9c024b418f9ad1012ac0a607',
    slug: 'bathroom_suite',
    name: 'Bathroom Suite',
    lightEntities: ['light.bathroom_suite_vanity', 'light.bathroom_suite_overhead'],
    offDelayMs: 300_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 50,
    nightlightEntity: 'light.bathroom_suite_vanity',
  },
  {
    areaId: 'downstairs_guest_bathroom',
    slug: 'powder_room',
    name: 'Powder Room',
    lightEntities: ['light.powder_room_vanity'],
    offDelayMs: 180_000,
    modes: ['morning', 'day', 'evening', 'late_evening', 'late_night', 'night'],
    eveningBrightness: 60,
  },
  {
    areaId: 'meghan_s_office',
    slug: 'guest_room',
    name: 'Guest Room',
    lightEntities: ['light.guest_room_overhead', 'light.guest_room_lamp'],
    offDelayMs: 180_000,
    modes: ['morning', 'day', 'evening', 'late_evening'],
    eveningBrightness: 45,
  },
  {
    areaId: 'patio',
    slug: 'patio',
    name: 'Patio',
    lightEntities: ['light.patio_overhead', 'light.patio_string_lights'],
    offDelayMs: 300_000,
    modes: ['evening', 'late_evening', 'late_night'],
    eveningBrightness: 70,
  },
];

// ---------------------------------------------------------------------------
// Rule builders
// ---------------------------------------------------------------------------

function motionOnRule(def: AreaLightingDef): AutomationRule {
  const turnOnActions: ActionConfig[] = def.lightEntities.map((entity) => ({
    type: 'command',
    entity_id: entity,
    command: 'turn_on',
  }));

  return {
    id: `lighting.${def.slug}.motion_on`,
    name: `${def.name} – Motion lights on`,
    description: `Turn on ${def.name.toLowerCase()} lights when occupancy detected and motion lighting is armed`,
    enabled: true,
    mode: 'restart',
    triggers: [
      {
        type: 'state_change',
        entity_id: `binary_sensor.${def.areaId}_occupancy`,
        to: 'on',
      },
    ],
    conditions: [
      {
        type: 'state',
        entity_id: `input_boolean.${def.areaId}_motion_lights_on`,
        state: 'on',
      },
      { type: 'mode', mode: def.modes },
    ],
    actions: turnOnActions,
  };
}

function motionOffRule(def: AreaLightingDef): AutomationRule {
  const turnOffActions: ActionConfig[] = def.lightEntities.map((entity) => ({
    type: 'command',
    entity_id: entity,
    command: 'turn_off',
  }));

  return {
    id: `lighting.${def.slug}.motion_off`,
    name: `${def.name} – Motion lights off`,
    description: `Turn off ${def.name.toLowerCase()} lights after occupancy clears`,
    enabled: true,
    mode: 'restart',
    triggers: [
      {
        type: 'state_change',
        entity_id: `binary_sensor.${def.areaId}_occupancy`,
        to: 'off',
      },
    ],
    conditions: [
      {
        type: 'state',
        entity_id: `input_boolean.${def.areaId}_motion_lights_on`,
        state: 'on',
      },
    ],
    actions: [
      { type: 'delay', delay_ms: def.offDelayMs },
      ...turnOffActions,
    ],
  };
}

function nightModeOnRule(def: AreaLightingDef): AutomationRule | null {
  if (!def.nightlightEntity) return null;

  const offEntities = def.lightEntities.filter((e) => e !== def.nightlightEntity);
  const actions: ActionConfig[] = [
    ...offEntities.map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_off',
    })),
    {
      type: 'command',
      entity_id: def.nightlightEntity,
      command: 'turn_on',
      data: { brightness_pct: 5 },
    },
  ];

  return {
    id: `lighting.${def.slug}.night_motion_on`,
    name: `${def.name} – Night motion lights on (dim)`,
    description: `Activate nightlight in ${def.name.toLowerCase()} during night modes on motion`,
    enabled: true,
    mode: 'restart',
    triggers: [
      {
        type: 'state_change',
        entity_id: `binary_sensor.${def.areaId}_occupancy`,
        to: 'on',
      },
    ],
    conditions: [
      {
        type: 'state',
        entity_id: `input_boolean.${def.areaId}_motion_lights_on`,
        state: 'on',
      },
      { type: 'mode', mode: ['late_night', 'night'] },
    ],
    actions,
  };
}

function nightModeOffRule(def: AreaLightingDef): AutomationRule | null {
  if (!def.nightlightEntity) return null;

  return {
    id: `lighting.${def.slug}.night_motion_off`,
    name: `${def.name} – Night motion lights off`,
    description: `Turn off nightlight in ${def.name.toLowerCase()} after occupancy clears in night mode`,
    enabled: true,
    mode: 'restart',
    triggers: [
      {
        type: 'state_change',
        entity_id: `binary_sensor.${def.areaId}_occupancy`,
        to: 'off',
      },
    ],
    conditions: [
      { type: 'mode', mode: ['late_night', 'night'] },
    ],
    actions: [
      { type: 'delay', delay_ms: 60_000 },
      { type: 'command', entity_id: def.nightlightEntity, command: 'turn_off' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Generate per-area motion rules
// ---------------------------------------------------------------------------

const motionRules: AutomationRule[] = AREA_LIGHTING.flatMap((def) => {
  const rules = [motionOnRule(def), motionOffRule(def)];
  const nightOn = nightModeOnRule(def);
  const nightOff = nightModeOffRule(def);
  if (nightOn) rules.push(nightOn);
  if (nightOff) rules.push(nightOff);
  return rules;
});

// ---------------------------------------------------------------------------
// Scene rules
// ---------------------------------------------------------------------------

const EVENING_BRIGHTNESS: Record<string, number> = {};
const EVENING_ENTITIES: Record<string, string[]> = {};
for (const def of AREA_LIGHTING) {
  if (def.eveningBrightness !== undefined) {
    EVENING_BRIGHTNESS[def.slug] = def.eveningBrightness;
    EVENING_ENTITIES[def.slug] = def.lightEntities;
  }
}

function buildDimActions(
  slugs: string[],
  brightnessMap: Record<string, number>,
  entityMap: Record<string, string[]>,
): ActionConfig[] {
  return slugs.flatMap((slug) => {
    const pct = brightnessMap[slug];
    const entities = entityMap[slug] ?? [];
    return entities.map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_on',
      data: { brightness_pct: pct, transition: 3 },
    }));
  });
}

const indoorSlugs = AREA_LIGHTING
  .filter((d) => !['front_porch', 'backyard', 'patio'].includes(d.slug))
  .map((d) => d.slug);

const outdoorSlugs = ['front_porch', 'backyard', 'patio'];

const eveningScene: AutomationRule = {
  id: 'lighting.scene.evening',
  name: 'Evening lighting scene',
  description: 'Dim indoor lights and activate outdoor lights when entering evening mode',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'evening',
    },
  ],
  conditions: [],
  actions: [
    ...buildDimActions(indoorSlugs, EVENING_BRIGHTNESS, EVENING_ENTITIES),
    ...outdoorSlugs.flatMap((slug) =>
      (EVENING_ENTITIES[slug] ?? []).map<ActionConfig>((entity) => ({
        type: 'command',
        entity_id: entity,
        command: 'turn_on',
        data: { brightness_pct: EVENING_BRIGHTNESS[slug] ?? 80 },
      })),
    ),
  ],
};

const lateEveningScene: AutomationRule = {
  id: 'lighting.scene.late_evening',
  name: 'Late evening lighting scene',
  description: 'Further dim lights when entering late evening mode',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'late_evening',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.living_room_main', command: 'turn_on', data: { brightness_pct: 25, transition: 5 } },
    { type: 'command', entity_id: 'light.living_room_lamps', command: 'turn_on', data: { brightness_pct: 30, transition: 5 } },
    { type: 'command', entity_id: 'light.kitchen_main', command: 'turn_on', data: { brightness_pct: 30, transition: 5 } },
    { type: 'command', entity_id: 'light.kitchen_island', command: 'turn_off' },
    { type: 'command', entity_id: 'light.dining_room_chandelier', command: 'turn_on', data: { brightness_pct: 20, transition: 5 } },
    { type: 'command', entity_id: 'light.office_overhead', command: 'turn_on', data: { brightness_pct: 40, transition: 5 } },
    { type: 'command', entity_id: 'light.game_room_main', command: 'turn_on', data: { brightness_pct: 30, transition: 5 } },
    { type: 'command', entity_id: 'light.main_bedroom_lamps', command: 'turn_on', data: { brightness_pct: 20, transition: 5 } },
    { type: 'command', entity_id: 'light.main_bedroom_overhead', command: 'turn_off' },
    { type: 'command', entity_id: 'light.master_bedroom_nightstands', command: 'turn_on', data: { brightness_pct: 20, transition: 5 } },
    { type: 'command', entity_id: 'light.master_bedroom_overhead', command: 'turn_off' },
  ],
};

const allLightEntities = AREA_LIGHTING.flatMap((d) => d.lightEntities);
const nightlightEntities = AREA_LIGHTING
  .filter((d) => d.nightlightEntity)
  .map((d) => d.nightlightEntity!);
const mainLightsForNightOff = allLightEntities.filter((e) => !nightlightEntities.includes(e));

const nightScene: AutomationRule = {
  id: 'lighting.scene.night',
  name: 'Night lighting scene',
  description: 'Turn off most lights when entering night mode, keep nightlights at minimum brightness',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'late_night',
    },
  ],
  conditions: [],
  actions: [
    ...mainLightsForNightOff.map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_off',
      data: { transition: 5 },
    })),
    ...nightlightEntities.map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_on',
      data: { brightness_pct: 3, transition: 5 },
    })),
  ],
};

const fullNightScene: AutomationRule = {
  id: 'lighting.scene.full_night',
  name: 'Full night – all lights off',
  description: 'Turn off every light including nightlights during deep night',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'night',
    },
  ],
  conditions: [],
  actions: allLightEntities.map<ActionConfig>((entity) => ({
    type: 'command',
    entity_id: entity,
    command: 'turn_off',
  })),
};

const morningScene: AutomationRule = {
  id: 'lighting.scene.morning',
  name: 'Morning lighting scene',
  description: 'Gently bring up lights in key areas when morning mode begins',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'morning',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.kitchen_main', command: 'turn_on', data: { brightness_pct: 70, transition: 10 } },
    { type: 'command', entity_id: 'light.kitchen_under_cabinet', command: 'turn_on', data: { brightness_pct: 80, transition: 10 } },
    { type: 'command', entity_id: 'light.living_room_lamps', command: 'turn_on', data: { brightness_pct: 40, transition: 10 } },
    { type: 'command', entity_id: 'light.entry_pendant', command: 'turn_on', data: { brightness_pct: 50, transition: 10 } },
    { type: 'command', entity_id: 'light.stairs_main', command: 'turn_on', data: { brightness_pct: 50, transition: 10 } },
    { type: 'command', entity_id: 'light.top_of_stairs_main', command: 'turn_on', data: { brightness_pct: 50, transition: 10 } },
    { type: 'command', entity_id: 'light.main_bedroom_lamps', command: 'turn_on', data: { brightness_pct: 25, transition: 15 } },
    { type: 'command', entity_id: 'light.master_bedroom_nightstands', command: 'turn_on', data: { brightness_pct: 25, transition: 15 } },
  ],
};

// ---------------------------------------------------------------------------
// Dark daytime lighting
// ---------------------------------------------------------------------------

const darkDaytimeOn: AutomationRule = {
  id: 'lighting.dark_daytime.on',
  name: 'Dark daytime – activate evening-like lighting',
  description: 'When solar production drops below 1.5kW during day mode, set lights to evening levels',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'threshold',
      entity_id: 'sensor.apf_generation_entity',
      below: 1500,
    },
  ],
  conditions: [
    { type: 'mode', mode: 'day' },
  ],
  actions: buildDimActions(indoorSlugs, EVENING_BRIGHTNESS, EVENING_ENTITIES),
};

const darkDaytimeOff: AutomationRule = {
  id: 'lighting.dark_daytime.off',
  name: 'Dark daytime – restore day lighting',
  description: 'When solar production rises above 1.5kW, turn off motion-triggered lights and let natural light take over',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'threshold',
      entity_id: 'sensor.apf_generation_entity',
      above: 1500,
    },
  ],
  conditions: [
    { type: 'mode', mode: 'day' },
  ],
  actions: indoorSlugs.flatMap((slug) =>
    (EVENING_ENTITIES[slug] ?? []).map<ActionConfig>((entity) => ({
      type: 'command',
      entity_id: entity,
      command: 'turn_off',
      data: { transition: 10 },
    })),
  ),
};

// ---------------------------------------------------------------------------
// Outdoor-specific rules
// ---------------------------------------------------------------------------

const frontPorchSunsetOn: AutomationRule = {
  id: 'lighting.front_porch.sunset_on',
  name: 'Front porch – on at sunset',
  description: 'Automatically turn on front porch lights at sunset regardless of occupancy',
  enabled: true,
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'evening',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.front_porch_main', command: 'turn_on', data: { brightness_pct: 100 } },
    { type: 'command', entity_id: 'light.front_porch_sconces', command: 'turn_on', data: { brightness_pct: 80 } },
  ],
};

const frontPorchLateNightDim: AutomationRule = {
  id: 'lighting.front_porch.late_night_dim',
  name: 'Front porch – dim at late night',
  description: 'Reduce front porch lighting during late night to save energy',
  enabled: true,
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'late_night',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.front_porch_main', command: 'turn_on', data: { brightness_pct: 30 } },
    { type: 'command', entity_id: 'light.front_porch_sconces', command: 'turn_off' },
  ],
};

const backyardSunsetOn: AutomationRule = {
  id: 'lighting.backyard.sunset_on',
  name: 'Backyard – string lights on at evening',
  description: 'Turn on backyard string lights when entering evening mode',
  enabled: true,
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'evening',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.backyard_string_lights', command: 'turn_on' },
  ],
};

const backyardLateNightOff: AutomationRule = {
  id: 'lighting.backyard.late_night_off',
  name: 'Backyard – off at late night',
  description: 'Turn off all backyard lights when entering late night mode',
  enabled: true,
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'late_night',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.backyard_flood', command: 'turn_off' },
    { type: 'command', entity_id: 'light.backyard_string_lights', command: 'turn_off' },
  ],
};

const patioSunsetOn: AutomationRule = {
  id: 'lighting.patio.sunset_on',
  name: 'Patio – string lights on at evening',
  description: 'Activate patio lighting when evening mode begins',
  enabled: true,
  triggers: [
    {
      type: 'state_change',
      entity_id: 'sensor.system_mode',
      to: 'evening',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.patio_string_lights', command: 'turn_on' },
    { type: 'command', entity_id: 'light.patio_overhead', command: 'turn_on', data: { brightness_pct: 60 } },
  ],
};

// ---------------------------------------------------------------------------
// Movie Room special behaviors
// ---------------------------------------------------------------------------

const movieRoomPlaybackDim: AutomationRule = {
  id: 'lighting.movie_room.playback_dim',
  name: 'Movie Room – dim on media playback',
  description: 'Dim movie room lights when media player starts playing',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'media_player.movie_room',
      to: 'playing',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.movie_room_main', command: 'turn_off', data: { transition: 3 } },
    { type: 'command', entity_id: 'light.movie_room_sconces', command: 'turn_on', data: { brightness_pct: 5, transition: 3 } },
  ],
};

const movieRoomPlaybackResume: AutomationRule = {
  id: 'lighting.movie_room.playback_resume',
  name: 'Movie Room – restore on media stop',
  description: 'Restore movie room lights when media player stops or pauses',
  enabled: true,
  mode: 'restart',
  triggers: [
    { type: 'state_change', entity_id: 'media_player.movie_room', to: 'paused' },
    { type: 'state_change', entity_id: 'media_player.movie_room', to: 'idle' },
  ],
  conditions: [
    {
      type: 'state',
      entity_id: `binary_sensor.efb3aec330e6471fa134e90fb3801cb8_occupancy`,
      state: 'on',
    },
  ],
  actions: [
    { type: 'command', entity_id: 'light.movie_room_sconces', command: 'turn_on', data: { brightness_pct: 40, transition: 2 } },
  ],
};

// ---------------------------------------------------------------------------
// Garage door-activated lighting
// ---------------------------------------------------------------------------

const garageDoorLight: AutomationRule = {
  id: 'lighting.garage.door_open',
  name: 'Garage – lights on when door opens',
  description: 'Turn on garage lights when garage door opens, regardless of occupancy',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'cover.garage_door',
      to: 'open',
    },
  ],
  conditions: [],
  actions: [
    { type: 'command', entity_id: 'light.garage_main', command: 'turn_on', data: { brightness_pct: 100 } },
  ],
};

const garageDoorLightOff: AutomationRule = {
  id: 'lighting.garage.door_close_off',
  name: 'Garage – lights off after door closes',
  description: 'Turn off garage lights 2 minutes after garage door closes if unoccupied',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: 'cover.garage_door',
      to: 'closed',
    },
  ],
  conditions: [
    {
      type: 'state',
      entity_id: `binary_sensor.garage_occupancy`,
      state: 'off',
    },
  ],
  actions: [
    { type: 'delay', delay_ms: 120_000 },
    { type: 'command', entity_id: 'light.garage_main', command: 'turn_off' },
  ],
};

// ---------------------------------------------------------------------------
// Adaptive brightness during day (choose based on illuminance)
// ---------------------------------------------------------------------------

const kitchenAdaptiveBrightness: AutomationRule = {
  id: 'lighting.kitchen.adaptive_brightness',
  name: 'Kitchen – adaptive brightness on motion',
  description: 'Adjust kitchen brightness based on ambient illuminance when motion triggers lights during day mode',
  enabled: true,
  mode: 'restart',
  triggers: [
    {
      type: 'state_change',
      entity_id: `binary_sensor.e5459ce674a2413db021c981cba209da_occupancy`,
      to: 'on',
    },
  ],
  conditions: [
    {
      type: 'state',
      entity_id: `input_boolean.e5459ce674a2413db021c981cba209da_motion_lights_on`,
      state: 'on',
    },
    { type: 'mode', mode: 'day' },
  ],
  actions: [
    {
      type: 'choose',
      choices: [
        {
          conditions: [
            { type: 'template', fn: (ctx) => {
              const lux = ctx.getState('sensor.kitchen_illuminance');
              return lux !== undefined && parseFloat(lux.state) < 50;
            }},
          ],
          actions: [
            { type: 'command', entity_id: 'light.kitchen_main', command: 'turn_on', data: { brightness_pct: 100 } },
            { type: 'command', entity_id: 'light.kitchen_island', command: 'turn_on', data: { brightness_pct: 80 } },
          ],
        },
        {
          conditions: [
            { type: 'template', fn: (ctx) => {
              const lux = ctx.getState('sensor.kitchen_illuminance');
              return lux !== undefined && parseFloat(lux.state) < 150;
            }},
          ],
          actions: [
            { type: 'command', entity_id: 'light.kitchen_main', command: 'turn_on', data: { brightness_pct: 60 } },
            { type: 'command', entity_id: 'light.kitchen_island', command: 'turn_on', data: { brightness_pct: 40 } },
          ],
        },
      ],
      default_actions: [
        { type: 'command', entity_id: 'light.kitchen_under_cabinet', command: 'turn_on', data: { brightness_pct: 50 } },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Bedroom kids' bedtime
// ---------------------------------------------------------------------------

const kidsBedtime: AutomationRule = {
  id: 'lighting.kids.bedtime',
  name: 'Kids bedrooms – bedtime dimming',
  description: "Dim kids' bedroom lights to nightlight level at 8:30 PM",
  enabled: true,
  triggers: [
    { type: 'time', cron: '30 20 * * *' },
  ],
  conditions: [
    { type: 'mode', mode: ['evening', 'late_evening'] },
  ],
  actions: [
    { type: 'command', entity_id: 'light.game_room_main', command: 'turn_on', data: { brightness_pct: 15, transition: 10 } },
    { type: 'command', entity_id: 'light.game_room_accent', command: 'turn_off', data: { transition: 10 } },
    { type: 'command', entity_id: 'light.top_of_stairs_main', command: 'turn_on', data: { brightness_pct: 10, transition: 10 } },
  ],
};

// ---------------------------------------------------------------------------
// Consolidated export
// ---------------------------------------------------------------------------

const sceneRules: AutomationRule[] = [
  eveningScene,
  lateEveningScene,
  nightScene,
  fullNightScene,
  morningScene,
  darkDaytimeOn,
  darkDaytimeOff,
  frontPorchSunsetOn,
  frontPorchLateNightDim,
  backyardSunsetOn,
  backyardLateNightOff,
  patioSunsetOn,
  movieRoomPlaybackDim,
  movieRoomPlaybackResume,
  garageDoorLight,
  garageDoorLightOff,
  kitchenAdaptiveBrightness,
  kidsBedtime,
];

export const lightingRules: AutomationRule[] = [...motionRules, ...sceneRules];
