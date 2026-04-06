import type { StateChangedEvent, PresenceChangedEvent } from '@home-automation/shared';
import { AREAS } from '@home-automation/shared';
import { eventBus } from '../state/event-bus.js';
import { stateManager } from '../state/manager.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Types & configuration
// ---------------------------------------------------------------------------

interface SensorConfig {
  weight: number;
  decayMs: number;
  petDiscriminate: boolean;
}

const SENSOR_DEFAULTS: Record<string, SensorConfig> = {
  mmwave:  { weight: 0.35, decayMs: 120_000, petDiscriminate: false },
  pir:     { weight: 0.15, decayMs: 30_000,  petDiscriminate: false },
  frigate: { weight: 0.30, decayMs: 60_000,  petDiscriminate: true  },
  door:    { weight: 0.10, decayMs: 15_000,  petDiscriminate: false },
  ble:     { weight: 0.05, decayMs: 300_000, petDiscriminate: false },
  face:    { weight: 0.05, decayMs: 120_000, petDiscriminate: true  },
};

const OCCUPIED_THRESHOLD   = 0.4;
const UNOCCUPIED_THRESHOLD = 0.25;
const TICK_INTERVAL_MS     = 10_000;

interface AreaPresenceState {
  areaId: string;
  occupied: boolean;
  confidence: number;
  lastDetection: number;
  sources: string[];
  personCount: number;
  petDetected: boolean;
  sensorActivations: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Entity-ID → (area, sensor-type) resolution
// ---------------------------------------------------------------------------

interface SensorPattern {
  suffix: string;
  sensorType: string;
  domain: string;
}

const SENSOR_PATTERNS: SensorPattern[] = [
  { suffix: '_mmwave_presence', sensorType: 'mmwave',  domain: 'binary_sensor' },
  { suffix: '_pir_motion',      sensorType: 'pir',     domain: 'binary_sensor' },
  { suffix: '_person_detected', sensorType: 'frigate', domain: 'binary_sensor' },
  { suffix: '_door',            sensorType: 'door',    domain: 'binary_sensor' },
  { suffix: '_face_detected',   sensorType: 'face',    domain: 'binary_sensor' },
];

const PET_SUFFIXES = ['_dog_detected', '_cat_detected', '_pet_detected'];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class PresenceFusionEngine {
  private areaStates = new Map<string, AreaPresenceState>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  /** slugified-area-name / slug-style area-id / alias → canonical area id */
  private slugToAreaId = new Map<string, string>();
  /** entity_id → resolved {areaId, sensorType}, or null for non-matching */
  private entityCache = new Map<string, { areaId: string; sensorType: string } | null>();
  /** BLE tracker entity_id → area it currently occupies */
  private bleTrackerAreas = new Map<string, string>();
  /** area_id → last Frigate pet activation timestamp */
  private petActivations = new Map<string, number>();

  // ---- public API ---------------------------------------------------------

  init(): void {
    this.buildSlugIndex();
    this.initAreaStates();

    eventBus.on('state_changed', this.onStateChanged);
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    this.tick();
    logger.info({ areas: this.areaStates.size }, 'Presence fusion engine initialized');
  }

  stop(): void {
    eventBus.off('state_changed', this.onStateChanged);
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  getAreaPresence(areaId: string): AreaPresenceState | undefined {
    return this.areaStates.get(areaId);
  }

  getAllPresence(): AreaPresenceState[] {
    return [...this.areaStates.values()];
  }

  // ---- bootstrap ----------------------------------------------------------

  private buildSlugIndex(): void {
    for (const area of AREAS) {
      this.slugToAreaId.set(slugify(area.name), area.id);

      if (/^[a-z0-9_]+$/.test(area.id)) {
        this.slugToAreaId.set(area.id, area.id);
      }

      for (const alias of area.aliases) {
        const s = slugify(alias);
        if (s) this.slugToAreaId.set(s, area.id);
      }
    }
  }

  private initAreaStates(): void {
    for (const area of AREAS) {
      this.areaStates.set(area.id, {
        areaId: area.id,
        occupied: false,
        confidence: 0,
        lastDetection: 0,
        sources: [],
        personCount: 0,
        petDetected: false,
        sensorActivations: new Map(),
      });
    }
  }

  // ---- event handling -----------------------------------------------------

  private onStateChanged = (event: StateChangedEvent): void => {
    const { entity_id, new_state } = event;
    if (!new_state) return;

    if (entity_id.startsWith('device_tracker.') && entity_id.endsWith('_phone')) {
      this.handleBleTracker(entity_id, new_state.state, new_state.attributes);
      return;
    }

    if (entity_id.startsWith('binary_sensor.')) {
      const petAreaId = this.matchPetEntity(entity_id);
      if (petAreaId) {
        if (new_state.state === 'on') {
          this.petActivations.set(petAreaId, Date.now());
        }
        return;
      }
    }

    const match = this.resolveEntity(entity_id);
    if (!match) return;

    const area = this.areaStates.get(match.areaId);
    if (!area) return;

    if (new_state.state === 'on') {
      const now = Date.now();
      area.sensorActivations.set(match.sensorType, now);
      area.lastDetection = now;

      if (match.sensorType === 'frigate') {
        const count = new_state.attributes?.count;
        area.personCount =
          typeof count === 'number' && count >= 0
            ? count
            : Math.max(area.personCount, 1);
      }
    }
  };

  private handleBleTracker(
    entityId: string,
    state: string,
    attributes: Record<string, unknown>,
  ): void {
    const previousAreaId = this.bleTrackerAreas.get(entityId);
    let currentAreaId: string | undefined;

    const attrArea = attributes?.area_id as string | undefined;
    if (attrArea && this.areaStates.has(attrArea)) {
      currentAreaId = attrArea;
    } else if (
      state !== 'home' &&
      state !== 'not_home' &&
      state !== 'unavailable' &&
      state !== 'unknown'
    ) {
      currentAreaId = this.slugToAreaId.get(slugify(state));
    }

    if (previousAreaId && previousAreaId !== currentAreaId) {
      this.bleTrackerAreas.delete(entityId);
    }

    if (currentAreaId) {
      this.bleTrackerAreas.set(entityId, currentAreaId);
      const area = this.areaStates.get(currentAreaId);
      if (area) {
        const now = Date.now();
        area.sensorActivations.set('ble', now);
        area.lastDetection = now;
      }
    }
  }

  // ---- entity resolution --------------------------------------------------

  private matchPetEntity(entityId: string): string | null {
    const dotIdx = entityId.indexOf('.');
    if (dotIdx === -1) return null;
    const afterDot = entityId.slice(dotIdx + 1);

    for (const suffix of PET_SUFFIXES) {
      if (afterDot.endsWith(suffix)) {
        return this.slugToAreaId.get(afterDot.slice(0, -suffix.length)) ?? null;
      }
    }
    return null;
  }

  private resolveEntity(entityId: string): { areaId: string; sensorType: string } | null {
    const cached = this.entityCache.get(entityId);
    if (cached !== undefined) return cached;

    const dotIdx = entityId.indexOf('.');
    if (dotIdx === -1) {
      this.entityCache.set(entityId, null);
      return null;
    }

    const domain = entityId.slice(0, dotIdx);
    const afterDot = entityId.slice(dotIdx + 1);

    for (const pattern of SENSOR_PATTERNS) {
      if (domain !== pattern.domain || !afterDot.endsWith(pattern.suffix)) continue;

      const slug = afterDot.slice(0, -pattern.suffix.length);
      const areaId = this.slugToAreaId.get(slug);
      if (areaId) {
        const result = { areaId, sensorType: pattern.sensorType };
        this.entityCache.set(entityId, result);
        return result;
      }
    }

    this.entityCache.set(entityId, null);
    return null;
  }

  // ---- tick & recalculation -----------------------------------------------

  private tick(): void {
    const now = Date.now();

    for (const [, areaId] of this.bleTrackerAreas) {
      const area = this.areaStates.get(areaId);
      if (area) area.sensorActivations.set('ble', now);
    }

    for (const state of this.areaStates.values()) {
      this.recalculate(state, now);
    }
  }

  private recalculate(state: AreaPresenceState, now: number): void {
    let confidence = 0;
    const activeSources: string[] = [];
    let hasPersonDiscriminator = false;

    for (const [sensorType, lastActivation] of state.sensorActivations) {
      const config = SENSOR_DEFAULTS[sensorType];
      if (!config) continue;

      const decayFactor = Math.max(0, 1 - (now - lastActivation) / config.decayMs);
      if (decayFactor <= 0) continue;

      confidence += config.weight * decayFactor;
      activeSources.push(sensorType);

      if (config.petDiscriminate) hasPersonDiscriminator = true;
    }

    confidence = Math.min(1, Math.max(0, confidence));

    // --- pet discrimination ------------------------------------------------
    const petTs = this.petActivations.get(state.areaId) ?? 0;
    const petRecent = now - petTs < SENSOR_DEFAULTS.frigate.decayMs;
    const frigateActive = activeSources.includes('frigate');
    let suppressOccupancy = false;

    if (petRecent && !hasPersonDiscriminator) {
      const hasNonDiscriminating = activeSources.some(
        (s) => !SENSOR_DEFAULTS[s]?.petDiscriminate,
      );
      if (hasNonDiscriminating) suppressOccupancy = true;
    }

    state.petDetected = petRecent;
    state.sources = activeSources;
    state.confidence = confidence;
    if (!frigateActive) state.personCount = 0;

    // --- hysteresis --------------------------------------------------------
    const wasOccupied = state.occupied;
    let isOccupied: boolean;

    if (suppressOccupancy) {
      isOccupied = false;
    } else if (!wasOccupied && confidence >= OCCUPIED_THRESHOLD) {
      isOccupied = true;
    } else if (wasOccupied && confidence <= UNOCCUPIED_THRESHOLD) {
      isOccupied = false;
    } else {
      isOccupied = wasOccupied;
    }

    state.occupied = isOccupied;

    // --- publish synthetic entities ----------------------------------------
    this.publishState(state, now);

    // --- emit on transition ------------------------------------------------
    if (isOccupied !== wasOccupied) {
      const event: PresenceChangedEvent = {
        type: 'presence_changed',
        area_id: state.areaId,
        occupied: isOccupied,
        confidence: Math.round(confidence * 100) / 100,
        sources: [...activeSources],
        timestamp: now,
      };
      eventBus.emit('presence_changed', event);

      logger.info(
        {
          area: state.areaId,
          occupied: isOccupied,
          confidence: Math.round(confidence * 100),
          sources: activeSources,
          petDetected: state.petDetected,
        },
        `Presence ${isOccupied ? 'detected' : 'cleared'}`,
      );
    }
  }

  // ---- state publishing ---------------------------------------------------

  private publishState(state: AreaPresenceState, now: number): void {
    const sensorBreakdown: Record<string, { decay_factor: number; last_activation: number }> = {};
    for (const [sensorType, lastActivation] of state.sensorActivations) {
      const config = SENSOR_DEFAULTS[sensorType];
      if (!config) continue;
      sensorBreakdown[sensorType] = {
        decay_factor: Math.round(Math.max(0, 1 - (now - lastActivation) / config.decayMs) * 1000) / 1000,
        last_activation: lastActivation,
      };
    }

    void stateManager.setState(
      `binary_sensor.${state.areaId}_occupancy`,
      state.occupied ? 'on' : 'off',
      {
        area_id: state.areaId,
        confidence: Math.round(state.confidence * 100),
        sources: state.sources,
        person_count: state.personCount,
        pet_detected: state.petDetected,
        last_detection: state.lastDetection || null,
        device_class: 'occupancy',
        source: 'presence_fusion',
      },
    );

    void stateManager.setState(
      `sensor.${state.areaId}_presence_confidence`,
      String(Math.round(state.confidence * 100)),
      {
        area_id: state.areaId,
        unit_of_measurement: '%',
        device_class: 'power_factor',
        source: 'presence_fusion',
        sensors: sensorBreakdown,
      },
    );
  }
}

export const presenceFusionEngine = new PresenceFusionEngine();
