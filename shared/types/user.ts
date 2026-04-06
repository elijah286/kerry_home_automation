export type UserRole = 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  allowed_areas: string[] | null;
  dashboard_config: Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: User;
}
