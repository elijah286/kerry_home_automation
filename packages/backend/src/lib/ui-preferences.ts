import type {
  AuthSessionResponse,
  UiPreferences,
  UiPreferenceLocks,
  UiColorMode,
  User,
  UserRole,
} from '@ha/shared';
import {
  VALID_UI_THEME_IDS,
  UI_PREFERENCE_KEYS,
  type UiPreferencesAdminPatch,
} from '@ha/shared';

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function effectiveUiPreferences(
  userJson: unknown,
  adminJson: unknown,
): { effective: UiPreferences; locks: UiPreferenceLocks } {
  const user = asRecord(userJson);
  const admin = asRecord(adminJson);
  const effective: UiPreferences = {};
  const locks: UiPreferenceLocks = {};

  for (const key of UI_PREFERENCE_KEYS) {
    if (admin[key] !== undefined && admin[key] !== null) {
      (effective as Record<string, unknown>)[key] = admin[key];
      locks[key] = true;
    } else if (user[key] !== undefined && user[key] !== null) {
      (effective as Record<string, unknown>)[key] = user[key];
    }
  }

  return { effective, locks };
}

export function validateColorMode(v: unknown): v is UiColorMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function validateActiveTheme(v: unknown): v is string {
  return typeof v === 'string' && (VALID_UI_THEME_IDS as readonly string[]).includes(v);
}

export function validateFontSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 10 && v <= 28;
}

export function validateMagnification(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 3;
}

const LCARS_VARIANT_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export function validateLcarsVariant(v: unknown): v is string {
  return typeof v === 'string' && LCARS_VARIANT_RE.test(v);
}

export function validateSounds(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/** Strips invalid keys from a partial body; returns keys that were invalid */
export function sanitizeUserUiPreferencesPatch(body: unknown): {
  patch: UiPreferences;
  invalid: string[];
} {
  const patch: UiPreferences = {};
  const invalid: string[] = [];
  if (typeof body !== 'object' || body === null) {
    return { patch, invalid: ['body'] };
  }
  const o = body as Record<string, unknown>;

  if ('colorMode' in o) {
    if (o.colorMode === undefined) {
      /* skip */
    } else if (validateColorMode(o.colorMode)) {
      patch.colorMode = o.colorMode;
    } else {
      invalid.push('colorMode');
    }
  }
  if ('activeTheme' in o) {
    if (o.activeTheme === undefined) {
      /* skip */
    } else if (validateActiveTheme(o.activeTheme)) {
      patch.activeTheme = o.activeTheme;
    } else {
      invalid.push('activeTheme');
    }
  }
  if ('fontSize' in o) {
    if (o.fontSize === undefined) {
      /* skip */
    } else if (validateFontSize(o.fontSize)) {
      patch.fontSize = o.fontSize;
    } else {
      invalid.push('fontSize');
    }
  }
  if ('magnification' in o) {
    if (o.magnification === undefined) {
      /* skip */
    } else if (validateMagnification(o.magnification)) {
      patch.magnification = o.magnification;
    } else {
      invalid.push('magnification');
    }
  }
  if ('lcarsVariant' in o) {
    if (o.lcarsVariant === undefined) {
      /* skip */
    } else if (validateLcarsVariant(o.lcarsVariant)) {
      patch.lcarsVariant = o.lcarsVariant;
    } else {
      invalid.push('lcarsVariant');
    }
  }
  if ('lcarsSoundsEnabled' in o) {
    if (o.lcarsSoundsEnabled === undefined) {
      /* skip */
    } else if (validateSounds(o.lcarsSoundsEnabled)) {
      patch.lcarsSoundsEnabled = o.lcarsSoundsEnabled;
    } else {
      invalid.push('lcarsSoundsEnabled');
    }
  }

  return { patch, invalid };
}

export function applyAdminPreferencesPatch(
  currentAdmin: unknown,
  patch: UiPreferencesAdminPatch | undefined,
): Record<string, unknown> {
  const admin = { ...asRecord(currentAdmin) };
  if (!patch || typeof patch !== 'object') return admin;

  for (const key of UI_PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const v = patch[key];
    if (v === null) {
      delete admin[key];
      continue;
    }
    if (v === undefined) continue;

    if (key === 'colorMode' && validateColorMode(v)) admin.colorMode = v;
    else if (key === 'activeTheme' && validateActiveTheme(v)) admin.activeTheme = v;
    else if (key === 'fontSize' && validateFontSize(v)) admin.fontSize = v;
    else if (key === 'magnification' && validateMagnification(v)) admin.magnification = v;
    else if (key === 'lcarsVariant' && validateLcarsVariant(v)) admin.lcarsVariant = v;
    else if (key === 'lcarsSoundsEnabled' && validateSounds(v)) admin.lcarsSoundsEnabled = v;
  }

  return admin;
}

export function mergeUserPreferences(currentUser: unknown, patch: UiPreferences): Record<string, unknown> {
  const user = { ...asRecord(currentUser) };
  for (const key of UI_PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const v = patch[key];
    if (v === undefined) continue;
    (user as Record<string, unknown>)[key] = v;
  }
  return user;
}

export type SessionUserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  enabled: boolean;
  created_at: Date;
  ui_preferences: unknown;
  ui_preferences_admin: unknown;
  /** Present on login query only */
  password_hash?: string;
  has_pin: boolean;
};

export function authSessionFromRow(
  r: SessionUserRow,
  elevation?: { elevated: boolean; elevatedSecondsRemaining: number },
): AuthSessionResponse {
  const user: User = {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role as UserRole,
    enabled: r.enabled,
    createdAt: r.created_at.toISOString(),
    hasPin: r.has_pin,
  };
  const { effective, locks } = effectiveUiPreferences(r.ui_preferences, r.ui_preferences_admin);
  return {
    user,
    uiPreferences: effective,
    uiPreferenceLocks: locks,
    elevated: elevation?.elevated ?? false,
    elevatedSecondsRemaining: elevation?.elevatedSecondsRemaining ?? 0,
  };
}
