// ---------------------------------------------------------------------------
// Roborock miIO local protocol client
// Communicates with Roborock vacuums via UDP miIO protocol
// ---------------------------------------------------------------------------

import { createSocket, type Socket } from 'node:dgram';
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { logger } from '../../logger.js';

const log = logger.child({ integration: 'roborock' });

const MIIO_PORT = 54321;

export interface RoborockStatus {
  battery: number;
  state: number;
  fan_power: number;
  clean_area: number;
  clean_time: number;
  error_code: number;
  msg_ver: number;
  water_box_status?: number | null;
  mop_attached?: number | null;
  water_shortage_status?: number | null;
  dock_error_status?: number | null;
  water_box_mode?: number | null;
  mop_mode?: number | null;
  dnd_enabled?: number | null;
  lock_status?: number | null;
}

export interface RoborockConsumables {
  main_brush_work_time: number | null;
  side_brush_work_time: number | null;
  filter_work_time: number | null;
  sensor_dirty_time: number | null;
}

export interface RoborockCleanSummary {
  clean_time: number | null;
  clean_area: number | null;
  clean_count: number | null;
}

// State codes
const STATE_MAP: Record<number, string> = {
  1: 'idle', 2: 'idle', 3: 'idle',
  5: 'cleaning', 6: 'returning', 7: 'cleaning',
  8: 'docked', 9: 'error',
  10: 'paused', 11: 'cleaning', 12: 'error',
  14: 'idle', 15: 'docked', 16: 'cleaning',
  17: 'cleaning', 18: 'cleaning',
  100: 'docked',
};

const FAN_SPEEDS: Record<number, string> = {
  101: 'quiet', 102: 'balanced', 103: 'turbo', 104: 'max', 105: 'gentle',
  106: 'auto', 108: 'max+',
};

export function stateCodeToStatus(code: number): string {
  return STATE_MAP[code] ?? 'idle';
}

export function fanPowerToLabel(power: number): string {
  return FAN_SPEEDS[power] ?? `${power}%`;
}

export class MiioClient {
  private socket: Socket | null = null;
  private token: Buffer;
  private tokenKey: Buffer;
  private tokenIv: Buffer;
  private deviceId: number = 0;
  private stamp: number = 0;
  private pendingResolve: ((value: unknown) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private host: string,
    tokenHex: string,
  ) {
    this.token = Buffer.from(tokenHex, 'hex');
    this.tokenKey = createHash('md5').update(this.token).digest();
    this.tokenIv = createHash('md5').update(this.tokenKey).update(this.token).digest();
  }

  private encrypt(data: Buffer): Buffer {
    const cipher = createCipheriv('aes-128-cbc', this.tokenKey, this.tokenIv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  private decrypt(data: Buffer): Buffer {
    const decipher = createDecipheriv('aes-128-cbc', this.tokenKey, this.tokenIv);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  private buildPacket(payload: Buffer): Buffer {
    const header = Buffer.alloc(32);
    header.writeUInt16BE(0x2131, 0); // Magic
    header.writeUInt16BE(32 + payload.length, 2); // Length
    header.writeUInt32BE(0, 4); // Unknown
    header.writeUInt32BE(this.deviceId, 8); // Device ID
    header.writeUInt32BE(this.stamp++, 12); // Stamp
    // Checksum placeholder (overwritten below)
    const packet = Buffer.concat([header, payload]);
    const checksum = createHash('md5').update(packet.subarray(0, 16)).update(this.token).update(payload).digest();
    checksum.copy(packet, 16);
    return packet;
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;
    this.socket = createSocket('udp4');
    this.socket.on('message', (msg) => {
      if (msg.length <= 32) {
        // Handshake response
        this.deviceId = msg.readUInt32BE(8);
        this.stamp = msg.readUInt32BE(12);
        if (this.pendingResolve) {
          this.pendingResolve(null);
          this.clearPending();
        }
        return;
      }
      try {
        const encrypted = msg.subarray(32);
        const decrypted = this.decrypt(encrypted);
        const json = JSON.parse(decrypted.toString('utf-8'));
        if (this.pendingResolve) {
          this.pendingResolve(json.result);
          this.clearPending();
        }
      } catch (err) {
        if (this.pendingReject) {
          this.pendingReject(err as Error);
          this.clearPending();
        }
      }
    });
    this.socket.on('error', () => {});
    return this.socket;
  }

  private clearPending(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingResolve = null;
    this.pendingReject = null;
    this.pendingTimer = null;
  }

  private sendAndWait(data: Buffer, timeout = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.pendingTimer = setTimeout(() => {
        this.clearPending();
        reject(new Error('miIO timeout'));
      }, timeout);

      const sock = this.ensureSocket();
      sock.send(data, 0, data.length, MIIO_PORT, this.host);
    });
  }

  async handshake(): Promise<void> {
    const hello = Buffer.alloc(32, 0xff);
    hello.writeUInt16BE(0x2131, 0);
    hello.writeUInt16BE(32, 2);
    await this.sendAndWait(hello);
  }

  async send(method: string, params: unknown[] = []): Promise<unknown> {
    if (this.deviceId === 0) await this.handshake();

    const payload = JSON.stringify({ id: Date.now() % 100000, method, params });
    const encrypted = this.encrypt(Buffer.from(payload));
    const packet = this.buildPacket(encrypted);
    return this.sendAndWait(packet);
  }

  async getStatus(): Promise<RoborockStatus | null> {
    try {
      const result = (await this.send('get_status')) as RoborockStatus[];
      return result?.[0] ?? null;
    } catch (err) {
      log.debug({ err }, 'Roborock: get_status failed');
      return null;
    }
  }

  async startCleaning(): Promise<void> { await this.send('app_start'); }
  async stopCleaning(): Promise<void> { await this.send('app_stop'); }
  async pauseCleaning(): Promise<void> { await this.send('app_pause'); }
  async returnToDock(): Promise<void> { await this.send('app_charge'); }
  async findMe(): Promise<void> { await this.send('find_me', ['']); }

  async setFanSpeed(speed: number): Promise<void> {
    await this.send('set_custom_mode', [speed]);
  }

  async getConsumables(): Promise<RoborockConsumables | null> {
    try {
      const result = (await this.send('get_consumable')) as Array<Record<string, number>>;
      const d = result?.[0] ?? null;
      if (!d) return null;
      return {
        main_brush_work_time: d.main_brush_work_time ?? null,
        side_brush_work_time: d.side_brush_work_time ?? null,
        filter_work_time: d.filter_work_time ?? null,
        sensor_dirty_time: d.sensor_dirty_time ?? null,
      };
    } catch (err) {
      log.debug({ err }, 'Roborock: get_consumable failed');
      return null;
    }
  }

  async getCleanSummary(): Promise<RoborockCleanSummary | null> {
    try {
      const result = await this.send('get_clean_summary');
      // Response may be array [time, area, count, [ids]] or an object
      if (Array.isArray(result) && result.length >= 3) {
        return {
          clean_time: typeof result[0] === 'number' ? result[0] : null,
          clean_area: typeof result[1] === 'number' ? result[1] : null,
          clean_count: typeof result[2] === 'number' ? result[2] : null,
        };
      }
      if (result && typeof result === 'object') {
        const d = result as Record<string, number>;
        return {
          clean_time: d.clean_time ?? null,
          clean_area: d.clean_area ?? null,
          clean_count: d.clean_count ?? null,
        };
      }
      return null;
    } catch (err) {
      log.debug({ err }, 'Roborock: get_clean_summary failed');
      return null;
    }
  }

  async resetConsumable(consumable: string): Promise<void> {
    const map: Record<string, string> = {
      main_brush: 'main_brush_work_time',
      side_brush: 'side_brush_work_time',
      filter: 'filter_work_time',
      sensor: 'sensor_dirty_time',
    };
    const key = map[consumable];
    if (!key) throw new Error(`Unknown consumable: ${consumable}`);
    await this.send('reset_consumable', [key]);
  }

  async getRoomMapping(): Promise<Array<[number, string]>> {
    try {
      const result = await this.send('get_room_mapping');
      if (Array.isArray(result)) {
        return result
          .filter((it): it is unknown[] => Array.isArray(it) && it.length > 0)
          .map((it) => [Number(it[0]), String(it[1] ?? `Room ${it[0]}`)]);
      }
      return [];
    } catch (err) {
      log.debug({ err }, 'Roborock: get_room_mapping failed');
      return [];
    }
  }

  async segmentClean(roomIds: number[]): Promise<void> {
    await this.send('app_segment_clean', roomIds);
  }

  async zonedClean(zones: number[][]): Promise<void> {
    await this.send('app_zoned_clean', zones);
  }

  async gotoTarget(x: number, y: number): Promise<void> {
    await this.send('app_goto_target', [x, y]);
  }

  async setMopMode(mode: number): Promise<void> {
    await this.send('set_mop_mode', [mode]);
  }

  async setMopIntensity(level: number): Promise<void> {
    await this.send('set_water_box_custom_mode', [level]);
  }

  async setDnd(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.send('set_dnd_timer', [22, 0, 8, 0]);
    } else {
      await this.send('close_dnd_timer');
    }
  }

  async setChildLock(enabled: boolean): Promise<void> {
    await this.send('set_child_lock_status', [{ lock_status: enabled ? 1 : 0 }]);
  }

  async setVolume(volume: number): Promise<void> {
    const v = Math.max(0, Math.min(100, Math.round(volume)));
    await this.send('change_sound_volume', [v]);
  }

  async startDustCollection(): Promise<void> {
    await this.send('app_start_collect_dust');
  }

  async startMopWash(): Promise<void> {
    await this.send('app_start_wash');
  }

  async stopMopWash(): Promise<void> {
    await this.send('app_stop_wash');
  }

  async getMap(): Promise<Buffer | null> {
    try {
      const result = await this.send('get_map_v1', []);
      if (result == null) return null;
      if (typeof result === 'string') {
        return Buffer.from(result, 'latin1');
      }
      if (Buffer.isBuffer(result)) return result;
      return null;
    } catch (err) {
      log.debug({ err }, 'Roborock: get_map_v1 failed');
      return null;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
