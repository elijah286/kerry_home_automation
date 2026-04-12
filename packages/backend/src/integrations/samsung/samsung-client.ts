// ---------------------------------------------------------------------------
// Samsung Smart TV WebSocket remote client
// Communicates via Tizen WebSocket API (port 8002 wss / 8001 ws)
// ---------------------------------------------------------------------------

import WebSocket from 'ws';
import { logger } from '../../logger.js';

const WS_TIMEOUT = 10_000;
const HTTP_TIMEOUT = 5_000;
const APP_NAME = Buffer.from('HomeAutomation').toString('base64');

export interface SamsungDeviceInfo {
  id: string;
  name: string;
  modelName: string;
  firmwareVersion?: string;
}

export class SamsungClient {
  private ws: WebSocket | null = null;
  private token: string | null;

  constructor(
    private host: string,
    token?: string,
  ) {
    this.token = token ?? null;
  }

  // ---------- connection ----------

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const tokenParam = this.token ? `&token=${this.token}` : '';
    const url = `wss://${this.host}:8002/api/v2/channels/samsung.remote.control?name=${APP_NAME}${tokenParam}`;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws?.terminate();
        reject(new Error('Samsung WebSocket connection timeout'));
      }, WS_TIMEOUT);

      this.ws = new WebSocket(url, { rejectUnauthorized: false });

      this.ws.on('open', () => {
        logger.debug({ host: this.host }, 'Samsung TV WebSocket connected');
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // On first pairing, TV returns the token
          if (msg.data?.token) {
            this.token = msg.data.token;
            logger.info({ host: this.host }, 'Samsung TV paired — token received');
          }
          if (msg.event === 'ms.channel.connect') {
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // ignore non-JSON frames
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on('close', () => {
        this.ws = null;
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  // ---------- remote keys ----------

  async sendKey(key: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const payload = JSON.stringify({
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: key,
        Option: false,
        TypeOfRemote: 'SendRemoteKey',
      },
    });

    this.ws!.send(payload);
  }

  // ---------- HTTP info endpoints ----------

  async getPowerState(): Promise<boolean> {
    try {
      const res = await fetch(`http://${this.host}:8001/api/v2/`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getDeviceInfo(): Promise<SamsungDeviceInfo | null> {
    try {
      const res = await fetch(`http://${this.host}:8001/api/v2/`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { device?: SamsungDeviceInfo };
      return json.device ?? null;
    } catch {
      return null;
    }
  }
}
