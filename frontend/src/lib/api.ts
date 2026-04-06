import type {
  AreaWithFloor,
  Device,
  EntityHistoryResponse,
  EntityState,
  PaprikaCategory,
  PaprikaGroceryItem,
  PaprikaMeal,
  PaprikaRecipe,
  StatsResponse,
  SystemMode,
} from '@/types';
import { getStoredToken } from '@/providers/AuthProvider';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('invalid JSON response', res.status, text);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE}${path}`;
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });
  const data = await parseJson<unknown>(res);

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('ha_auth_token');
      window.location.href = '/login';
    }
    throw new ApiError('unauthorized', 401, data);
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : res.statusText;
    throw new ApiError(msg || 'request failed', res.status, data);
  }
  return data as T;
}

export interface FetchEntitiesParams {
  domain?: string;
  area_id?: string;
}

export async function fetchAreas(): Promise<{ areas: AreaWithFloor[] }> {
  return request('/api/areas');
}

export async function fetchEntities(params?: FetchEntitiesParams): Promise<{ entities: EntityState[] }> {
  const q = new URLSearchParams();
  if (params?.domain) {
    q.set('domain', params.domain);
  }
  if (params?.area_id) {
    q.set('area_id', params.area_id);
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return request(`/api/entities${suffix}`);
}

export async function fetchEntityHistory(
  entityId: string,
  start?: string,
  end?: string,
  limit?: number,
): Promise<EntityHistoryResponse> {
  const q = new URLSearchParams();
  if (start) {
    q.set('start', start);
  }
  if (end) {
    q.set('end', end);
  }
  if (limit !== undefined) {
    q.set('limit', String(limit));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return request(`/api/entities/${encodeURIComponent(entityId)}/history${suffix}`);
}

export async function fetchDevices(): Promise<{ devices: Device[] }> {
  return request('/api/devices');
}

export async function fetchStats(): Promise<StatsResponse> {
  return request('/api/stats');
}

export async function postCommand(
  entityId: string,
  command: string,
  data?: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return request(`/api/entities/${encodeURIComponent(entityId)}/command`, {
    method: 'POST',
    body: JSON.stringify({ command, data }),
  });
}

export async function postSystemMode(mode: SystemMode): Promise<{ mode: SystemMode }> {
  return request('/api/system/mode', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function fetchSystemMode(): Promise<{ mode: SystemMode }> {
  return request('/api/system/mode');
}

// Paprika Recipe Manager

export async function fetchPaprikaRecipes(): Promise<{ recipes: PaprikaRecipe[]; count: number }> {
  return request('/api/paprika/recipes/full');
}

export async function fetchPaprikaRecipe(uid: string): Promise<{ recipe: PaprikaRecipe }> {
  return request(`/api/paprika/recipes/${encodeURIComponent(uid)}`);
}

export async function fetchPaprikaCategories(): Promise<{ categories: PaprikaCategory[] }> {
  return request('/api/paprika/categories');
}

export async function fetchPaprikaGroceries(): Promise<{ groceries: PaprikaGroceryItem[] }> {
  return request('/api/paprika/groceries');
}

export async function fetchPaprikaMeals(): Promise<{ meals: PaprikaMeal[] }> {
  return request('/api/paprika/meals');
}

export async function refreshPaprikaCache(): Promise<{ ok: boolean; cleared: number }> {
  return request('/api/paprika/refresh', { method: 'POST' });
}
