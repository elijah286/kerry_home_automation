import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { Bridge } from './base.js';
import { LutronBridge } from './lutron.js';
import { MqttBridge } from './mqtt.js';
import { ZWaveBridge } from './zwave.js';

class BridgeManager {
  private bridges = new Map<string, Bridge>();

  constructor() {
    const mqttEnabled = process.env.MQTT_BRIDGE_ENABLED !== '0';
    const zwaveEnabled = process.env.ZWAVE_BRIDGE_ENABLED !== '0';
    const lutronEnabled =
      process.env.LUTRON_BRIDGE_ENABLED !== '0' && config.lutron.bridges.length > 0;

    this.bridges.set('mqtt', new MqttBridge({ name: 'mqtt', enabled: mqttEnabled }));
    this.bridges.set('zwave', new ZWaveBridge({ name: 'zwave', enabled: zwaveEnabled }));
    this.bridges.set('lutron', new LutronBridge({ name: 'lutron', enabled: lutronEnabled }));
  }

  async connectAll(): Promise<void> {
    for (const b of this.bridges.values()) {
      if (!b.isEnabled()) {
        continue;
      }
      try {
        await b.connect();
      } catch (err) {
        logger.error({ err, bridge: b.name }, 'bridge connect failed');
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const b of this.bridges.values()) {
      try {
        await b.disconnect();
      } catch (err) {
        logger.error({ err, bridge: b.name }, 'bridge disconnect failed');
      }
    }
  }

  getBridge(name: string): Bridge | undefined {
    return this.bridges.get(name);
  }

  async sendCommand(entityId: string, command: string, data?: Record<string, unknown>): Promise<void> {
    if (config.readOnly) {
      logger.warn({ entityId, command }, 'sendCommand blocked: read-only mode');
      return;
    }
    const bridge = this.routeBridge(entityId, data);
    if (!bridge) {
      throw new Error(`No bridge for entity: ${entityId}`);
    }
    if (!bridge.isConnected) {
      throw new Error(`Bridge ${bridge.name} is not connected`);
    }
    await bridge.sendCommand(entityId, command, data);
  }

  private routeBridge(entityId: string, data?: Record<string, unknown>): Bridge | undefined {
    if (typeof data?.bridge === 'string') {
      return this.bridges.get(data.bridge);
    }
    if (entityId.startsWith('zwave.')) {
      return this.bridges.get('zwave');
    }
    if (entityId.startsWith('lutron.')) {
      return this.bridges.get('lutron');
    }
    if (
      entityId.startsWith('esphome.') ||
      entityId.startsWith('frigate.') ||
      entityId.startsWith('zigbee2mqtt.') ||
      entityId.startsWith('ha.') ||
      entityId.startsWith('mqtt.')
    ) {
      return this.bridges.get('mqtt');
    }
    return this.bridges.get('mqtt');
  }
}

export const bridgeManager = new BridgeManager();
