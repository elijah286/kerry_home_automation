// ---------------------------------------------------------------------------
// Alarm types
// ---------------------------------------------------------------------------

export interface AlarmDeviceAction {
  deviceId: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface Alarm {
  id: string;
  name: string;
  /** HH:MM 24-hour format */
  time: string;
  /** 0=Sun, 1=Mon, ..., 6=Sat */
  daysOfWeek: number[];
  enabled: boolean;
  devices: AlarmDeviceAction[];
  /** Optional automation to trigger when the alarm fires */
  automationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlarmCreate {
  name: string;
  time: string;
  daysOfWeek: number[];
  enabled?: boolean;
  devices?: AlarmDeviceAction[];
  automationId?: string | null;
}

export interface AlarmUpdate {
  name?: string;
  time?: string;
  daysOfWeek?: number[];
  enabled?: boolean;
  devices?: AlarmDeviceAction[];
  automationId?: string | null;
}
