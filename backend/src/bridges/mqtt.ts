import {
  ENTITY_DOMAINS,
  type EntityDomain,
  type EntityState,
} from '@home-automation/shared';
import mqtt, { type MqttClient } from 'mqtt';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { stateManager } from '../state/manager.js';
import { Bridge, type BridgeConfig } from './base.js';

function asDomain(d: string): EntityDomain {
  return (ENTITY_DOMAINS as readonly string[]).includes(d) ? (d as EntityDomain) : 'sensor';
}

function now(): number {
  return Date.now();
}

function baseState(entity_id: string, domain: EntityDomain, state: string, attributes: Record<string, unknown>): EntityState {
  const t = now();
  return {
    entity_id,
    domain,
    state,
    attributes,
    last_changed: t,
    last_updated: t,
  };
}

export class MqttBridge extends Bridge {
  private client: MqttClient | null = null;

  constructor(bridgeConfig: BridgeConfig) {
    super(bridgeConfig);
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const c = mqtt.connect(config.mqtt.url, {
        reconnectPeriod: 5000,
        connectTimeout: 30_000,
        username: config.mqtt.username,
        password: config.mqtt.password,
      });
      const onConnectError = (err: Error) => {
        reject(err);
      };
      c.on('error', onConnectError);
      c.on('connect', () => {
        this.connected = true;
        const topics = ['esphome/#', 'frigate/#', 'zigbee2mqtt/#', 'homeassistant/#'];
        c.subscribe(topics, (err) => {
          if (err) {
            reject(err);
            return;
          }
          c.off('error', onConnectError);
          c.on('error', (subErr) => {
            logger.error({ err: subErr, bridge: this.name }, 'MQTT error');
          });
          logger.info({ bridge: this.name, topics }, 'MQTT subscribed');
          resolve();
        });
      });
      c.on('error', (err) => {
        logger.error({ err, bridge: this.name }, 'MQTT error');
      });
      c.on('close', () => {
        this.connected = false;
      });
      c.on('message', (topic, buf) => {
        void this.onMessage(topic, buf);
      });
      this.client = c;
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
  }

  private async onMessage(topic: string, buf: Buffer): Promise<void> {
    const payload = buf.toString('utf8');
    try {
      if (topic.startsWith('esphome/')) {
        const st = this.parseEsphome(topic, payload);
        if (st) await stateManager.applyState(st);
        return;
      }
      if (topic.startsWith('frigate/')) {
        const states = this.parseFrigate(topic, payload);
        for (const st of states) {
          await stateManager.applyState(st);
        }
        return;
      }
      if (topic.startsWith('zigbee2mqtt/')) {
        const st = this.parseZigbee2mqtt(topic, payload);
        if (st) await stateManager.applyState(st);
        return;
      }
      if (topic.startsWith('homeassistant/')) {
        const st = this.parseHomeAssistant(topic, payload);
        if (st) await stateManager.applyState(st);
      }
    } catch (err) {
      logger.warn({ err, topic, bridge: this.name }, 'MQTT message handling failed');
    }
  }

  private parseEsphome(topic: string, payload: string): EntityState | null {
    const parts = topic.split('/').filter(Boolean);
    if (parts.length < 4) {
      return null;
    }
    const device = parts[1];
    const domainHint = parts[2];
    const tail = parts.slice(3);
    const isState = tail[tail.length - 1] === 'state';
    if (!isState) {
      return null;
    }
    const pathName = tail.slice(0, -1).join('_');
    const entity_id = `esphome.${device}.${domainHint}.${pathName}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const domain = asDomain(domainHint);
    const attributes: Record<string, unknown> = { friendly_name: `${device} ${pathName}`, topic };
    return baseState(entity_id, domain, payload, attributes);
  }

  private parseFrigate(topic: string, payload: string): EntityState[] {
    const out: EntityState[] = [];
    if (topic === 'frigate/events') {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return out;
      }
      const type = String(data.type ?? 'unknown');
      const after = data.after as Record<string, unknown> | undefined;
      const camera = after?.camera != null ? String(after.camera) : 'unknown';
      const label = after?.label != null ? String(after.label) : '';
      const entity_id = 'frigate.events';
      const st = baseState(
        entity_id,
        'event',
        type,
        {
          topic,
          camera,
          label,
          raw: data,
        },
      );
      out.push(st);
      return out;
    }
    const parts = topic.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'frigate') {
      const camera = parts[1];
      const metric = parts.slice(2).join('_');
      const entity_id = `frigate.${camera}.${metric}`.replace(/[^a-zA-Z0-9._-]/g, '_');
      const st = baseState(entity_id, 'sensor', payload, { topic, camera });
      out.push(st);
    }
    return out;
  }

  private parseZigbee2mqtt(topic: string, payload: string): EntityState | null {
    const prefix = 'zigbee2mqtt/';
    if (!topic.startsWith(prefix)) {
      return null;
    }
    const name = topic.slice(prefix.length).split('/')[0];
    if (!name) {
      return null;
    }
    let data: Record<string, unknown> = {};
    try {
      data = payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
    } catch {
      return baseState(`zigbee2mqtt.${name}`, 'sensor', payload, { topic });
    }
    const stateVal =
      data.state != null
        ? String(data.state)
        : data.contact != null
          ? String(data.contact)
          : JSON.stringify(data);
    const entity_id = `zigbee2mqtt.${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const domain = typeof data.brightness === 'number' ? asDomain('light') : asDomain('sensor');
    return baseState(entity_id, domain, stateVal, { ...data, topic });
  }

  private parseHomeAssistant(topic: string, payload: string): EntityState | null {
    const parts = topic.split('/').filter(Boolean);
    if (parts.length < 4) {
      return null;
    }
    const component = parts[1];
    const objectId = parts[2];
    const last = parts[parts.length - 1];
    if (last !== 'state') {
      return null;
    }
    const domain = asDomain(component);
    const entity_id = `${component}.${objectId}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    return baseState(`ha.${entity_id}`, domain, payload, { topic, object_id: objectId });
  }

  async sendCommand(entityId: string, command: string, data?: Record<string, unknown>): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('MQTT bridge not connected');
    }
    const explicitTopic = typeof data?.topic === 'string' ? data.topic : undefined;
    const payload =
      typeof data?.payload === 'string'
        ? data.payload
        : data?.payload != null
          ? JSON.stringify(data.payload)
          : command === 'turn_on'
            ? 'ON'
            : command === 'turn_off'
              ? 'OFF'
              : JSON.stringify({ command, ...data });
    if (explicitTopic) {
      this.client.publish(explicitTopic, payload, { qos: 0 });
      return;
    }
    if (entityId.startsWith('esphome.')) {
      const rest = entityId.slice('esphome.'.length).split('.');
      if (rest.length >= 3) {
        const topic = `esphome/${rest.join('/')}/command`;
        this.client.publish(topic, payload, { qos: 0 });
        return;
      }
    }
    if (entityId.startsWith('zigbee2mqtt.')) {
      const name = entityId.slice('zigbee2mqtt.'.length);
      const topic = `zigbee2mqtt/${name}/set`;
      this.client.publish(topic, payload, { qos: 0 });
      return;
    }
    if (entityId.startsWith('ha.')) {
      const without = entityId.slice(3);
      const dot = without.indexOf('.');
      if (dot === -1) {
        throw new Error('Invalid homeassistant entity id for MQTT command');
      }
      const component = without.slice(0, dot);
      const objectId = without.slice(dot + 1);
      const topic = `homeassistant/${component}/${objectId}/set`;
      this.client.publish(topic, payload, { qos: 0 });
      return;
    }
    throw new Error(`MQTT bridge cannot route command for entity: ${entityId}`);
  }
}
