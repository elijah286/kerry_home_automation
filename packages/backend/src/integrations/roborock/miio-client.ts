// ---------------------------------------------------------------------------
// Roborock miIO local protocol client
// Communicates with Roborock vacuums via UDP miIO protocol
// ---------------------------------------------------------------------------

import { createSocket, type Socket } from 'node:dgram';
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { logger } from '../../logger.js';

const MIIO_PORT = 54321;

export interface RoborockStatus {
  battery: number;
  state: number;
  fan_power: number;
  clean_area: number;
  clean_time: number;
  error_code: number;
  msg_ver: number;
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
      logger.debug({ err }, 'Roborock: get_status failed');
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

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
