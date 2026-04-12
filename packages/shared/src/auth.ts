// ---------------------------------------------------------------------------
// Auth types — users, roles, permissions
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'user' | 'kiosk';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: UserRole;
  enabled?: boolean;
  password?: string;
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
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: Object.values(Permission),
  user: [
    Permission.ViewDevices,
    Permission.SendCommands,
    Permission.ViewCameras,
  ],
  kiosk: [
    Permission.ViewDevices,
    Permission.SendCommands,
  ],
};
