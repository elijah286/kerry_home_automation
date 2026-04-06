import type { AutomationRule } from '../engine.js';

export const blindsRules: AutomationRule[] = [
  // ── Open Blinds at Sunrise ─────────────────────────────────────────────
  {
    id: 'blinds-open-sunrise',
    name: 'Open blinds at sunrise',
    description: 'Gradually open all blinds when the sun rises (except bedrooms)',
    enabled: true,
    triggers: [{ type: 'sun', entity_id: 'sunrise' }],
    conditions: [
      { type: 'mode', mode: ['home', 'guest'] },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.kitchen_blinds', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.office_blinds', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.dining_room_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Close Blinds at Sunset ─────────────────────────────────────────────
  {
    id: 'blinds-close-sunset',
    name: 'Close blinds at sunset',
    description: 'Close all blinds for privacy once the sun sets',
    enabled: true,
    triggers: [{ type: 'sun', entity_id: 'sunset' }],
    conditions: [
      { type: 'mode', mode: ['home', 'guest'] },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.kitchen_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.office_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.dining_room_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.guest_bedroom_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── South-Facing Solar Heat Gain Block ─────────────────────────────────
  {
    id: 'blinds-solar-heat-gain',
    name: 'Close south-facing blinds on high solar gain',
    description: 'Reduce AC load by closing south-facing blinds when solar radiation is high',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.solar_radiation', above: 600, attribute: 'irradiance_w_m2' },
    ],
    conditions: [
      { type: 'time_window', after: '10:00', before: '17:00' },
      { type: 'state', entity_id: 'climate.main_hvac', state: 'cool' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_south_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.dining_room_south_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── Re-open South Blinds When Radiation Drops ──────────────────────────
  {
    id: 'blinds-solar-heat-gain-clear',
    name: 'Re-open south blinds when solar gain drops',
    description: 'Open south blinds once solar radiation eases',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.solar_radiation', below: 300, attribute: 'irradiance_w_m2' },
    ],
    conditions: [
      { type: 'time_window', after: '10:00', before: '18:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_south_blinds', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.dining_room_south_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Movie Mode – Close Blinds ──────────────────────────────────────────
  {
    id: 'blinds-movie-mode-close',
    name: 'Close blinds for movie mode',
    description: 'Darken the living room when movie mode activates',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', to: 'movie' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.living_room_south_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── Movie Mode End – Open Blinds ───────────────────────────────────────
  {
    id: 'blinds-movie-mode-open',
    name: 'Open blinds when movie mode ends',
    description: 'Restore blind positions when leaving movie mode during daytime',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', from: 'movie' },
    ],
    conditions: [
      { type: 'time_window', after: '07:00', before: '19:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.living_room_south_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Master Bedroom – Close at Bedtime ──────────────────────────────────
  {
    id: 'blinds-bedroom-bedtime',
    name: 'Close bedroom blinds at bedtime',
    description: 'Close master bedroom blinds at 10:30 PM for sleep',
    enabled: true,
    triggers: [{ type: 'time', cron: '30 22 * * *' }],
    conditions: [{ type: 'mode', mode: ['home', 'guest'] }],
    actions: [
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── Master Bedroom – Open at Wake-up ───────────────────────────────────
  {
    id: 'blinds-bedroom-wakeup',
    name: 'Open bedroom blinds at wake-up',
    description: 'Gently open master bedroom blinds at 7 AM on weekdays',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 7 * * 1-5' }],
    conditions: [{ type: 'mode', mode: 'home' }],
    actions: [
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'set_cover_position', data: { position: 50 } },
      { type: 'delay', delay_ms: 600_000 },
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'open_cover' },
    ],
    mode: 'restart',
  },

  // ── Master Bedroom – Weekend Late Open ─────────────────────────────────
  {
    id: 'blinds-bedroom-weekend-open',
    name: 'Open bedroom blinds later on weekends',
    description: 'Let occupants sleep in — open blinds at 9 AM on weekends',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 9 * * 0,6' }],
    conditions: [{ type: 'mode', mode: 'home' }],
    actions: [
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Wind Protection ────────────────────────────────────────────────────
  {
    id: 'blinds-wind-protection',
    name: 'Wind protection – close exterior blinds',
    description: 'Retract exterior blinds and awnings when wind exceeds 25 mph',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.wind_speed', above: 25 },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'cover.patio_awning', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.balcony_exterior_blinds', command: 'close_cover' },
      {
        type: 'command',
        entity_id: 'notify.mobile_app',
        command: 'send',
        data: { title: 'Wind Alert', message: 'High wind detected — exterior blinds and awning retracted.' },
      },
    ],
    mode: 'single',
  },

  // ── Wind All-Clear ─────────────────────────────────────────────────────
  {
    id: 'blinds-wind-all-clear',
    name: 'Wind all-clear – restore exterior blinds',
    description: 'Re-open exterior blinds once wind drops below 15 mph',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.wind_speed', below: 15 },
    ],
    conditions: [
      { type: 'time_window', after: '08:00', before: '19:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.patio_awning', command: 'open_cover' },
      { type: 'command', entity_id: 'cover.balcony_exterior_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Guest Bedroom Blinds ───────────────────────────────────────────────
  {
    id: 'blinds-guest-bedroom-close',
    name: 'Close guest bedroom blinds at night',
    description: 'Close guest bedroom blinds at 10 PM during guest mode',
    enabled: true,
    triggers: [{ type: 'time', cron: '0 22 * * *' }],
    conditions: [{ type: 'mode', mode: 'guest' }],
    actions: [
      { type: 'command', entity_id: 'cover.guest_bedroom_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── Guest Bedroom Blinds – Morning ─────────────────────────────────────
  {
    id: 'blinds-guest-bedroom-open',
    name: 'Open guest bedroom blinds in the morning',
    description: 'Open guest bedroom blinds at 8:30 AM during guest mode',
    enabled: true,
    triggers: [{ type: 'time', cron: '30 8 * * *' }],
    conditions: [{ type: 'mode', mode: 'guest' }],
    actions: [
      { type: 'command', entity_id: 'cover.guest_bedroom_blinds', command: 'open_cover' },
    ],
    mode: 'single',
  },

  // ── Away Mode – Close All ──────────────────────────────────────────────
  {
    id: 'blinds-away-close-all',
    name: 'Close all blinds when leaving',
    description: 'Close every blind for security and energy savings when away',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_select.house_mode', to: 'away' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.living_room_south_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.kitchen_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.office_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.dining_room_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.master_bedroom_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.guest_bedroom_blinds', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.patio_awning', command: 'close_cover' },
      { type: 'command', entity_id: 'cover.balcony_exterior_blinds', command: 'close_cover' },
    ],
    mode: 'single',
  },

  // ── Office Glare Control ───────────────────────────────────────────────
  {
    id: 'blinds-office-glare',
    name: 'Office anti-glare half-close',
    description: 'Half-close office blinds during work hours when sun angle causes glare',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.office_light_level', above: 15000 },
    ],
    conditions: [
      { type: 'time_window', after: '09:00', before: '17:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'cover.office_blinds', command: 'set_cover_position', data: { position: 40 } },
    ],
    mode: 'single',
  },
];
