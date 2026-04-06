export interface BridgeConfig {
  name: string;
  enabled: boolean;
}

export abstract class Bridge {
  readonly name: string;
  protected connected = false;

  constructor(protected config: BridgeConfig) {
    this.name = config.name;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(entityId: string, command: string, data?: Record<string, unknown>): Promise<void>;

  get isConnected(): boolean {
    return this.connected;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}
