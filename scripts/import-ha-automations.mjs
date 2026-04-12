#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Import Home Assistant automations YAML → our automation system
// All imported automations are created DISABLED.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import yaml from 'js-yaml';

const HA_FILE = process.argv[2] || '/Users/elijahkerry/Downloads/automations-9.yaml';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const token = cookies.find(c => c.startsWith('ha_token='));
  if (!token) throw new Error('Login failed — no token cookie');
  return token.split(';')[0]; // "ha_token=xxx"
}

async function createAutomation(cookie, automation) {
  const res = await fetch(`${API_BASE}/api/automations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(automation),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, id: data.automation.id };
}

// ---------------------------------------------------------------------------
// HA → Our format translators
// ---------------------------------------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// -- Triggers ----------------------------------------------------------------

function translateTrigger(t) {
  const type = t.trigger || t.platform;

  switch (type) {
    case 'time': {
      // HA: { at: "HH:MM:SS" }
      const at = t.at || '00:00:00';
      const parts = String(at).split(':');
      const h = parts[0] || '0';
      const m = parts[1] || '0';
      return { type: 'time', cron: `${parseInt(m)} ${parseInt(h)} * * *` };
    }

    case 'sun': {
      const event = t.event === 'sunrise' ? 'sunrise' : 'sunset';
      const offset = t.offset ? formatOffset(t.offset) : undefined;
      return { type: 'sun', event, ...(offset ? { offset } : {}) };
    }

    case 'state': {
      const entityId = Array.isArray(t.entity_id) ? t.entity_id[0] : t.entity_id;
      const trigger = {
        type: 'device_state',
        deviceId: entityId || '',
        attribute: 'state',
      };
      if (t.from !== undefined) trigger.from = t.from;
      if (t.to !== undefined) trigger.to = t.to;
      if (t.for) trigger.for = formatDuration(t.for);
      return trigger;
    }

    case 'numeric_state': {
      const entityId = Array.isArray(t.entity_id) ? t.entity_id[0] : t.entity_id;
      return {
        type: 'device_state',
        deviceId: entityId || '',
        attribute: 'state',
        ...(t.to !== undefined ? { to: t.to } : {}),
      };
    }

    case 'time_pattern': {
      // HA time_pattern: hours, minutes, seconds as patterns
      const h = t.hours || '*';
      const m = t.minutes || '*';
      // Convert to cron — HA uses /N for every N
      const cronM = String(m).startsWith('/') ? `*${m}` : m;
      const cronH = String(h).startsWith('/') ? `*${h}` : h;
      return { type: 'time', cron: `${cronM} ${cronH} * * *` };
    }

    case 'device': {
      // HA device triggers — use entity_id if available
      return {
        type: 'device_state',
        deviceId: t.entity_id || t.device_id || '',
        attribute: t.type || 'state',
      };
    }

    case 'homeassistant': {
      // HA start/shutdown events — map to manual
      return { type: 'manual' };
    }

    case 'event': {
      // Custom events — no direct equivalent, map to manual
      return { type: 'manual' };
    }

    case 'mqtt': {
      // MQTT triggers — no equivalent, map to manual
      return { type: 'manual' };
    }

    case 'template': {
      // Template triggers — no equivalent, map to manual
      return { type: 'manual' };
    }

    case 'zone': {
      // Zone enter/leave — map to device_state on the person entity
      return {
        type: 'device_state',
        deviceId: t.entity_id || '',
        attribute: 'state',
        to: t.zone || '',
      };
    }

    default:
      return { type: 'manual' };
  }
}

// -- Conditions --------------------------------------------------------------

function translateCondition(c) {
  if (!c) return null;
  const type = c.condition;

  switch (type) {
    case 'state': {
      const entityId = Array.isArray(c.entity_id) ? c.entity_id[0] : c.entity_id;
      const value = Array.isArray(c.state) ? c.state[0] : c.state;
      return {
        type: 'device_state',
        deviceId: entityId || '',
        attribute: 'state',
        op: 'eq',
        value: value ?? '',
      };
    }

    case 'numeric_state': {
      const entityId = Array.isArray(c.entity_id) ? c.entity_id[0] : c.entity_id;
      if (c.above !== undefined) {
        return {
          type: 'device_state',
          deviceId: entityId || '',
          attribute: 'state',
          op: 'gt',
          value: Number(c.above),
        };
      }
      if (c.below !== undefined) {
        return {
          type: 'device_state',
          deviceId: entityId || '',
          attribute: 'state',
          op: 'lt',
          value: Number(c.below),
        };
      }
      return null;
    }

    case 'time': {
      const after = c.after ? String(c.after).slice(0, 5) : '00:00';
      const before = c.before ? String(c.before).slice(0, 5) : '23:59';
      return { type: 'time_window', after, before };
    }

    case 'sun': {
      // Sun condition (after sunrise/before sunset) — approximate with time window
      // Can't perfectly translate, map to a rough time window
      if (c.after === 'sunrise') {
        return { type: 'time_window', after: '06:00', before: '23:59' };
      }
      if (c.before === 'sunset') {
        return { type: 'time_window', after: '00:00', before: '20:00' };
      }
      return null;
    }

    case 'and': {
      const subs = (c.conditions || []).map(translateCondition).filter(Boolean);
      if (subs.length === 0) return null;
      if (subs.length === 1) return subs[0];
      return { type: 'and', conditions: subs };
    }

    case 'or': {
      const subs = (c.conditions || []).map(translateCondition).filter(Boolean);
      if (subs.length === 0) return null;
      if (subs.length === 1) return subs[0];
      return { type: 'or', conditions: subs };
    }

    case 'not': {
      const subs = (c.conditions || []).map(translateCondition).filter(Boolean);
      if (subs.length === 0) return null;
      if (subs.length === 1) return { type: 'not', condition: subs[0] };
      return { type: 'not', condition: { type: 'and', conditions: subs } };
    }

    case 'template': {
      // Template conditions can't be translated — skip
      return null;
    }

    case 'device': {
      return {
        type: 'device_state',
        deviceId: c.entity_id || c.device_id || '',
        attribute: c.type || 'state',
        op: 'eq',
        value: c.state ?? true,
      };
    }

    case 'zone': {
      return {
        type: 'device_state',
        deviceId: c.entity_id || '',
        attribute: 'state',
        op: 'eq',
        value: c.zone || '',
      };
    }

    default:
      return null;
  }
}

function translateConditions(conditions) {
  if (!conditions || (Array.isArray(conditions) && conditions.length === 0)) return [];
  const arr = Array.isArray(conditions) ? conditions : [conditions];
  return arr.map(translateCondition).filter(Boolean);
}

// -- Actions -----------------------------------------------------------------

function translateAction(act) {
  // Delay
  if (act.delay) {
    return { type: 'delay', duration: formatDuration(act.delay) };
  }

  // Choose (conditional branches)
  if (act.choose) {
    // Map first choice to a conditional action
    const choices = Array.isArray(act.choose) ? act.choose : [];
    if (choices.length > 0) {
      const first = choices[0];
      const conds = translateConditions(first.conditions);
      const thenActions = translateActions(first.sequence || []);
      const defaultActions = act.default ? translateActions(Array.isArray(act.default) ? act.default : [act.default]) : [];
      if (conds.length > 0) {
        return {
          type: 'condition',
          condition: conds.length === 1 ? conds[0] : { type: 'and', conditions: conds },
          then: thenActions,
          ...(defaultActions.length > 0 ? { else: defaultActions } : {}),
        };
      }
    }
    return { type: 'log', message: `[HA choose] Could not translate choose block` };
  }

  // If/then/else blocks
  if (act.if) {
    const conds = translateConditions(act.if);
    const thenActions = translateActions(act.then || []);
    const elseActions = act.else ? translateActions(act.else) : [];
    if (conds.length > 0) {
      return {
        type: 'condition',
        condition: conds.length === 1 ? conds[0] : { type: 'and', conditions: conds },
        then: thenActions,
        ...(elseActions.length > 0 ? { else: elseActions } : {}),
      };
    }
    return { type: 'log', message: `[HA if/then] Could not translate if block` };
  }

  // Wait template
  if (act.wait_template) {
    return { type: 'log', message: `[HA wait_template] ${act.wait_template}` };
  }

  // Variables
  if (act.variables) {
    return { type: 'log', message: `[HA variables] ${JSON.stringify(act.variables)}` };
  }

  // Scene
  if (act.scene) {
    return {
      type: 'device_command',
      deviceId: act.scene,
      command: { type: 'switch', deviceId: act.scene, action: 'turn_on' },
    };
  }

  // Service call / action
  const service = act.action || act.service;
  if (service) {
    const target = act.target?.entity_id || act.data?.entity_id || '';
    const entityId = Array.isArray(target) ? target[0] : target;
    const data = { ...(act.data || {}) };
    delete data.entity_id;

    // Map HA service to our command type
    const cmd = mapServiceToCommand(service, entityId, data);
    return {
      type: 'device_command',
      deviceId: entityId || service,
      command: cmd,
    };
  }

  // Repeat
  if (act.repeat) {
    return { type: 'log', message: `[HA repeat] Could not translate repeat block` };
  }

  // Event
  if (act.event) {
    return { type: 'log', message: `[HA event] ${act.event}` };
  }

  return { type: 'log', message: `[HA unknown action] ${JSON.stringify(Object.keys(act))}` };
}

function translateActions(actions) {
  if (!actions || (Array.isArray(actions) && actions.length === 0)) return [];
  const arr = Array.isArray(actions) ? actions : [actions];
  return arr.map(translateAction).filter(Boolean);
}

function mapServiceToCommand(service, entityId, data) {
  const [domain, action] = service.split('.');
  const cmd = { type: domain, deviceId: entityId || '', action: action || service };

  // Merge relevant data fields
  if (data.brightness !== undefined) cmd.brightness = data.brightness;
  if (data.brightness_pct !== undefined) cmd.brightness = Math.round(data.brightness_pct * 2.55);
  if (data.percentage !== undefined) cmd.speed = percentageToSpeed(data.percentage);
  if (data.temperature !== undefined) cmd.temperature = data.temperature;
  if (data.hvac_mode !== undefined) cmd.hvac_mode = data.hvac_mode;
  if (data.preset_mode !== undefined) cmd.preset_mode = data.preset_mode;
  if (data.fan_mode !== undefined) cmd.fan_mode = data.fan_mode;
  if (data.source !== undefined) cmd.source = data.source;
  if (data.sound_mode !== undefined) cmd.soundMode = data.sound_mode;
  if (data.volume_level !== undefined) cmd.volume = data.volume_level;
  if (data.media_content_id !== undefined) cmd.mediaContentId = data.media_content_id;
  if (data.media_content_type !== undefined) cmd.mediaContentType = data.media_content_type;
  if (data.message !== undefined) cmd.message = data.message;
  if (data.option !== undefined) cmd.option = data.option;
  if (data.value !== undefined) cmd.value = data.value;
  if (data.command !== undefined) cmd.command = data.command;
  if (data.position !== undefined) cmd.position = data.position;

  return cmd;
}

function percentageToSpeed(pct) {
  if (pct <= 0) return 'off';
  if (pct <= 25) return 'low';
  if (pct <= 50) return 'medium';
  if (pct <= 75) return 'medium-high';
  return 'high';
}

// -- Helpers -----------------------------------------------------------------

function formatDuration(dur) {
  if (typeof dur === 'string') {
    // Already "HH:MM:SS" or "00:05:00"
    if (dur.includes(':')) return dur;
    return `00:00:${String(dur).padStart(2, '0')}`;
  }
  if (typeof dur === 'number') {
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    const s = dur % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof dur === 'object') {
    const h = dur.hours || 0;
    const m = dur.minutes || 0;
    const s = dur.seconds || 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return '00:00:00';
}

function formatOffset(offset) {
  if (typeof offset === 'number') {
    const sign = offset < 0 ? '-' : '';
    const abs = Math.abs(offset);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof offset === 'string') return offset;
  return undefined;
}

// -- Translate one full automation -------------------------------------------

function translateAutomation(ha) {
  const alias = ha.alias || `HA ${ha.id}`;
  const id = `ha-${slugify(alias)}-${ha.id}`;

  const triggers = (ha.triggers || ha.trigger || []);
  const triggersArr = Array.isArray(triggers) ? triggers : [triggers];
  const ourTriggers = triggersArr.map(translateTrigger);

  const conditions = ha.conditions || ha.condition || [];
  const ourConditions = translateConditions(conditions);

  const actions = ha.actions || ha.action || [];
  const ourActions = translateActions(actions);

  // Determine HA mode
  const modeMap = { single: 'single', restart: 'restart', queued: 'queued', parallel: 'parallel' };
  const mode = modeMap[ha.mode] || 'single';

  // Determine group from alias prefix
  let group = 'HA Import';
  const prefixMatch = alias.match(/^(v\d+[:\s]*|V\d+[:\s]*)/);

  return {
    id: id.slice(0, 100), // DB might have length limits
    name: alias,
    group,
    description: `Imported from Home Assistant (id: ${ha.id}).`,
    enabled: false,
    mode,
    triggers: ourTriggers.length > 0 ? ourTriggers : [{ type: 'manual' }],
    conditions: ourConditions,
    actions: ourActions.length > 0 ? ourActions : [{ type: 'log', message: 'No actions translated' }],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Reading ${HA_FILE}...`);
  const text = readFileSync(HA_FILE, 'utf8');
  const automations = yaml.load(text);
  const enabled = automations.filter(a => a.enabled !== false);

  console.log(`Found ${automations.length} total, ${enabled.length} enabled`);

  // Skip the 2 we already imported
  const alreadyImported = new Set(['1564287283702', '2343245553234']);
  const toImport = enabled.filter(a => !alreadyImported.has(String(a.id)));
  console.log(`Importing ${toImport.length} automations (skipping ${enabled.length - toImport.length} already imported)...`);

  const cookie = await login();
  console.log('Authenticated');

  let created = 0;
  let failed = 0;
  const errors = [];
  const seenIds = new Set();

  for (const ha of toImport) {
    let translated;
    try {
      translated = translateAutomation(ha);
    } catch (err) {
      errors.push({ haId: ha.id, alias: ha.alias, error: `Translation error: ${err.message}` });
      failed++;
      continue;
    }

    // Deduplicate IDs
    let finalId = translated.id;
    let suffix = 1;
    while (seenIds.has(finalId)) {
      finalId = `${translated.id.slice(0, 90)}-${suffix++}`;
    }
    seenIds.add(finalId);
    translated.id = finalId;

    const result = await createAutomation(cookie, translated);
    if (result.ok) {
      created++;
      if (created % 50 === 0) console.log(`  ...${created} created`);
    } else {
      errors.push({ haId: ha.id, alias: ha.alias, error: result.error });
      failed++;
    }
  }

  console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  [${e.haId}] ${e.alias}: ${e.error}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
