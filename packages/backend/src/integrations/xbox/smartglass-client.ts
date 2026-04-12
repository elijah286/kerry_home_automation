// ---------------------------------------------------------------------------
// Xbox SmartGlass REST API client
// Talks to Xbox console via REST API (Xbox must have SmartGlass enabled)
// Also supports Wake-on-LAN for power on
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';
import { createSocket } from 'node:dgram';

export interface XboxStatus {
  live_id: string;
  console_type: string;
  console_name: string;
  active_titles: { name: string; aum_id: string; has_focus: boolean }[];
  connection_state: string;
}

export class SmartGlassClient {
  constructor(
    private host: string,
    private liveId?: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `http://${this.host}:5050${path}`;
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Xbox API ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async getStatus(): Promise<XboxStatus | null> {
    try {
      return await this.request<XboxStatus>('GET', '/device');
    } catch {
      return null;
    }
  }

  async connect(): Promise<boolean> {
    try {
      await this.request('GET', `/device/${this.liveId ?? ''}/connect`);
      return true;
    } catch {
      return false;
    }
  }

  async powerOn(): Promise<void> {
    if (this.liveId) {
      try {
        await this.request('GET', `/device/${this.liveId}/poweron`);
        return;
      } catch {
        // Fall through to WoL
      }
    }
    // Fallback: Send Wake-on-LAN to the Xbox IP (broadcast)
    await this.sendWoL();
  }

  async powerOff(): Promise<void> {
    await this.request('GET', '/device/poweroff');
  }

  async launchApp(aumId: string): Promise<void> {
    await this.request('POST', '/device/launch', { uri: aumId });
  }

  async mediaCommand(command: string): Promise<void> {
    await this.request('GET', `/device/media/${command}`);
  }

  async setVolume(direction: 'up' | 'down' | 'mute'): Promise<void> {
    if (direction === 'mute') {
      await this.request('GET', '/device/media/mute');
    } else {
      await this.request('GET', `/device/media/volume_${direction}`);
    }
  }

  async sendInput(button: string): Promise<void> {
    await this.request('GET', `/device/input/${button}`);
  }

  private sendWoL(): Promise<void> {
    return new Promise((resolve) => {
      // Send a general power-on packet to the Xbox IP
      const socket = createSocket('udp4');
      const magicPacket = Buffer.alloc(6, 0xff);
      socket.send(magicPacket, 0, magicPacket.length, 5050, this.host, () => {
        socket.close();
        resolve();
      });
    });
  }
}
