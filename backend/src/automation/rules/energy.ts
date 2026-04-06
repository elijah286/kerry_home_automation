import type { AutomationRule } from '../engine.js';

export const energyRules: AutomationRule[] = [
  // -------------------------------------------------------------------------
  // Solar production mode adjustments
  // -------------------------------------------------------------------------
  {
    id: 'energy.solar_bright_mode',
    name: 'Solar high production – bright mode adjustments',
    description: 'When solar production exceeds 4 kW, enable bright-day lighting profiles',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.apf_generation_entity', above: 4000, attribute: 'power_w' },
    ],
    conditions: [
      { type: 'mode', mode: ['day'] },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_select.lighting_profile', state: 'bright_day' },
    ],
  },

  {
    id: 'energy.solar_dim_mode',
    name: 'Solar low production – dim mode adjustments',
    description: 'When solar drops below 500 W during the day, switch to overcast lighting',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.apf_generation_entity', below: 500, attribute: 'power_w' },
    ],
    conditions: [
      { type: 'mode', mode: ['day'] },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_select.lighting_profile', state: 'overcast' },
    ],
  },

  {
    id: 'energy.solar_excess_water_heater',
    name: 'Solar excess – divert to water heater',
    description: 'When solar export exceeds 2 kW, enable electric water heater boost',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.grid_export_power', above: 2000 },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.water_heater_boost', state: 'off' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.water_heater_boost', command: 'turn_on' },
    ],
  },

  {
    id: 'energy.solar_export_drop_water_heater_off',
    name: 'Solar export dropped – water heater boost off',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.grid_export_power', below: 500 },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.water_heater_boost', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.water_heater_boost', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Powerwall / battery management
  // -------------------------------------------------------------------------
  {
    id: 'energy.powerwall_low_power_save',
    name: 'Powerwall low battery – enable power save',
    description: 'When Powerwall drops below 20%, activate power saving mode',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.powerwall_battery_level', below: 20 },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.power_save_mode', state: 'on' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Energy', message: 'Powerwall below 20% – power save enabled' } },
    ],
  },

  {
    id: 'energy.powerwall_recovered',
    name: 'Powerwall recovered – disable power save',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.powerwall_battery_level', above: 50 },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.power_save_mode', state: 'on' },
    ],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.power_save_mode', state: 'off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Energy', message: 'Powerwall above 50% – power save disabled' } },
    ],
  },

  {
    id: 'energy.powerwall_critical',
    name: 'Powerwall critical – shed non-essential loads',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.powerwall_battery_level', below: 10 },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.water_heater_boost', command: 'turn_off' },
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_hvac_mode', data: { hvac_mode: 'off' } },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Energy CRITICAL', message: 'Powerwall below 10% – shedding loads' } },
    ],
  },

  // -------------------------------------------------------------------------
  // EV smart charging
  // -------------------------------------------------------------------------
  {
    id: 'energy.ev_solar_charge_start',
    name: 'EV charge start – solar surplus',
    description: 'Start Tesla charging when solar export exceeds 3 kW and car is plugged in',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.grid_export_power', above: 3000 },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.tesla_charger_connected', state: 'on' },
      { type: 'state', entity_id: 'switch.tesla_charging', state: 'off' },
      {
        type: 'template',
        fn: (ctx) => {
          const soc = ctx.getState('sensor.tesla_battery_level');
          return soc !== undefined && parseFloat(soc.state) < 90;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.tesla_charging', command: 'turn_on' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'EV', message: 'Solar surplus – Tesla charging started' } },
    ],
    mode: 'single',
  },

  {
    id: 'energy.ev_solar_charge_stop',
    name: 'EV charge stop – solar surplus gone',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.grid_export_power', below: 500 },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.tesla_charging', state: 'on' },
      { type: 'state', entity_id: 'input_boolean.ev_solar_only_mode', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.tesla_charging', command: 'turn_off' },
    ],
  },

  {
    id: 'energy.ev_overnight_charge',
    name: 'EV overnight charge at off-peak rate',
    description: 'Start overnight charging at midnight if battery below 50%',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 0 * * *' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.tesla_charger_connected', state: 'on' },
      {
        type: 'template',
        fn: (ctx) => {
          const soc = ctx.getState('sensor.tesla_battery_level');
          return soc !== undefined && parseFloat(soc.state) < 50;
        },
      },
    ],
    actions: [
      { type: 'command', entity_id: 'number.tesla_charge_limit', command: 'set_value', data: { value: 80 } },
      { type: 'command', entity_id: 'switch.tesla_charging', command: 'turn_on' },
    ],
  },

  {
    id: 'energy.ev_stop_overnight_charge',
    name: 'EV stop overnight charge before peak',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 6 * * *' },
    ],
    conditions: [
      { type: 'state', entity_id: 'switch.tesla_charging', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.tesla_charging', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Tesla presence
  // -------------------------------------------------------------------------
  {
    id: 'energy.tesla_lock_away',
    name: 'Lock Tesla when nobody home',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.anyone_home', from: 'on', to: 'off' },
    ],
    conditions: [
      { type: 'state', entity_id: 'lock.tesla', state: 'unlocked' },
    ],
    actions: [
      { type: 'command', entity_id: 'lock.tesla', command: 'lock' },
    ],
  },

  {
    id: 'energy.tesla_climate_prep',
    name: 'Pre-condition Tesla before departure',
    description: 'Start Tesla climate 15 min before scheduled departure',
    enabled: true,
    triggers: [
      { type: 'event', event_type: 'tesla_departure_soon' },
    ],
    conditions: [
      { type: 'state', entity_id: 'binary_sensor.tesla_home', state: 'on' },
    ],
    actions: [
      { type: 'command', entity_id: 'climate.tesla', command: 'turn_on' },
    ],
  },

  // -------------------------------------------------------------------------
  // Power save mode actions
  // -------------------------------------------------------------------------
  {
    id: 'energy.power_save_reduce_hvac',
    name: 'Power save – reduce HVAC',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.power_save_mode', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 78 } },
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_fan_mode', data: { fan_mode: 'auto' } },
    ],
  },

  {
    id: 'energy.power_save_dim_lights',
    name: 'Power save – dim all lights 50%',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.power_save_mode', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'light.all_interior', command: 'dim', data: { brightness_pct: 50 } },
    ],
  },

  {
    id: 'energy.power_save_disable_loads',
    name: 'Power save – disable non-essential loads',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.power_save_mode', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.water_heater_boost', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.ev_charger', command: 'turn_off' },
    ],
  },

  {
    id: 'energy.power_save_restore',
    name: 'Power save off – restore normal operation',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'input_boolean.power_save_mode', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'climate.whole_house', command: 'set_temperature', data: { temperature: 72 } },
      { type: 'command', entity_id: 'light.all_interior', command: 'restore_scene' },
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
    ],
  },

  // -------------------------------------------------------------------------
  // Peak rate avoidance
  // -------------------------------------------------------------------------
  {
    id: 'energy.peak_rate_start',
    name: 'Peak rate period – shift loads',
    description: 'At 4 PM weekdays, shift deferrable loads off-grid',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 16 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_off' },
      { type: 'command', entity_id: 'switch.water_heater_boost', command: 'turn_off' },
      { type: 'set_state', entity_id: 'input_boolean.peak_rate_active', state: 'on' },
      { type: 'command', entity_id: 'select.powerwall_mode', command: 'select_option', data: { option: 'self_consumption' } },
    ],
  },

  {
    id: 'energy.peak_rate_end',
    name: 'Peak rate period ended – resume loads',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 21 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.peak_rate_active', state: 'off' },
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
      { type: 'command', entity_id: 'select.powerwall_mode', command: 'select_option', data: { option: 'backup' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Monitoring & reporting
  // -------------------------------------------------------------------------
  {
    id: 'energy.daily_report',
    name: 'Daily energy report',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 20 * * *' },
    ],
    conditions: [],
    actions: [
      {
        type: 'call',
        fn: async (ctx) => {
          const solar = ctx.getState('sensor.solar_energy_today');
          const consumed = ctx.getState('sensor.home_energy_today');
          const grid = ctx.getState('sensor.grid_import_today');
          const msg = [
            `Solar: ${solar?.state ?? '?'} kWh`,
            `Consumed: ${consumed?.state ?? '?'} kWh`,
            `Grid import: ${grid?.state ?? '?'} kWh`,
          ].join('\n');
          ctx.sendCommand('notify.mobile_family', 'send', { title: 'Daily Energy', message: msg });
        },
      },
    ],
  },

  {
    id: 'energy.high_consumption_alert',
    name: 'High consumption alert',
    description: 'Alert when instantaneous consumption exceeds 10 kW',
    enabled: true,
    triggers: [
      { type: 'threshold', entity_id: 'sensor.home_power', above: 10000 },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'Energy', message: 'Home power consumption exceeding 10 kW!' } },
    ],
    mode: 'single',
  },

  // -------------------------------------------------------------------------
  // Grid / outage handling
  // -------------------------------------------------------------------------
  {
    id: 'energy.grid_outage_detected',
    name: 'Grid outage detected – switch to backup',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.grid_status', to: 'off' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.power_save_mode', state: 'on' },
      { type: 'command', entity_id: 'select.powerwall_mode', command: 'select_option', data: { option: 'backup' } },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'POWER', message: 'Grid outage detected – running on battery' } },
    ],
  },

  {
    id: 'energy.grid_restored',
    name: 'Grid restored – resume normal',
    enabled: true,
    triggers: [
      { type: 'state_change', entity_id: 'binary_sensor.grid_status', to: 'on' },
    ],
    conditions: [],
    actions: [
      { type: 'set_state', entity_id: 'input_boolean.power_save_mode', state: 'off' },
      { type: 'command', entity_id: 'notify.mobile_family', command: 'send', data: { title: 'POWER', message: 'Grid power restored' } },
    ],
  },

  // -------------------------------------------------------------------------
  // Pool pump scheduling
  // -------------------------------------------------------------------------
  {
    id: 'energy.pool_pump_solar_start',
    name: 'Pool pump on during solar hours',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 10 * * *' },
    ],
    conditions: [
      { type: 'state', entity_id: 'input_boolean.power_save_mode', state: 'off' },
      { type: 'state', entity_id: 'input_boolean.peak_rate_active', state: 'off' },
    ],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_on' },
    ],
  },

  {
    id: 'energy.pool_pump_evening_off',
    name: 'Pool pump off in the evening',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 16 * * *' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'switch.pool_pump', command: 'turn_off' },
    ],
  },

  // -------------------------------------------------------------------------
  // Powerwall reserve scheduling
  // -------------------------------------------------------------------------
  {
    id: 'energy.powerwall_reserve_peak',
    name: 'Set Powerwall reserve before peak',
    description: 'Increase reserve to 30% before peak pricing',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 14 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'number.powerwall_reserve', command: 'set_value', data: { value: 30 } },
    ],
  },

  {
    id: 'energy.powerwall_reserve_offpeak',
    name: 'Reset Powerwall reserve off-peak',
    enabled: true,
    triggers: [
      { type: 'time', cron: '0 21 * * 1-5' },
    ],
    conditions: [],
    actions: [
      { type: 'command', entity_id: 'number.powerwall_reserve', command: 'set_value', data: { value: 10 } },
    ],
  },
];
