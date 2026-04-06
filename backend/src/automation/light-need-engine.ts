import type { StateChangedEvent, LightNeedChangedEvent } from '@home-automation/shared';
import { AREAS } from '@home-automation/shared';
import { eventBus } from '../state/event-bus.js';
import { stateManager } from '../state/manager.js';
import { logger } from '../logger.js';
import { areaLightingConfigStore } from './area-lighting-config.js';
import {
  normalizeIlluminance,
  normalizeSolarProduction,
  normalizeSunPosition,
  normalizeWeatherCondition,
  normalizeCloudCover,
  fuseSignals,
  type NormalizedSignals,
  type SignalWeights,
} from './signal-normalizers.js';

const SOLAR_ENTITY = 'sensor.apf_generation_entity';
const WEATHER_ENTITY = 'weather.home';
const GLOBAL_ILLUMINANCE_ENTITY = 'sensor.illuminance';
const GLOBAL_MOTION_LIGHTS_ENTITY = 'input_boolean.motion_lights_on';
const SOLAR_CAPACITY_WATTS = 9500;

interface AreaState {
  smoothedScore: number;
  armed: boolean;
  lastTransition: number;
}

export interface LightNeedEngineOptions {
  lat: number;
  lon: number;
  tickIntervalMs?: number;
  emaAlpha?: number;
}

export class LightNeedEngine {
  private areaStates = new Map<string, AreaState>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly lat: number;
  private readonly lon: number;
  private readonly tickIntervalMs: number;
  private readonly emaAlpha: number;

  private relevantEntities = new Set<string>();

  constructor(opts: LightNeedEngineOptions) {
    this.lat = opts.lat;
    this.lon = opts.lon;
    this.tickIntervalMs = opts.tickIntervalMs ?? 60_000;
    this.emaAlpha = opts.emaAlpha ?? 0.3;
  }

  async init(): Promise<void> {
    await areaLightingConfigStore.load();
    this.buildRelevantEntitySet();

    for (const area of AREAS) {
      if (!this.areaStates.has(area.id)) {
        this.areaStates.set(area.id, { smoothedScore: 0.5, armed: false, lastTransition: 0 });
      }
    }

    eventBus.on('state_changed', this.onStateChanged);
    this.tickTimer = setInterval(() => this.evaluateAll(), this.tickIntervalMs);

    await this.evaluateAll();
    logger.info({ areas: AREAS.length }, 'Light need engine initialized');
  }

  stop(): void {
    eventBus.off('state_changed', this.onStateChanged);
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private buildRelevantEntitySet(): void {
    this.relevantEntities.clear();
    this.relevantEntities.add(SOLAR_ENTITY);
    this.relevantEntities.add(WEATHER_ENTITY);
    this.relevantEntities.add(GLOBAL_ILLUMINANCE_ENTITY);

    for (const area of AREAS) {
      const cfg = areaLightingConfigStore.getConfig(area.id);
      if (cfg.illuminance_entity_id) {
        this.relevantEntities.add(cfg.illuminance_entity_id);
      }
    }
  }

  private onStateChanged = (event: StateChangedEvent): void => {
    if (!this.relevantEntities.has(event.entity_id)) return;
    void this.evaluateAll().catch((err) => {
      logger.error({ err }, 'Light need engine evaluation failed');
    });
  };

  private async evaluateAll(): Promise<void> {
    const now = Date.now();
    const solarState = stateManager.getState(SOLAR_ENTITY);
    const weatherState = stateManager.getState(WEATHER_ENTITY);

    const solarWatts = solarState ? parseFloat(solarState.state) : NaN;
    const weatherCondition = weatherState?.state ?? null;
    const cloudCoverage = weatherState?.attributes?.cloud_coverage as number | undefined;

    const globalIllumState = stateManager.getState(GLOBAL_ILLUMINANCE_ENTITY);
    const globalLux = globalIllumState ? parseFloat(globalIllumState.state) : NaN;

    let anyArmed = false;

    for (const area of AREAS) {
      const cfg = areaLightingConfigStore.getConfig(area.id);
      if (!cfg.enabled) continue;

      const weights = areaLightingConfigStore.getWeights(area.id);
      const signals = this.gatherSignals(cfg, weights, solarWatts, weatherCondition, cloudCoverage, globalLux);
      const rawScore = fuseSignals(signals, weights);

      let areaState = this.areaStates.get(area.id);
      if (!areaState) {
        areaState = { smoothedScore: rawScore, armed: false, lastTransition: 0 };
        this.areaStates.set(area.id, areaState);
      }

      areaState.smoothedScore =
        this.emaAlpha * rawScore + (1 - this.emaAlpha) * areaState.smoothedScore;

      const holdElapsed = now - areaState.lastTransition;
      const holdSatisfied = holdElapsed >= cfg.min_hold_seconds * 1000;
      let newArmed = areaState.armed;

      if (holdSatisfied) {
        if (!areaState.armed && areaState.smoothedScore >= cfg.activation_threshold) {
          newArmed = true;
        } else if (areaState.armed && areaState.smoothedScore <= cfg.deactivation_threshold) {
          newArmed = false;
        }
      }

      if (newArmed !== areaState.armed) {
        areaState.lastTransition = now;
        areaState.armed = newArmed;
      }

      if (areaState.armed) anyArmed = true;

      this.publishAreaScore(area.id, rawScore, areaState, signals, weights, now);
    }

    await this.publishGlobalMotionLights(anyArmed);
  }

  private gatherSignals(
    cfg: ReturnType<typeof areaLightingConfigStore.getConfig>,
    weights: SignalWeights,
    solarWatts: number,
    weatherCondition: string | null,
    cloudCoverage: number | undefined,
    globalLux: number,
  ): NormalizedSignals {
    let illuminance: number | null = null;
    if (weights.illuminance > 0) {
      const entityId = cfg.illuminance_entity_id ?? GLOBAL_ILLUMINANCE_ENTITY;
      const luxState = stateManager.getState(entityId);
      const lux = luxState ? parseFloat(luxState.state) : NaN;
      const effectiveLux = !isNaN(lux) ? lux : (!isNaN(globalLux) ? globalLux : NaN);
      if (!isNaN(effectiveLux)) {
        illuminance = normalizeIlluminance(effectiveLux, cfg.target_lux);
      }
    }

    let solar: number | null = null;
    if (weights.solar > 0 && !isNaN(solarWatts)) {
      solar = normalizeSolarProduction(solarWatts, SOLAR_CAPACITY_WATTS);
    }

    const sun = normalizeSunPosition(this.lat, this.lon, new Date());

    let weather: number | null = null;
    if (weights.weather > 0 && weatherCondition && weatherCondition !== 'unknown' && weatherCondition !== 'unavailable') {
      weather = normalizeWeatherCondition(weatherCondition);
    }

    let cloud: number | null = null;
    if (weights.cloud > 0 && cloudCoverage !== undefined && !isNaN(cloudCoverage)) {
      cloud = normalizeCloudCover(cloudCoverage);
    }

    return { illuminance, solar, sun, weather, cloud };
  }

  private publishAreaScore(
    areaId: string,
    rawScore: number,
    state: AreaState,
    signals: NormalizedSignals,
    weights: SignalWeights,
    timestamp: number,
  ): void {
    const scoreEntityId = `sensor.${areaId}_light_need_score`;
    const rounded = Math.round(state.smoothedScore * 1000) / 1000;

    void stateManager.setState(scoreEntityId, String(rounded), {
      raw_score: Math.round(rawScore * 1000) / 1000,
      armed: state.armed,
      area_id: areaId,
      unit_of_measurement: '',
      device_class: 'power_factor',
      signals,
      weights,
    });

    const armedEntityId = `input_boolean.${areaId}_motion_lights_on`;
    void stateManager.setState(armedEntityId, state.armed ? 'on' : 'off', {
      area_id: areaId,
      source: 'light_need_engine',
    });

    const event: LightNeedChangedEvent = {
      type: 'light_need_changed',
      area_id: areaId,
      raw_score: rawScore,
      smoothed_score: state.smoothedScore,
      armed: state.armed,
      signals,
      weights: { ...weights },
      timestamp,
    };
    eventBus.emit('light_need_changed', event);
  }

  private async publishGlobalMotionLights(anyArmed: boolean): Promise<void> {
    await stateManager.setState(
      GLOBAL_MOTION_LIGHTS_ENTITY,
      anyArmed ? 'on' : 'off',
      { source: 'light_need_engine', computed: true },
    );
  }

  getAreaState(areaId: string): AreaState | undefined {
    return this.areaStates.get(areaId);
  }

  async reloadConfig(): Promise<void> {
    await areaLightingConfigStore.load();
    this.buildRelevantEntitySet();
    logger.info('Light need engine config reloaded');
  }
}
