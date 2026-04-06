import { stateManager } from '../state/manager.js';
import { eventBus } from '../state/event-bus.js';
import { logger } from '../logger.js';
import { config } from '../config/index.js';
import { getSolarElevation } from './sun-calc.js';
import { scheduler } from './scheduler.js';
import type { SystemMode, StateChangedEvent } from '@home-automation/shared';

const MODE_ENTITY = 'sensor.system_mode';
const SOLAR_ENTITY = 'sensor.apf_generation_entity';
const SOLAR_DAY_THRESHOLD_WATTS = 500;

type ModeTransition = {
  from: SystemMode;
  to: SystemMode;
  scheduleTime: string;
  sunRelative?: { event: 'sunrise' | 'sunset'; offsetMin: number; constraint: 'at_earliest' | 'at_latest' };
};

const TRANSITIONS: ModeTransition[] = [
  {
    from: 'night',
    to: 'morning',
    scheduleTime: '06:00',
    sunRelative: { event: 'sunrise', offsetMin: -30, constraint: 'at_earliest' },
  },
  { from: 'morning', to: 'day', scheduleTime: '08:00' },
  {
    from: 'day',
    to: 'evening',
    scheduleTime: '18:00',
    sunRelative: { event: 'sunset', offsetMin: -30, constraint: 'at_latest' },
  },
  { from: 'evening', to: 'late_evening', scheduleTime: '21:00' },
  { from: 'late_evening', to: 'late_night', scheduleTime: '23:00' },
  { from: 'late_night', to: 'night', scheduleTime: '01:00' },
];

const MODE_ORDER: SystemMode[] = [
  'night', 'morning', 'day', 'evening', 'late_evening', 'late_night',
];

export class ModeMachine {
  private overrideTimeout: ReturnType<typeof setTimeout> | null = null;
  private overrideActive = false;
  private initialized = false;

  async init(): Promise<void> {
    for (const transition of TRANSITIONS) {
      const schedId = `mode_${transition.from}_to_${transition.to}`;
      scheduler.addSchedule(schedId, transition.scheduleTime, () => {
        void this.evaluateTransition(transition).catch((err) => {
          logger.error({ err, transition: schedId }, 'Mode transition evaluation failed');
        });
      });
    }

    eventBus.on('state_changed', this.onStateChanged);

    const correctMode = this.computeCurrentMode();
    const currentMode = stateManager.getSystemMode();
    if (currentMode !== correctMode) {
      logger.info({ from: currentMode, to: correctMode }, 'Correcting system mode on startup');
      await stateManager.setSystemMode(correctMode);
    }

    await this.publishModeEntity();
    this.initialized = true;
    logger.info({ mode: stateManager.getSystemMode() }, 'Mode machine initialized');
  }

  stop(): void {
    for (const transition of TRANSITIONS) {
      scheduler.removeSchedule(`mode_${transition.from}_to_${transition.to}`);
    }
    eventBus.off('state_changed', this.onStateChanged);
    if (this.overrideTimeout) {
      clearTimeout(this.overrideTimeout);
      this.overrideTimeout = null;
    }
    this.initialized = false;
  }

  async override(mode: SystemMode, durationMs = 3_600_000): Promise<void> {
    if (this.overrideTimeout) {
      clearTimeout(this.overrideTimeout);
    }

    this.overrideActive = true;
    logger.info({ mode, durationMs }, 'Manual mode override');
    await stateManager.setSystemMode(mode);
    await this.publishModeEntity();

    this.overrideTimeout = setTimeout(() => {
      this.overrideActive = false;
      this.overrideTimeout = null;
      const correctMode = this.computeCurrentMode();
      logger.info({ mode: correctMode }, 'Override expired, returning to auto mode');
      void stateManager.setSystemMode(correctMode).then(() => this.publishModeEntity());
    }, durationMs);
  }

  private onStateChanged = (event: StateChangedEvent): void => {
    if (event.entity_id !== SOLAR_ENTITY) return;
    if (this.overrideActive || !this.initialized) return;

    const watts = parseFloat(event.new_state.state);
    if (isNaN(watts)) return;

    const currentMode = stateManager.getSystemMode();
    if (currentMode === 'morning' && watts > SOLAR_DAY_THRESHOLD_WATTS) {
      logger.info({ watts }, 'Solar production triggered morning → day');
      void stateManager.setSystemMode('day').then(() => this.publishModeEntity());
    }
  };

  private async evaluateTransition(transition: ModeTransition): Promise<void> {
    if (this.overrideActive) return;

    const currentMode = stateManager.getSystemMode();
    if (currentMode !== transition.from) return;

    if (transition.sunRelative) {
      const { event, offsetMin, constraint } = transition.sunRelative;
      const sunMinutes = scheduler.getSunEventMinutes(event);
      if (sunMinutes !== null) {
        const sunTarget = sunMinutes + offsetMin;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        if (constraint === 'at_earliest' && nowMinutes < sunTarget) return;
        if (constraint === 'at_latest' && nowMinutes > sunTarget) {
          // Sun-based time already passed; schedule time is the fallback — allow transition
        }
      }
    }

    logger.info({ from: transition.from, to: transition.to }, 'Mode transition');
    await stateManager.setSystemMode(transition.to);
    await this.publishModeEntity();
  }

  private computeCurrentMode(): SystemMode {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const transitionMinutes = TRANSITIONS.map((t) => {
      const [h, m] = t.scheduleTime.split(':').map(Number);
      let minutes = h * 60 + m;

      if (t.sunRelative) {
        const sunMin = scheduler.getSunEventMinutes(t.sunRelative.event, now);
        if (sunMin !== null) {
          const sunTarget = sunMin + t.sunRelative.offsetMin;
          if (t.sunRelative.constraint === 'at_earliest') {
            minutes = Math.max(minutes, sunTarget);
          } else {
            minutes = Math.min(minutes, sunTarget);
          }
        }
      }

      return { transition: t, minutes: Math.round(minutes) };
    });

    // Walk the transition list in reverse chronological order of today.
    // The most recent transition whose time has passed determines the current mode.
    // Handle the day wrap: late_night→night at 01:00 means between 01:00 and
    // the next transition we're in 'night'.
    let currentMode: SystemMode = 'late_night'; // default if before 01:00

    // Sort transitions by time-of-day ascending
    const sorted = [...transitionMinutes].sort((a, b) => a.minutes - b.minutes);

    for (const { transition, minutes } of sorted) {
      if (nowMinutes >= minutes) {
        currentMode = transition.to;
      }
    }

    return currentMode;
  }

  private async publishModeEntity(): Promise<void> {
    const mode = stateManager.getSystemMode();
    const nextTransition = this.getNextTransitionTime();

    await stateManager.setState(MODE_ENTITY, mode, {
      friendly_name: 'System Mode',
      mode_order: MODE_ORDER,
      override_active: this.overrideActive,
      next_transition: nextTransition?.toIso ?? null,
      next_mode: nextTransition?.toMode ?? null,
    });
  }

  private getNextTransitionTime(): { toMode: SystemMode; toIso: string } | null {
    const currentMode = stateManager.getSystemMode();
    const transition = TRANSITIONS.find((t) => t.from === currentMode);
    if (!transition) return null;

    const now = new Date();
    const [h, m] = transition.scheduleTime.split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return { toMode: transition.to, toIso: target.toISOString() };
  }

  getStatus() {
    return {
      mode: stateManager.getSystemMode(),
      overrideActive: this.overrideActive,
      nextTransition: this.getNextTransitionTime(),
    };
  }
}

export const modeMachine = new ModeMachine();
