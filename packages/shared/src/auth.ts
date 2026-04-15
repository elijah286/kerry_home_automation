// ---------------------------------------------------------------------------
// Auth types — users, roles, permissions
// ---------------------------------------------------------------------------

import type {
  UiPreferences,
  UiPreferencesAdminPatch,
  UiPreferenceLocks,
} from './ui-preferences.js';

export const USER_ROLES = ['admin', 'parent', 'user', 'kiosk', 'child'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can set a PIN and use it to elevate any session's privileges. */
export const PIN_ELIGIBLE_ROLES: readonly UserRole[] = ['admin', 'parent'] as const;

/** Whether the given role is allowed to have a PIN for privilege elevation. */
export function canHavePin(role: string): boolean {
  return PIN_ELIGIBLE_ROLES.includes(role as UserRole);
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  /** Whether this account has a PIN configured (used for temporary elevation). */
  hasPin?: boolean;
  /** Present on admin user-list responses: appearance overrides for this user */
  uiPreferencesAdmin?: UiPreferences;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** Returned by GET /api/auth/me and POST /api/auth/login */
export interface AuthSessionResponse {
  user: User;
  uiPreferences: UiPreferences;
  uiPreferenceLocks: UiPreferenceLocks;
  /** True while this session has active PIN-based elevation */
  elevated?: boolean;
  /** Seconds remaining in the elevation window (counts down; refreshed by API activity) */
  elevatedSecondsRemaining?: number;
  /** True when at least one admin/parent has a PIN — any session can be elevated. */
  pinElevationAvailable?: boolean;
}

export type LoginResponse = AuthSessionResponse;

export interface CreateUserRequest {
  username: string;
  displayName: string;
  password: string;
  /** 4–6 digit PIN for temporary privilege elevation on devices */
  pin: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: UserRole;
  enabled?: boolean;
  password?: string;
  /** Set or replace 4–6 digit elevation PIN */
  pin?: string;
  /** Merge into admin UI overrides; use `null` for a key to clear that override */
  uiPreferencesAdmin?: UiPreferencesAdminPatch;
}

export enum Permission {
  ViewDevices = 'view_devices',
  SendCommands = 'send_commands',
  ViewCameras = 'view_cameras',
  ManageIntegrations = 'manage_integrations',
  ManageAutomations = 'manage_automations',
  ManageAreas = 'manage_areas',
  ManageSettings = 'manage_settings',
  ManageUsers = 'manage_users',
  RenameDevices = 'rename_devices',
  /** View live backend log stream in the UI (role-assignable; default admin-only) */
  ViewSystemTerminal = 'view_system_terminal',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.ViewDevices]: 'View Devices',
  [Permission.SendCommands]: 'Control Devices',
  [Permission.ViewCameras]: 'View Cameras',
  [Permission.ManageIntegrations]: 'Manage Integrations',
  [Permission.ManageAutomations]: 'Manage Automations',
  [Permission.ManageAreas]: 'Manage Areas',
  [Permission.ManageSettings]: 'Manage Settings',
  [Permission.ManageUsers]: 'Manage Users',
  [Permission.RenameDevices]: 'Rename Devices',
  [Permission.ViewSystemTerminal]: 'System Terminal',
};

/** Default permissions per role — used as fallback when no DB overrides exist */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: Object.values(Permission),
  parent: [
    Permission.ViewDevices,
    Permission.SendCommands,
    Permission.ViewCameras,
    Permission.ManageAutomations,
    Permission.ManageAreas,
    Permission.RenameDevices,
    Permission.ViewSystemTerminal,
  ],
  user: [
    Permission.ViewDevices,
    Permission.SendCommands,
    Permission.ViewCameras,
  ],
  kiosk: [
    Permission.ViewDevices,
    Permission.SendCommands,
  ],
  child: [
    Permission.ViewDevices,
  ],
};

/** Runtime role permissions — starts as defaults, can be overridden from DB */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = { ...DEFAULT_ROLE_PERMISSIONS };
