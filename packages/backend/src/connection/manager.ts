// ---------------------------------------------------------------------------
// ConnectionManager: base class for persistent-connection integrations
// Handles reconnection with exponential backoff + jitter, timer hygiene
// ---------------------------------------------------------------------------

import type { ConnectionState } from '@ha/shared';
import { CircuitBreaker } from './circuit-breaker.js';
import { logger as rootLogger } from '../logger.js';

export interface ConnectionManagerOpts {
  name: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
}

export abstract class ConnectionManager {
  readonly name: string;
  protected _state: ConnectionState = 'init';
  protected retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly breaker: CircuitBreaker;
  protected readonly log;

  constructor(opts: ConnectionManagerOpts) {
    this.name = opts.name;
    this.breaker = new CircuitBreaker(
      opts.breakerThreshold ?? 5,
      opts.breakerCooldownMs ?? 30_000,
    );
    this.log = rootLogger.child({ integration: opts.name });
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this.breaker.isOpen) {
      this.log.warn('Circuit breaker open — skipping connect');
      this._state = 'error';
      return;
    }

    this._state = this.retryCount === 0 ? 'connecting' : 'reconnecting';
    try {
      await this.doConnect();
      this._state = 'connected';
      this.retryCount = 0;
      this.breaker.recordSuccess();
      this.log.info('Connected');
    } catch (err) {
      this.breaker.recordFailure();
      this.log.error({ err }, 'Connection failed');
      this.scheduleReconnect();
    }
  }

  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;

  private scheduleReconnect(): void {
    const baseDelay = 1_000;
    const maxDelay = 60_000;
    const delay = Math.min(
      baseDelay * 2 ** this.retryCount + Math.random() * 1000,
      maxDelay,
    );
    this._state = 'reconnecting';

    // CRITICAL: always clear before setting to prevent timer leaks
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);

    this.retryCount++;
    this.log.info({ retryCount: this.retryCount, delayMs: Math.round(delay) }, 'Reconnecting');
  }

  async disconnect(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      await this.doDisconnect();
    } catch (err) {
      this.log.error({ err }, 'Error during disconnect');
    }
    this._state = 'disconnected';
    this.log.info('Disconnected');
  }
}
