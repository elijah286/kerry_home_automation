// ---------------------------------------------------------------------------
// ESPHome web_server v2 client — uses Server-Sent Events (SSE) for state
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

export interface EspEntityState {
  id: string;        // e.g. "binary_sensor-zone_1", "light-blue_status_led"
  name: string;
  state: string;     // "ON" / "OFF" / numeric string
  value?: number | string | boolean;
  domain?: string;
  device_class?: string;
  unit_of_measurement?: string;
  // light-specific
  color_mode?: string;
  effects?: string[];
  // switch-specific
  icon?: string;
  assumed_state?: boolean;
}

export interface EspDeviceInfo {
  title: string;     // device name
  comment: string;
  ota: boolean;
  log: boolean;
}

type StateCallback = (states: EspEntityState[], deviceInfo: EspDeviceInfo) => void;

export class EsphomeClient {
  private baseUrl: string;
  private abortController: AbortController | null = null;
  private states = new Map<string, EspEntityState>();
  private deviceInfo: EspDeviceInfo = { title: 'ESPHome', comment: '', ota: false, log: false };
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private host: string,
    private password?: string,
    private port: number = 80,
  ) {
    this.baseUrl = `http://${this.host}:${this.port}`;
  }

  /** Connect to SSE stream. Calls onUpdate whenever state changes. */
  async connect(onUpdate: StateCallback): Promise<void> {
    this.disconnect();
    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {};
      if (this.password) {
        headers['Authorization'] = `Basic ${Buffer.from(`:${this.password}`).toString('base64')}`;
      }

      const res = await fetch(`${this.baseUrl}/events`, {
        headers,
        signal: this.abortController.signal,
      });

      if (!res.ok) throw new Error(`ESPHome SSE ${res.status}: ${res.statusText}`);
      if (!res.body) throw new Error('No response body');

      this.connected = true;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      const processLine = (line: string) => {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (currentEvent === 'ping') {
              this.deviceInfo = parsed as EspDeviceInfo;
            } else if (currentEvent === 'state') {
              const entity = parsed as EspEntityState;
              this.states.set(entity.id, entity);
              onUpdate([...this.states.values()], this.deviceInfo);
            }
          } catch { /* ignore malformed JSON */ }
          currentEvent = '';
        }
      };

      // Read SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          processLine(line);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.connected = false;
      throw err;
    } finally {
      this.connected = false;
    }
  }

  /** Start SSE with auto-reconnect. Returns initial states via callback. */
  startStreaming(onUpdate: StateCallback): void {
    const attempt = () => {
      this.connect(onUpdate).catch((err) => {
        logger.warn({ err, host: this.host }, 'ESPHome SSE disconnected, reconnecting in 10s');
        if (!this.abortController?.signal.aborted) {
          this.reconnectTimer = setTimeout(attempt, 10_000);
        }
      });
    };
    attempt();
  }

  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStates(): EspEntityState[] {
    return [...this.states.values()];
  }

  getDeviceInfo(): EspDeviceInfo {
    return this.deviceInfo;
  }

  /** Send a command via REST POST (still works in web_server v2) */
  async postCommand(domain: string, id: string, action: string, body?: Record<string, unknown>): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`:${this.password}`).toString('base64')}`;
    }
    const res = await fetch(`${this.baseUrl}/${domain}/${id}/${action}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`ESPHome command ${res.status}: ${res.statusText}`);
  }

  async setLightBrightness(id: string, brightness: number): Promise<void> {
    await this.postCommand('light', id, 'turn_on', { brightness });
  }
}
