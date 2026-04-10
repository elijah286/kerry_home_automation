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
import { appConfig } from '../config.js';
import { logger } from '../logger.js';
import { redis } from '../state/redis.js';

const PAPRIKA_BASE = 'https://www.paprikaapp.com/api/v1/sync';
const CACHE_PREFIX = 'paprika:';
const CACHE_TTL = {
  recipes_list: 300,
  recipe_detail: 600,
  categories: 3600,
  groceries: 120,
  meals: 300,
};

async function getCredentials(): Promise<{ email: string; password: string } | null> {
  // Database config takes priority, then env vars
  const { getConfig } = await import('../db/integration-config-store.js');
  const config = await getConfig('paprika');
  if (config?.email && config?.password) {
    return { email: config.email, password: config.password };
  }
  if (appConfig.paprika.email && appConfig.paprika.password) {
    return { email: appConfig.paprika.email, password: appConfig.paprika.password };
  }
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

  app.get('/api/paprika/recipes', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const stubs = await cachedFetch<PaprikaRecipeStub[]>(
        'recipes', CACHE_TTL.recipes_list, () => paprikaFetch('/recipes/'),
      );
      return { recipes: stubs, count: stubs.length };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika recipes');
      return reply.status(502).send({ error: 'Failed to fetch recipes from Paprika' });
    }
  });

  app.get('/api/paprika/recipes/full', async (_req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const stubs = await cachedFetch<PaprikaRecipeStub[]>(
        'recipes', CACHE_TTL.recipes_list, () => paprikaFetch('/recipes/'),
      );
      const recipes = await Promise.all(
        stubs.filter((s) => s.uid && s.hash).map((stub) =>
          cachedFetch<PaprikaRecipe>(
            `recipe:${stub.uid}`, CACHE_TTL.recipe_detail, () => paprikaFetch(`/recipe/${stub.uid}/`),
          ),
        ),
      );
      const visible = recipes.filter((r) => !r.in_trash);
      return { recipes: visible, count: visible.length };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch full Paprika recipe list');
      return reply.status(502).send({ error: 'Failed to fetch recipes from Paprika' });
    }
  });

  app.get<{ Params: { uid: string } }>('/api/paprika/recipes/:uid', async (req, reply) => {
    if (!(await guardConfigured(reply))) return;
    try {
      const recipe = await cachedFetch<PaprikaRecipe>(
        `recipe:${req.params.uid}`, CACHE_TTL.recipe_detail, () => paprikaFetch(`/recipe/${req.params.uid}/`),
      );
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

  app.post('/api/paprika/refresh', async () => {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
    return { ok: true, cleared: keys.length };
  });

  logger.info('Paprika recipe routes registered');
}
