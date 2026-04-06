import type { AutomationRule } from '../engine.js';

import { lightingRules } from './lighting.js';
import { presenceRules } from './presence.js';
import { securityRules } from './security.js';
import { energyRules } from './energy.js';
import { kidsRules } from './kids.js';
import { avRules } from './av.js';
import { hvacRules } from './hvac.js';
import { poolRules } from './pool.js';
import { cleaningRules } from './cleaning.js';
import { blindsRules } from './blinds.js';
import { seasonalRules } from './seasonal.js';

export const allRules: AutomationRule[] = [
  ...lightingRules,
  ...presenceRules,
  ...securityRules,
  ...energyRules,
  ...kidsRules,
  ...avRules,
  ...hvacRules,
  ...poolRules,
  ...cleaningRules,
  ...blindsRules,
  ...seasonalRules,
];

export {
  lightingRules,
  presenceRules,
  securityRules,
  energyRules,
  kidsRules,
  avRules,
  hvacRules,
  poolRules,
  cleaningRules,
  blindsRules,
  seasonalRules,
};
