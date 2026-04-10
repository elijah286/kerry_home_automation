const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function sendCommand(deviceId: string, command: Record<string, unknown>): Promise<void> {
  await fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

// Paprika
import type { PaprikaRecipe, PaprikaCategory, PaprikaGroceryItem, PaprikaMeal } from '@ha/shared';

export async function getPaprikaRecipesFull(): Promise<{ recipes: PaprikaRecipe[]; count: number }> {
  return fetchApi('/api/paprika/recipes/full');
}

export async function getPaprikaCategories(): Promise<{ categories: PaprikaCategory[] }> {
  return fetchApi('/api/paprika/categories');
}

export async function getPaprikaGroceries(): Promise<{ groceries: PaprikaGroceryItem[] }> {
  return fetchApi('/api/paprika/groceries');
}

export async function getPaprikaMeals(): Promise<{ meals: PaprikaMeal[] }> {
  return fetchApi('/api/paprika/meals');
}

export async function refreshPaprika(): Promise<{ ok: boolean; cleared: number }> {
  return fetchApi('/api/paprika/refresh', { method: 'POST' });
}
