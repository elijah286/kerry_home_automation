// ---------------------------------------------------------------------------
// "New card" factory — given a CardType, produce a minimally valid
// CardDescriptor that round-trips through the Zod schema.
//
// The editor uses this when a user picks a type from the palette. Every
// result is guaranteed to parse against `cardDescriptorSchema` — downstream
// consumers (CardRenderer, YAML save) can trust it without extra validation.
// ---------------------------------------------------------------------------

import {
  cardDescriptorSchema,
  type CardDescriptor,
  type CardType,
} from '@ha/shared';

/** Human-friendly descriptions used by the card palette UI. */
export const CARD_TYPE_LABELS: Record<CardType, { label: string; description: string }> = {
  heading: { label: 'Heading', description: 'Section title / subtitle text.' },
  markdown: { label: 'Markdown', description: 'Freeform rich text block.' },
  button: { label: 'Button', description: 'Tappable action button.' },
  'iframe-sandbox': { label: 'Embedded page', description: 'Sandboxed iframe (trusted origins only).' },
  'light-tile': { label: 'Light', description: 'Toggle/brightness tile for a light entity.' },
  'fan-tile': { label: 'Fan', description: 'Speed controls for a fan.' },
  'cover-tile': { label: 'Cover', description: 'Open/close for a blind, shade, or garage.' },
  'lock-tile': { label: 'Lock', description: 'Lock/unlock with optional PIN prompt.' },
  'switch-tile': { label: 'Switch', description: 'On/off tile for a switch entity.' },
  'media-tile': { label: 'Media', description: 'Media player transport controls.' },
  thermostat: { label: 'Thermostat', description: 'Climate setpoint and mode.' },
  vehicle: { label: 'Vehicle', description: 'Summary tile for a car or EV.' },
  tesla: { label: 'Tesla', description: 'Tesla vehicle with live compositor image and controls.' },
  'door-window': { label: 'Door / window', description: 'Contact sensor with open/closed visual.' },
  battery: { label: 'Battery', description: 'Battery level with severity thresholds.' },
  weather: { label: 'Weather', description: 'Current, hourly, daily, alerts, and radar.' },
  gauge: { label: 'Gauge', description: 'Radial gauge for a numeric entity.' },
  'sensor-value': { label: 'Sensor value', description: 'Single numeric or text readout.' },
  'history-graph': { label: 'History graph', description: 'Time-series plot of one or more sensors.' },
  'entity-list': { label: 'Entity list', description: 'Compact list of entities with state.' },
  statistic: { label: 'Statistic', description: 'Aggregated stat (min/max/avg over period).' },
  camera: { label: 'Camera', description: 'Live or snapshot view of a camera entity.' },
  'area-summary': { label: 'Area summary', description: 'Hero tile for an area with alerts + sensors.' },
  map: { label: 'Map', description: 'Geographic map of trackers and trails.' },
  'alert-banner': { label: 'Alert banner', description: 'Inline notification surface.' },
  'notification-inbox': { label: 'Notification inbox', description: 'Active notifications list.' },
  'alarm-panel': { label: 'Alarm panel', description: 'Security panel with arm/disarm.' },
  group: { label: 'Group', description: 'Labeled container of cards.' },
  conditional: { label: 'Conditional', description: 'Show/hide child based on state or user.' },
  'vertical-stack': { label: 'Vertical stack', description: 'Stack cards top-to-bottom.' },
  'horizontal-stack': { label: 'Horizontal stack', description: 'Stack cards side-by-side.' },
};

/** Seed templates before Zod parse. Zod adds any missing defaults on parse. */
const seeds: Record<CardType, unknown> = {
  heading: { type: 'heading', text: 'Heading', style: 'title' },
  markdown: { type: 'markdown', content: 'New markdown card' },
  button: { type: 'button', name: 'Button', icon: '⚙️', tapAction: { type: 'none' } },
  'iframe-sandbox': { type: 'iframe-sandbox', url: 'https://example.com' },
  'light-tile': { type: 'light-tile', entity: 'replace.with.light_id' },
  'fan-tile': { type: 'fan-tile', entity: 'replace.with.fan_id' },
  'cover-tile': { type: 'cover-tile', entity: 'replace.with.cover_id' },
  'lock-tile': { type: 'lock-tile', entity: 'replace.with.lock_id' },
  'switch-tile': { type: 'switch-tile', entity: 'replace.with.switch_id' },
  'media-tile': { type: 'media-tile', entity: 'replace.with.media_id' },
  thermostat: { type: 'thermostat', entity: 'replace.with.thermostat_id' },
  vehicle: { type: 'vehicle', entity: 'replace.with.vehicle_id' },
  tesla: { type: 'tesla', entity: 'replace.with.tesla_id' },
  'door-window': { type: 'door-window', entity: 'replace.with.contact_id' },
  battery: { type: 'battery', entity: 'replace.with.battery_id' },
  weather: { type: 'weather', entity: 'replace.with.weather_id' },
  gauge: { type: 'gauge', entity: 'replace.with.sensor_id', min: 0, max: 100 },
  'sensor-value': { type: 'sensor-value', entity: 'replace.with.sensor_id' },
  'history-graph': { type: 'history-graph', entities: ['replace.with.sensor_id'], hoursToShow: 12 },
  'entity-list': { type: 'entity-list', entities: ['replace.with.entity_id'] },
  statistic: { type: 'statistic', entity: 'replace.with.sensor_id', stat: 'mean', period: 'day' },
  camera: { type: 'camera', entity: 'replace.with.camera_id' },
  'area-summary': { type: 'area-summary', areaId: 'replace-with-area-id' },
  map: { type: 'map', entities: ['replace.with.tracker_id'] },
  'alert-banner': { type: 'alert-banner', hideWhenEmpty: true },
  'notification-inbox': { type: 'notification-inbox', title: 'Notifications', maxRows: 5 },
  'alarm-panel': { type: 'alarm-panel', entity: 'replace.with.alarm_id' },
  group: { type: 'group', direction: 'row', children: [] },
  conditional: {
    type: 'conditional',
    when: { type: 'state', entity: 'replace.with.entity', equals: 'on' },
    then: { type: 'markdown', content: 'Shown when condition is true' },
  },
  'vertical-stack': { type: 'vertical-stack', children: [] },
  'horizontal-stack': { type: 'horizontal-stack', children: [] },
};

export function createCardOfType(cardType: CardType): CardDescriptor {
  const seed = seeds[cardType];
  return cardDescriptorSchema.parse(seed);
}
