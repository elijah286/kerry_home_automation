import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { authenticate } from '../auth/jwt.js';
import { redisStore } from '../state/redis-store.js';

const PAPRIKA_BASE = 'https://www.paprikaapp.com/api/v1/sync';
const CACHE_PREFIX = 'paprika:';
const CACHE_TTL = {
  recipes_list: 300,   // 5 min
  recipe_detail: 600,  // 10 min
  categories: 3600,    // 1 hr
  groceries: 120,      // 2 min (changes more often)
  meals: 300,          // 5 min
};

function authHeader(): string {
  const { email, password } = config.paprika;
  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
}

async function paprikaFetch<T>(path: string): Promise<T> {
  const url = `${PAPRIKA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader() },
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
  const redis = redisStore.getClient();
  const cached = await redis.get(`${CACHE_PREFIX}${cacheKey}`);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const data = await fetcher();
  await redis.set(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(data), 'EX', ttl);
  return data;
}

export interface PaprikaRecipeStub {
  uid: string;
  hash: string;
}

export interface PaprikaRecipe {
  uid: string;
  name: string;
  ingredients: string;
  directions: string;
  description: string;
  notes: string;
  nutritional_info: string;
  servings: string;
  difficulty: string;
  prep_time: string;
  cook_time: string;
  total_time: string;
  source: string;
  source_url: string;
  image_url: string;
  photo: string | null;
  photo_hash: string | null;
  photo_large: string | null;
  scale: string | null;
  hash: string;
  categories: string[];
  rating: number;
  in_trash: boolean;
  is_pinned: boolean;
  on_favorites: boolean;
  on_grocery_list: boolean;
  created: string;
}

export interface PaprikaCategory {
  uid: string;
  order_flag: number;
  name: string;
  parent_uid: string | null;
}

export interface PaprikaGroceryItem {
  uid: string;
  recipe_uid: string | null;
  name: string;
  order_flag: number;
  purchased: boolean;
  aisle: string;
  ingredient: string;
  recipe: string;
  instruction: string;
  quantity: string;
  separate: boolean;
  aisle_uid: string;
  list_uid: string;
}

export interface PaprikaMeal {
  uid: string;
  recipe_uid: string | null;
  date: string;
  type: number;
  name: string;
  order_flag: number;
  type_uid: string;
  scale: string | null;
  is_ingredient: boolean;
}

export async function registerPaprikaRoutes(app: FastifyInstance): Promise<void> {
  if (!config.paprika.email || !config.paprika.password) {
    logger.warn('Paprika credentials not configured — skipping recipe routes');
    return;
  }

  // List all recipe stubs (uid + hash only)
  app.get('/api/paprika/recipes', { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      const stubs = await cachedFetch<PaprikaRecipeStub[]>(
        'recipes',
        CACHE_TTL.recipes_list,
        () => paprikaFetch('/recipes/'),
      );
      return { recipes: stubs, count: stubs.length };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika recipes');
      return reply.status(502).send({ error: 'Failed to fetch recipes from Paprika' });
    }
  });

  // Full recipe list with details (fetches all individually, heavily cached)
  app.get('/api/paprika/recipes/full', { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      const stubs = await cachedFetch<PaprikaRecipeStub[]>(
        'recipes',
        CACHE_TTL.recipes_list,
        () => paprikaFetch('/recipes/'),
      );

      const recipes = await Promise.all(
        stubs
          .filter((s) => s.uid && s.hash)
          .map((stub) =>
            cachedFetch<PaprikaRecipe>(
              `recipe:${stub.uid}`,
              CACHE_TTL.recipe_detail,
              () => paprikaFetch(`/recipe/${stub.uid}/`),
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

  // Single recipe detail
  app.get<{ Params: { uid: string } }>(
    '/api/paprika/recipes/:uid',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const recipe = await cachedFetch<PaprikaRecipe>(
          `recipe:${req.params.uid}`,
          CACHE_TTL.recipe_detail,
          () => paprikaFetch(`/recipe/${req.params.uid}/`),
        );
        return { recipe };
      } catch (err) {
        logger.error({ err, uid: req.params.uid }, 'Failed to fetch Paprika recipe');
        return reply.status(502).send({ error: 'Failed to fetch recipe from Paprika' });
      }
    },
  );

  // Categories
  app.get('/api/paprika/categories', { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      const categories = await cachedFetch<PaprikaCategory[]>(
        'categories',
        CACHE_TTL.categories,
        () => paprikaFetch('/categories/'),
      );
      return { categories };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika categories');
      return reply.status(502).send({ error: 'Failed to fetch categories from Paprika' });
    }
  });

  // Grocery list
  app.get('/api/paprika/groceries', { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      const groceries = await cachedFetch<PaprikaGroceryItem[]>(
        'groceries',
        CACHE_TTL.groceries,
        () => paprikaFetch('/groceries/'),
      );
      return { groceries };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika groceries');
      return reply.status(502).send({ error: 'Failed to fetch groceries from Paprika' });
    }
  });

  // Meal plan
  app.get('/api/paprika/meals', { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      const meals = await cachedFetch<PaprikaMeal[]>(
        'meals',
        CACHE_TTL.meals,
        () => paprikaFetch('/meals/'),
      );
      return { meals };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Paprika meals');
      return reply.status(502).send({ error: 'Failed to fetch meals from Paprika' });
    }
  });

  // Bust cache (useful after making changes in Paprika app)
  app.post('/api/paprika/refresh', { preHandler: [authenticate] }, async () => {
    const redis = redisStore.getClient();
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return { ok: true, cleared: keys.length };
  });

  logger.info('Paprika recipe routes registered');
}
