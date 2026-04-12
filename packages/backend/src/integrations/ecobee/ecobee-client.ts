// ---------------------------------------------------------------------------
// Ecobee cloud API client
// OAuth2 token refresh, thermostat polling, and command execution (pyecobee parity)
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const BASE_URL = 'https://api.ecobee.com';
const TIMEOUT_MS = 15000;

export interface EcobeeSensorCapability {
  type: string;
  value: string;
}

export interface EcobeeRemoteSensor {
  id: string;
  name: string;
  type: string;
  code?: string;
  capability: EcobeeSensorCapability[];
}

export interface EcobeeProgramClimate {
  name: string;
  climateRef: string;
  sensors?: { id: string; name?: string }[];
  coolTemp?: number;
  heatTemp?: number;
  coolFan?: string;
  heatFan?: string;
  vent?: string;
  ventilatorMinOnTime?: number;
  owner?: string;
  type?: string;
  colour?: number;
  isOccupied?: boolean;
  isOptimized?: boolean;
}

export interface EcobeeProgram {
  currentClimateRef: string;
  schedule: string[][];
  climates: EcobeeProgramClimate[];
}

export interface EcobeeEvent {
  type: string;
  name?: string;
  running: boolean;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  holdClimateRef?: string;
  coolHoldTemp?: number;
  heatHoldTemp?: number;
  fan?: string;
}

export interface EcobeeThermostatSettings {
  hvacMode: string;
  fanMinOnTime: number;
  heatCoolMinDelta?: number;
  holdAction?: string;
  humidifierMode?: string;
  hasHumidifier?: boolean;
  hasHeatPump?: boolean;
  ventilatorType?: string;
  isVentilatorTimerOn?: boolean;
  ventilatorMinOnTimeHome?: number;
  ventilatorMinOnTimeAway?: number;
  compressorProtectionMinTemp?: number;
  autoAway?: boolean;
  followMeComfort?: boolean;
  dehumidifierLevel?: number;
  [key: string]: unknown;
}

export interface EcobeeRuntime {
  connected?: boolean;
  actualTemperature: number;
  actualHumidity: number;
  desiredHeat: number;
  desiredCool: number;
  desiredFanMode: string;
  desiredHumidity?: number;
}

export interface EcobeeThermostat {
  identifier: string;
  name: string;
  modelNumber: string;
  runtime: EcobeeRuntime;
  settings: EcobeeThermostatSettings;
  equipmentStatus: string;
  remoteSensors: EcobeeRemoteSensor[];
  program?: EcobeeProgram;
  events?: EcobeeEvent[];
  weather?: {
    forecasts?: Record<string, unknown>[];
    weatherStation?: string;
    timestamp?: string;
  };
  location?: { isDaylightSaving?: boolean };
  audio?: { microphoneEnabled?: boolean };
}

function selectionMatch(thermostatId: string) {
  return {
    selectionType: 'thermostats' as const,
    selectionMatch: thermostatId,
  };
}

export class EcobeeClient {
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    private apiKey: string,
    private refreshToken: string,
  ) {}

  async refreshAccessToken(): Promise<void> {
    const res = await fetch(`${BASE_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.apiKey,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ecobee token refresh failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    logger.debug('Ecobee: access token refreshed');
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const token = await this.ensureToken();
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}${path}?${qs}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ecobee GET ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${BASE_URL}${path}?format=json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ecobee POST ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async getThermostats(): Promise<EcobeeThermostat[]> {
    const selection = {
      selectionType: 'registered' as const,
      selectionMatch: '',
      includeRuntime: true,
      includeSensors: true,
      includeSettings: true,
      includeEquipmentStatus: true,
      includeProgram: true,
      includeEvents: true,
      includeWeather: true,
      includeLocation: true,
    };

    const data = (await this.get('/1/thermostat', {
      json: JSON.stringify({ selection }),
    })) as { thermostatList: EcobeeThermostat[] };

    return data.thermostatList ?? [];
  }

  async setHvacMode(thermostatId: string, mode: string): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { hvacMode: mode } },
    });
  }

  async setTemperature(thermostatId: string, heatSetpoint: number, coolSetpoint: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [
        {
          type: 'setHold',
          params: {
            holdType: 'nextTransition',
            heatHoldTemp: Math.round(heatSetpoint * 10),
            coolHoldTemp: Math.round(coolSetpoint * 10),
          },
        },
      ],
    });
  }

  /**
   * Fan mode change uses setHold; Ecobee requires heat/cool hold temps alongside fan (see API ex7).
   */
  async setFanMode(
    thermostatId: string,
    fanMode: string,
    heatHoldTempF: number,
    coolHoldTempF: number,
    holdType: string,
    holdHours?: number,
  ): Promise<void> {
    const params: Record<string, unknown> = {
      holdType,
      fan: fanMode,
      heatHoldTemp: Math.round(heatHoldTempF * 10),
      coolHoldTemp: Math.round(coolHoldTempF * 10),
    };
    if (holdType === 'holdHours' && holdHours != null) {
      params.holdHours = holdHours;
    }
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'setHold', params }],
    });
  }

  async resumeProgram(thermostatId: string, resumeAll = false): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'resumeProgram', params: { resumeAll } }],
    });
  }

  async setClimateHold(
    thermostatId: string,
    holdClimateRef: string,
    holdType: string,
    holdHours?: number | null,
  ): Promise<void> {
    const params: Record<string, unknown> = { holdType, holdClimateRef };
    if (holdType === 'holdHours' && holdHours != null) {
      params.holdHours = holdHours;
    }
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'setHold', params }],
    });
  }

  async setHoldTemps(
    thermostatId: string,
    heatTempF: number,
    coolTempF: number,
    holdType: string,
    holdHours?: string,
  ): Promise<void> {
    const params: Record<string, unknown> = {
      holdType,
      heatHoldTemp: Math.round(heatTempF * 10),
      coolHoldTemp: Math.round(coolTempF * 10),
    };
    if (holdType === 'holdHours' && holdHours != null) {
      params.holdHours = parseInt(holdHours, 10);
    }
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'setHold', params }],
    });
  }

  async setFanMinOnTime(thermostatId: string, minutes: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { fanMinOnTime: minutes } },
    });
  }

  async setHumidityPercent(thermostatId: string, pct: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { humidity: String(pct) } },
    });
  }

  async createVacation(
    thermostatId: string,
    name: string,
    coolTempF: number,
    heatTempF: number,
    opts?: {
      startDate?: string;
      startTime?: string;
      endDate?: string;
      endTime?: string;
      fanMode?: string;
      fanMinOnTime?: number;
    },
  ): Promise<void> {
    const params: Record<string, unknown> = {
      name,
      coolHoldTemp: Math.round(coolTempF * 10),
      heatHoldTemp: Math.round(heatTempF * 10),
      fan: opts?.fanMode ?? 'auto',
      fanMinOnTime: String(opts?.fanMinOnTime ?? 0),
    };
    if (opts?.startDate) params.startDate = opts.startDate;
    if (opts?.startTime) params.startTime = opts.startTime;
    if (opts?.endDate) params.endDate = opts.endDate;
    if (opts?.endTime) params.endTime = opts.endTime;
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'createVacation', params }],
    });
  }

  async deleteVacation(thermostatId: string, name: string): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      functions: [{ type: 'deleteVacation', params: { name } }],
    });
  }

  async setVentilatorTimer(thermostatId: string, on: boolean): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { isVentilatorTimerOn: on } },
    });
  }

  async setVentilatorMinOnTimeHome(thermostatId: string, minutes: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { ventilatorMinOnTimeHome: minutes } },
    });
  }

  async setVentilatorMinOnTimeAway(thermostatId: string, minutes: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { ventilatorMinOnTimeAway: minutes } },
    });
  }

  async setCompressorProtectionMinTemp(thermostatId: string, tempF: number): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings: { compressorProtectionMinTemp: Math.round(tempF * 10) } },
    });
  }

  async setDstMode(thermostatId: string, enabled: boolean): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { location: { isDaylightSaving: enabled } },
    });
  }

  async setMicMode(thermostatId: string, enabled: boolean): Promise<void> {
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { audio: { microphoneEnabled: enabled } },
    });
  }

  async setOccupancyModes(
    thermostatId: string,
    patch: { autoAway?: boolean; followMeComfort?: boolean },
  ): Promise<void> {
    const settings: Record<string, boolean> = {};
    if (patch.autoAway !== undefined) settings.autoAway = patch.autoAway;
    if (patch.followMeComfort !== undefined) settings.followMeComfort = patch.followMeComfort;
    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { settings },
    });
  }

  /**
   * Update sensor participation for a comfort setting (climate name), mirroring pyecobee.update_climate_sensors.
   */
  async updateClimateSensors(
    thermostatId: string,
    program: EcobeeProgram,
    climateName: string,
    sensorIds: string[],
    remoteSensors: EcobeeRemoteSensor[],
  ): Promise<void> {
    const programs = structuredClone(program) as EcobeeProgram;
    delete (programs as { currentClimateRef?: string }).currentClimateRef;

    const climateIndex = programs.climates.findIndex((c) => c.name === climateName);
    if (climateIndex < 0) {
      throw new Error(`Unknown comfort setting: ${climateName}`);
    }

    const sensorList: { id: string; name: string }[] = [];
    for (const sid of sensorIds) {
      const sensor = remoteSensors.find((s) => s.id === sid);
      if (!sensor) throw new Error(`Unknown sensor id: ${sid}`);
      sensorList.push({ id: `${sensor.id}:1`, name: sensor.name });
    }
    if (sensorList.length === 0) {
      throw new Error('At least one sensor is required');
    }

    programs.climates[climateIndex] = { ...programs.climates[climateIndex], sensors: sensorList };

    await this.post('/1/thermostat', {
      selection: selectionMatch(thermostatId),
      thermostat: { program: programs },
    });
  }
}
