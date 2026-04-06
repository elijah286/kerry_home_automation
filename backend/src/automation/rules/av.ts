import type { AutomationRule } from '../engine.js';

export const avRules: AutomationRule[] = [
  // -------------------------------------------------------------------------
  // Movie mode
  // -------------------------------------------------------------------------
  {
    id: 'av.movie_mode_activate',
    name: 'Movie mode – dim lights, receiver surround, TV on',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'movie_mode',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'light.living_room', command: 'turn_on', data: { brightness_pct: 5, color_temp_kelvin: 2200 } },
      { type: 'command', entity_id: 'light.kitchen', command: 'turn_off' },
      { type: 'command', entity_id: 'light.dining_room', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 3000 },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_source', data: { source: 'HDMI1' } },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_sound_mode', data: { sound_mode: 'Dolby Atmos' } },
      { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'close' },
    ],
  },

  {
    id: 'av.movie_mode_deactivate',
    name: 'Movie mode off – restore lights',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'movie_mode_off',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'light.living_room', command: 'restore_scene' },
      { type: 'command', entity_id: 'light.kitchen', command: 'restore_scene' },
      { type: 'command', entity_id: 'cover.living_room_blinds', command: 'open' },
    ],
  },

  // -------------------------------------------------------------------------
  // Game mode
  // -------------------------------------------------------------------------
  {
    id: 'av.game_mode_xbox',
    name: 'Game mode – Xbox lights & receiver',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'playing' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.game_room', command: 'turn_on', data: { brightness_pct: 30, rgb_color: [0, 100, 200] } },
      { type: 'command', entity_id: 'light.game_room_bias', command: 'turn_on', data: { brightness_pct: 40, rgb_color: [0, 150, 255] } },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 2000 },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_source', data: { source: 'GAME' } },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_sound_mode', data: { sound_mode: 'Game' } },
    ],
  },

  {
    id: 'av.game_mode_nintendo',
    name: 'Game mode – Nintendo lights & receiver',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'playing' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.game_room', command: 'turn_on', data: { brightness_pct: 30, rgb_color: [230, 0, 20] } },
      { type: 'command', entity_id: 'light.game_room_bias', command: 'turn_on', data: { brightness_pct: 40, rgb_color: [230, 50, 50] } },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 2000 },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_source', data: { source: 'GAME2' } },
    ],
  },

  {
    id: 'av.game_mode_off',
    name: 'Game mode off – restore game room lights',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.xbox', to: 'off' },
      { type: 'state_change', entity_id: 'media_player.nintendo_switch', to: 'off' },
    ],
    conditions: [
      { type: 'state', entity_id: 'media_player.xbox', state: 'off' },
      { type: 'state', entity_id: 'media_player.nintendo_switch', state: ['off', 'unavailable'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.game_room', command: 'restore_scene' },
      { type: 'command', entity_id: 'light.game_room_bias', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Music mode
  // -------------------------------------------------------------------------
  {
    id: 'av.music_mode_activate',
    name: 'Music mode – receiver on, stereo input',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'music_mode',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 3000 },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_source', data: { source: 'Bluetooth' } },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_sound_mode', data: { sound_mode: 'Stereo' } },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'volume_set', data: { volume_level: 0.3 } },
    ],
  },

  {
    id: 'av.music_mode_multiroom',
    name: 'Music mode – multi-room audio',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'music_multiroom',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.kitchen_speaker', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.living_room_speaker', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.master_bedroom_speaker', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.patio_speaker', command: 'turn_on' },
      {
        type: 'call',
        fn: async (ctx) => {
          const speakers = [
            'media_player.kitchen_speaker',
            'media_player.living_room_speaker',
            'media_player.master_bedroom_speaker',
            'media_player.patio_speaker',
          ];
          for (const s of speakers) {
            ctx.sendCommand(s, 'volume_set', { volume_level: 0.25 });
          }
          ctx.sendCommand('media_player.kitchen_speaker', 'join', {
            group_members: speakers.slice(1),
          });
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // TV auto-off after idle
  // -------------------------------------------------------------------------
  {
    id: 'av.living_room_tv_idle_off',
    name: 'Living room TV auto-off after 3 hr idle',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.living_room_tv', to: 'idle' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 10_800_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.living_room_tv', state: 'idle' }],
            actions: [
              { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_off' },
              { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'av.game_room_tv_idle_off',
    name: 'Game room TV auto-off after 2 hr idle',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.game_room_tv', to: 'idle' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 7_200_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.game_room_tv', state: 'idle' }],
            actions: [
              { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
              { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'av.master_tv_idle_off',
    name: 'Master bedroom TV auto-off after 2 hr idle',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.master_bedroom_tv', to: 'idle' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 7_200_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.master_bedroom_tv', state: 'idle' }],
            actions: [
              { type: 'command', entity_id: 'media_player.master_bedroom_tv', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Receiver volume limit at night
  // -------------------------------------------------------------------------
  {
    id: 'av.receiver_volume_limit_night',
    name: 'Receiver volume limit at night',
    description: 'Cap living room receiver volume after 9 PM',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'media_player.avr_receiver', above: 0.5, attribute: 'volume_level' },
    ],
    conditions: [
      { type: 'time_window', after: '21:00', before: '08:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'volume_set', data: { volume_level: 0.5 } },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'A/V', message: 'Receiver volume capped – night mode' } },
    ],
    mode: 'single',
  },

  {
    id: 'av.game_room_volume_limit_night',
    name: 'Game room receiver volume limit at night',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'media_player.game_room_receiver', above: 0.4, attribute: 'volume_level' },
    ],
    conditions: [
      { type: 'time_window', after: '20:00', before: '08:00' },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'volume_set', data: { volume_level: 0.4 } },
    ],
    mode: 'single',
  },

  // -------------------------------------------------------------------------
  // "Engage Engines" – all screens on, surround
  // -------------------------------------------------------------------------
  {
    id: 'av.engage_engines',
    name: 'Engage Engines – all screens on, surround sound',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'engage_engines',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.master_bedroom_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 5000 },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_sound_mode', data: { sound_mode: 'Dolby Atmos' } },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'volume_set', data: { volume_level: 0.4 } },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_sound_mode', data: { sound_mode: 'Surround' } },
      { type: 'command', entity_id: 'light.living_room', command: 'turn_on', data: { brightness_pct: 10, rgb_color: [0, 0, 255] } },
      { type: 'command', entity_id: 'light.game_room', command: 'turn_on', data: { brightness_pct: 10, rgb_color: [0, 0, 255] } },
    ],
  },

  {
    id: 'av.disengage_engines',
    name: 'Disengage Engines – all screens off, restore',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'disengage_engines',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.master_bedroom_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_off' },
      { type: 'command', entity_id: 'light.living_room', command: 'restore_scene' },
      { type: 'command', entity_id: 'light.game_room', command: 'restore_scene' },
    ],
  },

  // -------------------------------------------------------------------------
  // Xbox / Nintendo button macros (via Harmony/IR)
  // -------------------------------------------------------------------------
  {
    id: 'av.xbox_quick_launch',
    name: 'Xbox quick launch macro',
    description: 'Power on TV, receiver, set inputs, start Xbox',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'button_press' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.button === 'xbox_quick_launch',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 5000 },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_source', data: { source: 'GAME' } },
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_on' },
    ],
  },

  {
    id: 'av.nintendo_quick_launch',
    name: 'Nintendo quick launch macro',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'button_press' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.button === 'nintendo_quick_launch',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 5000 },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'select_source', data: { source: 'GAME2' } },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_on' },
    ],
  },

  // -------------------------------------------------------------------------
  // Receiver auto-off when no source active
  // -------------------------------------------------------------------------
  {
    id: 'av.receiver_auto_off_no_source',
    name: 'Living room receiver auto-off when idle',
    description: 'Turn off receiver if no audio for 30 min',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.avr_receiver', to: 'idle' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 1_800_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.avr_receiver', state: 'idle' }],
            actions: [
              { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  {
    id: 'av.game_room_receiver_auto_off',
    name: 'Game room receiver auto-off when idle',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.game_room_receiver', to: 'idle' },
    ],
    conditions: [],
    actions: [
      { type: 'delay', delay_ms: 1_800_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.game_room_receiver', state: 'idle' }],
            actions: [
              { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Patio streaming
  // -------------------------------------------------------------------------
  {
    id: 'av.patio_party_mode',
    name: 'Patio party mode – outdoor speakers & lights',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'patio_party',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.patio_speaker', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.patio_speaker', command: 'volume_set', data: { volume_level: 0.45 } },
      { type: 'command', entity_id: 'light.patio_string_lights', command: 'turn_on' },
      { type: 'command', entity_id: 'light.backyard_flood', command: 'turn_on', data: { brightness_pct: 30 } },
    ],
  },

  // -------------------------------------------------------------------------
  // TV on → lights adjust
  // -------------------------------------------------------------------------
  {
    id: 'av.living_room_tv_on_lights',
    name: 'Living room TV on – dim lights',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.living_room_tv', to: 'playing' },
    ],
    conditions: [
      { type: 'mode', mode: ['evening', 'late_evening'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.living_room', command: 'turn_on', data: { brightness_pct: 15, color_temp_kelvin: 2200 } },
      { type: 'command', entity_id: 'light.tv_bias_light', command: 'turn_on', data: { brightness_pct: 30 } },
    ],
  },

  {
    id: 'av.living_room_tv_off_lights',
    name: 'Living room TV off – restore lights',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.living_room_tv', to: 'off' },
    ],
    conditions: [
      { type: 'mode', mode: ['evening', 'late_evening'] },
    ],
    actions: [
      { type: 'command', entity_id: 'light.living_room', command: 'restore_scene' },
      { type: 'command', entity_id: 'light.tv_bias_light', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Away mode – all AV off
  // -------------------------------------------------------------------------
  {
    id: 'av.all_off_away',
    name: 'All A/V off when nobody home',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'on', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.game_room_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.master_bedroom_tv', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.game_room_receiver', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.xbox', command: 'turn_off' },
      { type: 'command', entity_id: 'media_player.nintendo_switch', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Master bedroom TV – sleep timer
  // -------------------------------------------------------------------------
  {
    id: 'av.master_tv_sleep_timer',
    name: 'Master bedroom TV sleep timer',
    description: 'Auto-off after 90 min when turned on in late evening/night',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'media_player.master_bedroom_tv', to: 'on' },
    ],
    conditions: [
      { type: 'mode', mode: ['late_evening', 'late_night', 'night'] },
    ],
    actions: [
      { type: 'delay', delay_ms: 5_400_000 },
      {
        type: 'choose',
        choices: [
          {
            conditions: [{ type: 'state', entity_id: 'media_player.master_bedroom_tv', state: ['on', 'playing', 'idle'] }],
            actions: [
              { type: 'command', entity_id: 'media_player.master_bedroom_tv', command: 'turn_off' },
            ],
          },
        ],
        default_actions: [],
      },
    ],
    mode: 'restart',
  },

  // -------------------------------------------------------------------------
  // Streaming night
  // -------------------------------------------------------------------------
  {
    id: 'av.streaming_night',
    name: 'Streaming night – Apple TV + Atmos',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'scene_activate' },
    ],
    conditions: [
      {
        type: 'template',
        fn: (ctx) => ctx.trigger.event?.data?.scene === 'streaming_night',
      },
    ],
    actions: [
      { type: 'command', entity_id: 'media_player.living_room_tv', command: 'turn_on' },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'turn_on' },
      { type: 'delay', delay_ms: 3000 },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_source', data: { source: 'HDMI2' } },
      { type: 'command', entity_id: 'media_player.avr_receiver', command: 'select_sound_mode', data: { sound_mode: 'Dolby Atmos' } },
      { type: 'command', entity_id: 'light.living_room', command: 'turn_on', data: { brightness_pct: 5, color_temp_kelvin: 2200 } },
      { type: 'command', entity_id: 'light.tv_bias_light', command: 'turn_on', data: { brightness_pct: 25 } },
    ],
  },
];
