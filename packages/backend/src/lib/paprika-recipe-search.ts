// ---------------------------------------------------------------------------
// Load Paprika recipes from Redis (same store as paprika-routes) + text search
// ---------------------------------------------------------------------------

import type { IntegrationId, PaprikaRecipe, PaprikaMeal } from '@ha/shared';
import { redis } from '../state/redis.js';
import * as entryStore from '../db/integration-entry-store.js';

/** Must match `RECIPE_STORE_KEY` in api/paprika-routes.ts */
const RECIPE_STORE_KEY = 'paprika:store:recipes';
/** Must match the meals cache key in api/paprika-routes.ts */
const MEALS_CACHE_KEY = 'paprika:meals';

/**
 * Read the currently-cached Paprika meal plan from Redis.
 * Returns [] if no cache entry (will be populated next time the UI loads meals).
 */
export async function getPaprikaMealsFromStore(): Promise<PaprikaMeal[]> {
  const cached = await redis.get(MEALS_CACHE_KEY);
  if (!cached) return [];
  try {
    return JSON.parse(cached) as PaprikaMeal[];
  } catch {
    return [];
  }
}

export async function isPaprikaConfigured(): Promise<boolean> {
  const entries = await entryStore.getEntries('paprika' as IntegrationId);
  return entries.some((e) => e.enabled && Boolean(e.config.email) && Boolean(e.config.password));
}

/** All non-trashed recipes from the local Redis cache (may be empty until first sync). */
export async function getPaprikaRecipesFromStore(): Promise<PaprikaRecipe[]> {
  const allEntries = await redis.hvals(RECIPE_STORE_KEY);
  const recipes: PaprikaRecipe[] = [];
  for (const json of allEntries) {
    try {
      const r = JSON.parse(json) as PaprikaRecipe;
      if (r && !r.in_trash) recipes.push(r);
    } catch {
      /* skip corrupt */
    }
  }
  return recipes;
}

export interface RecipeSearchHit {
  uid: string;
  name: string;
  total_time?: string;
  source?: string;
  rating?: number;
  /** Relative score for ordering (higher = better match) */
  score: number;
}

function tokenizeQuery(q: string): string[] {
  const parts = q
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+/gu, '').replace(/[^\p{L}\p{N}]+$/gu, ''))
    .filter((t) => t.length >= 2);
  return [...new Set(parts)];
}

function haystack(r: PaprikaRecipe): string {
  return [
    r.name,
    r.ingredients,
    r.directions,
    r.description,
    r.notes,
    r.source,
    r.nutritional_info,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/**
 * Search cached Paprika recipes. Default: every token must appear (AND). Optional OR mode.
 */
export function searchPaprikaRecipes(
  recipes: PaprikaRecipe[],
  query: string,
  opts?: { maxResults?: number; matchAllTerms?: boolean },
): RecipeSearchHit[] {
  const maxResults = Math.min(Math.max(opts?.maxResults ?? 20, 1), 40);
  const matchAllTerms = opts?.matchAllTerms !== false;
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const rows: RecipeSearchHit[] = [];

  for (const r of recipes) {
    const h = haystack(r);
    const nameLower = r.name.toLowerCase();
    const ingLower = r.ingredients.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const t of tokens) {
      if (!h.includes(t)) continue;
      matched++;
      if (nameLower.includes(t)) score += 4;
      else if (ingLower.includes(t)) score += 2;
      else score += 1;
    }
    const ok = matchAllTerms ? matched === tokens.length : matched > 0;
    if (!ok) continue;
    rows.push({
      uid: r.uid,
      name: r.name,
      total_time: r.total_time || undefined,
      source: r.source || undefined,
      rating: r.rating > 0 ? r.rating : undefined,
      score,
    });
  }

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows.slice(0, maxResults);
}
