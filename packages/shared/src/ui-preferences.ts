// ---------------------------------------------------------------------------
// Per-user UI preferences (stored server-side; admin can override per user)
// ---------------------------------------------------------------------------

export const VALID_UI_THEME_IDS = [
  'default',
  'midnight',
  'glass',
  'forest',
  'rose',
  'slate',
  'ocean',
  'amber',
  'lcars',
] as const;

export type ValidUiThemeId = (typeof VALID_UI_THEME_IDS)[number];

export type UiColorMode = 'light' | 'dark' | 'system';

export interface UiPreferences {
  colorMode?: UiColorMode;
  activeTheme?: string;
  fontSize?: number;
  lcarsVariant?: string;
  lcarsSoundsEnabled?: boolean;
}

/** Keys the hub may set for a user; `null` clears an admin override for that key */
export type UiPreferencesAdminPatch = {
  [K in keyof UiPreferences]?: UiPreferences[K] | null;
};

export const UI_PREFERENCE_KEYS: (keyof UiPreferences)[] = [
  'colorMode',
  'activeTheme',
  'fontSize',
  'lcarsVariant',
  'lcarsSoundsEnabled',
];

export type UiPreferenceLocks = Partial<Record<keyof UiPreferences, true>>;
