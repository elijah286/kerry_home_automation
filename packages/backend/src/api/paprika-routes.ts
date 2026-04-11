// ---------------------------------------------------------------------------
// Paprika 3 recipe API proxy with Redis caching
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  PaprikaRecipeStub,
  PaprikaRecipe,
  PaprikaCategory,
  PaprikaGroceryItem,
  PaprikaMeal,
} from '@ha/shared';
import { logger } from '../logger.js';
import { redis } from '../state/redis.js';
import * as entryStore from '../db/integration-entry-store.js';

const PAPRIKA_BASE = 'https://www.paprikaapp.com/api/v1/sync';
const CACHE_PREFIX = 'paprika:';
// Persistent keys (no TTL) – recipes are stored permanently and diff-synced
const RECIPE_STORE_KEY = `${CACHE_PREFIX}store:recipes`;      // Hash: uid → JSON recipe
const RECIPE_HASH_KEY  = `${CACHE_PREFIX}store:recipe_hashes`; // Hash: uid → hash string
const CACHE_TTL = {
  groceries: 300,         // 5m – changes often
  meals: 600,             // 10m
  categories: 3600,       // 1h
};

async function getCredentials(): Promise<{ email: string; password: string } | null> {
  const entries = await entryStore.getEntries('paprika');
  const first = entries.find((e) => e.enabled && e.config.email && e.config.password);
  if (first) return { email: first.config.email, password: first.config.password };
  return null;
}

function authHeaderFrom(creds: { email: string; password: string }): string {
  return `Basic ${Buffer.from(`${creds.email}:${creds.password}`).toString('base64')}`;
}

async function paprikaFetch<T>(path: string): Promise<T> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Paprika not configured');
  const url = `${PAPRIKA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeaderFrom(creds) },
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body, path }, 'Paprika API error');
    throw new Error(`Paprika API ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

async function cachedFetch<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(`${CACHE_PREFIX}${cacheKey}`);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const data = await fetcher();
  await redis.set(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(data), 'EX', ttl);
  return data;
}

async function guardConfigured(reply: FastifyReply): Promise<boolean> {
  const creds = await getCredentials();
  if (!creds) {
    void reply.status(503).send({ error: 'Paprika not configured. Enter credentials in Integrations settings.' });
    return false;
  }
  return true;
}

export async function registerPaprikaRoutes(app: FastifyInstance): Promise<void> {

  // ---------------------------------------------------------------------------
  // Diff-sync: fetch stub list, compare hashes, only pull changed recipes
  // ---------------------------------------------------------------------------
  async function syncRecipes(): Promise<{ added: number; updated: number; removed: number }> {
    const stubs = await paprikaFetch<PaprikaRecipeStub[]>('/recipes/');
    const valid = stubs.filter((s) => s.uid && s.hash);

    // Current stored hashes
    const storedHashes = await redis.hgetall(RECIPE_HASH_KEY); // uid → hash

    // Determine what changed
    const remoteUids = new Set(valid.map((s) => s.uid));
    const toFetch: PaprikaRecipeStub[] = [];
    for (const stub of valid) {
      if (storedHashes[stub.uid] !== stub.hash) {
        toFetch.push(stub);
      }
    }
    const toRemove = Object.keys(storedHashes).filter((uid) => !remoteUids.has(uid));

    // Fetch new/changed recipes in batches of 50
    let added = 0;
    let updated = 0;
    for (let i = 0; i < toFetch.length; i += 50) {
      const batch = toFetch.slice(i, i + 50);
      const results = await Promise.all(
        batch.map((stub) =>
          paprikaFetch<PaprikaRecipe>(`/recipe/${stub.uid}/`).catch(() => null),
        ),
      );
      const pipeline = redis.pipeline();
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const stub = batch[j];
        if (!r) continue;
        if (storedHashes[stub.uid]) updated++; else added++;
        pipeline.hset(RECIPE_STORE_KEY, stub.uid, JSON.stringify(r));
        pipeline.hset(RECIPE_HASH_KEY, stub.uid, stub.hash);
      }
      await pipeline.exec();
    }

    // Remove deleted recipes
    if (toRemove.length > 0) {
      await redis.hdel(RECIPE_STORE_KEY, ...toRemove);
      await redis.hdel(RECIPE_HASH_KEY, ...toRemove);
    }

    await redis.set(`${CACHE_PREFIX}last_sync`, Date.now().toString());
    logger.info({ added, updated, removed: toRemove.length, total: valid.length }, 'Paprika recipe sync complete');
    return { added, updated, removed: toRemove.length };
  }

  // Prevent concurrent syncs
  let syncInProgress: Promise<{ added: number; updated: number; removed: number }> | null = null;

  app.get('/api/paprika/recipes/full', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      // Check if we have a local store
      const storeSize = await redis.hlen(RECIPE_STORE_KEY);

      if (storeSize === 0) {
        // First load — must do a full sync (blocking)
        await syncRecipes();
      } else {
        // Have cached data — trigger background diff-sync if not already running
        if (!syncInProgress) {
          syncInProgress = syncRecipes().finally(() => { syncInProgress = null; });
        }
      }

      // Return all stored recipes (excluding trashed)
      const allEntries = await redis.hvals(RECIPE_STORE_KEY);
      const recipes: PaprikaRecipe[] = [];
      for (const json of allEntries) {
        const r = JSON.parse(json) as PaprikaRecipe;
        if (!r.in_trash) recipes.push(r);
      }
      return { recipes, count: recipes.length };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch full Paprika recipe list');
      return reply.status(502).send({ error: 'Failed to fetch recipes from Paprika' });
    }
  });

  app.get<{ Params: { uid: string } }>('/api/paprika/recipes/:uid', async (req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const cached = await redis.hget(RECIPE_STORE_KEY, req.params.uid);
      if (cached) return { recipe: JSON.parse(cached) as PaprikaRecipe };
      // Fallback: fetch directly
      const recipe = await paprikaFetch<PaprikaRecipe>(`/recipe/${req.params.uid}/`);
      await redis.hset(RECIPE_STORE_KEY, req.params.uid, JSON.stringify(recipe));
      return { recipe };
    } catch (err) {
      logger.error({ err, uid: req.params.uid }, 'Failed to fetch Paprika recipe');
      return reply.status(502).send({ error: 'Failed to fetch recipe from Paprika' });
    }
  });

  app.get('/api/paprika/categories', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const categories = await cachedFetch<PaprikaCategory[]>(
        'categories', CACHE_TTL.categories, () => paprikaFetch('/categories/'),
      );
      return { categories };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika categories');
      return reply.status(502).send({ error: 'Failed to fetch categories from Paprika' });
    }
  });

  app.get('/api/paprika/groceries', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const groceries = await cachedFetch<PaprikaGroceryItem[]>(
        'groceries', CACHE_TTL.groceries, () => paprikaFetch('/groceries/'),
      );
      return { groceries };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika groceries');
      return reply.status(502).send({ error: 'Failed to fetch groceries from Paprika' });
    }
  });

  app.get('/api/paprika/meals', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const meals = await cachedFetch<PaprikaMeal[]>(
        'meals', CACHE_TTL.meals, () => paprikaFetch('/meals/'),
      );
      return { meals };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika meals');
      return reply.status(502).send({ error: 'Failed to fetch meals from Paprika' });
    }
  });

  app.get('/api/paprika/status', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const recipeCount = await redis.hlen(RECIPE_STORE_KEY);
      const lastSync = await redis.get(`${CACHE_PREFIX}last_sync`);
      return { recipeCount, lastSync: lastSync ? parseInt(lastSync, 10) : null };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika status');
      return reply.status(502).send({ error: 'Failed to fetch Paprika status' });
    }
  });

  app.get<{ Params: { uid: string } }>('/api/paprika/recipes/:uid/photo', async (req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const creds = await getCredentials();
      if (!creds) return reply.status(503).send({ error: 'Not configured' });
      const url = `${PAPRIKA_BASE}/recipe/${req.params.uid}/photo/`;
      const res = await fetch(url, {
        headers: { Authorization: authHeaderFrom(creds) },
      });
      if (!res.ok) return reply.status(res.status).send({ error: 'Photo not found' });
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      void reply.header('Content-Type', contentType);
      void reply.header('Cache-Control', 'public, max-age=86400');
      const buffer = Buffer.from(await res.arrayBuffer());
      return reply.send(buffer);
    } catch (err) {
      logger.error({ err, uid: req.params.uid }, 'Failed to fetch Paprika photo');
      return reply.status(502).send({ error: 'Failed to fetch photo' });
    }
  });

  app.post('/api/paprika/refresh', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      // Clear volatile caches (groceries, meals, categories)
      const volKeys = await redis.keys(`${CACHE_PREFIX}groceries*`);
      const mealKeys = await redis.keys(`${CACHE_PREFIX}meals*`);
      const catKeys = await redis.keys(`${CACHE_PREFIX}categories*`);
      const toClear = [...volKeys, ...mealKeys, ...catKeys];
      if (toClear.length > 0) await redis.del(...toClear);
      // Run a blocking diff-sync for recipes
      const result = await syncRecipes();
      return { ok: true, ...result };
    } catch (err) {
      logger.error({ err }, 'Failed to refresh Paprika data');
      return reply.status(502).send({ error: 'Failed to refresh from Paprika' });
    }
  });

  logger.info('Paprika recipe routes registered');
}
