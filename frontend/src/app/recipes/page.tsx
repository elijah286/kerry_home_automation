"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  ChefHat,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShoppingCart,
  Star,
  UtensilsCrossed,
  X,
  Check,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  fetchPaprikaRecipes,
  fetchPaprikaCategories,
  fetchPaprikaGroceries,
  fetchPaprikaMeals,
  fetchPaprikaRecipe,
  refreshPaprikaCache,
} from "@/lib/api";
import type {
  PaprikaRecipe,
  PaprikaCategory,
  PaprikaGroceryItem,
  PaprikaMeal,
} from "@/types";

type Tab = "recipes" | "meals" | "groceries";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "recipes", label: "Recipes", icon: BookOpen },
  { id: "meals", label: "Meal Plan", icon: Calendar },
  { id: "groceries", label: "Grocery List", icon: ShoppingCart },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-3",
            i <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-zinc-700",
          )}
        />
      ))}
    </div>
  );
}

function RecipeCard({
  recipe,
  categoryMap,
  onClick,
}: {
  recipe: PaprikaRecipe;
  categoryMap: Map<string, string>;
  onClick: () => void;
}) {
  const cats = recipe.categories
    .map((uid) => categoryMap.get(uid))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Card hoverable onClick={onClick} className="cursor-pointer group">
      <div className="flex gap-3">
        {recipe.image_url ? (
          <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-white/5">
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white/5">
            <UtensilsCrossed className="size-8 text-zinc-700" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {recipe.name}
          </p>
          {recipe.rating > 0 && (
            <div className="mt-1">
              <Stars rating={recipe.rating} />
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cats.map((cat) => (
              <Badge key={cat} variant="default" size="sm">
                {cat}
              </Badge>
            ))}
          </div>
          {(recipe.total_time || recipe.cook_time) && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3" />
              <span>{recipe.total_time || recipe.cook_time}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RecipeDetail({
  recipe,
  categoryMap,
  onClose,
}: {
  recipe: PaprikaRecipe;
  categoryMap: Map<string, string>;
  onClose: () => void;
}) {
  const cats = recipe.categories
    .map((uid) => categoryMap.get(uid))
    .filter(Boolean);

  const ingredients = recipe.ingredients
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const directions = recipe.directions
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-8 pb-20"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header image */}
        {recipe.image_url && (
          <div className="relative h-48 overflow-hidden rounded-t-2xl">
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="size-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).parentElement!.style.display =
                  "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent" />
          </div>
        )}

        <div className="p-5">
          {/* Close button & title */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {recipe.name}
              </h2>
              {recipe.rating > 0 && (
                <div className="mt-1">
                  <Stars rating={recipe.rating} />
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted hover:bg-white/10 hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Meta badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {cats.map((cat) => (
              <Badge key={cat} variant="info" size="sm">
                {cat}
              </Badge>
            ))}
            {recipe.total_time && (
              <Badge variant="default" size="sm">
                <Clock className="mr-1 size-3" />
                {recipe.total_time}
              </Badge>
            )}
            {recipe.prep_time && (
              <Badge variant="default" size="sm">
                Prep: {recipe.prep_time}
              </Badge>
            )}
            {recipe.cook_time && (
              <Badge variant="default" size="sm">
                Cook: {recipe.cook_time}
              </Badge>
            )}
            {recipe.servings && (
              <Badge variant="default" size="sm">
                Serves: {recipe.servings}
              </Badge>
            )}
            {recipe.on_favorites && (
              <Badge variant="warning" size="sm">
                Favorite
              </Badge>
            )}
          </div>

          {recipe.description && (
            <p className="text-sm text-muted mb-4">{recipe.description}</p>
          )}

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Ingredients
              </h3>
              <ul className="space-y-1.5">
                {ingredients.map((ing, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-zinc-300"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent/60" />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Directions */}
          {directions.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Directions
              </h3>
              <ol className="space-y-3">
                {directions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-zinc-300">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Notes */}
          {recipe.notes && (
            <div className="mb-5 rounded-xl bg-white/[0.03] border border-border p-3">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Notes
              </h3>
              <p className="text-sm text-muted whitespace-pre-line">
                {recipe.notes}
              </p>
            </div>
          )}

          {/* Source link */}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <ExternalLink className="size-3" />
              {recipe.source || "View Source"}
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function MealPlanSection({ meals, onRecipeClick }: { meals: PaprikaMeal[]; onRecipeClick: (uid: string) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, PaprikaMeal[]>();
    for (const meal of meals) {
      const dateKey = meal.date.split(" ")[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(meal);
    }
    const sorted = [...map.entries()].sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
    return sorted;
  }, [meals]);

  if (meals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <Calendar className="size-12 mb-3 text-zinc-700" />
        <p className="text-sm">No meals planned</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round(
      (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-4">
      {grouped.map(([date, dayMeals]) => (
        <Card key={date}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="size-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">
              {formatDate(date)}
            </h3>
            <Badge variant="default" size="sm">
              {dayMeals.length} {dayMeals.length === 1 ? "meal" : "meals"}
            </Badge>
          </div>
          <div className="space-y-2">
            {dayMeals
              .sort((a, b) => a.order_flag - b.order_flag)
              .map((meal) => (
                <button
                  key={meal.uid}
                  onClick={() => meal.recipe_uid && onRecipeClick(meal.recipe_uid)}
                  disabled={!meal.recipe_uid}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    meal.recipe_uid
                      ? "hover:bg-white/5 cursor-pointer"
                      : "cursor-default",
                  )}
                >
                  <ChefHat className="size-4 shrink-0 text-zinc-600" />
                  <span className="text-sm text-foreground truncate">
                    {meal.name}
                  </span>
                </button>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function GrocerySection({ groceries }: { groceries: PaprikaGroceryItem[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, PaprikaGroceryItem[]>();
    for (const item of groceries) {
      const aisle = item.aisle || "Uncategorized";
      if (!map.has(aisle)) map.set(aisle, []);
      map.get(aisle)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [groceries]);

  if (groceries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <ShoppingCart className="size-12 mb-3 text-zinc-700" />
        <p className="text-sm">Grocery list is empty</p>
      </div>
    );
  }

  const unpurchased = groceries.filter((g) => !g.purchased).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="info" size="sm">
          {unpurchased} remaining
        </Badge>
        <Badge variant="success" size="sm">
          {groceries.length - unpurchased} purchased
        </Badge>
      </div>
      {grouped.map(([aisle, items]) => (
        <Card key={aisle}>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="size-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">{aisle}</h3>
            <Badge variant="default" size="sm">
              {items.length}
            </Badge>
          </div>
          <div className="space-y-1">
            {items
              .sort((a, b) => a.order_flag - b.order_flag)
              .map((item) => (
                <div
                  key={item.uid}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2",
                    item.purchased && "opacity-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      item.purchased
                        ? "border-emerald-500/40 bg-emerald-500/15"
                        : "border-zinc-700 bg-transparent",
                    )}
                  >
                    {item.purchased && (
                      <Check className="size-3 text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        item.purchased
                          ? "text-muted line-through"
                          : "text-foreground",
                      )}
                    >
                      {item.name}
                    </p>
                    {item.recipe && (
                      <p className="text-xs text-muted truncate">
                        {item.recipe}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function RecipesPage() {
  const [tab, setTab] = useState<Tab>("recipes");
  const [recipes, setRecipes] = useState<PaprikaRecipe[]>([]);
  const [categories, setCategories] = useState<PaprikaCategory[]>([]);
  const [groceries, setGroceries] = useState<PaprikaGroceryItem[]>([]);
  const [meals, setMeals] = useState<PaprikaMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<PaprikaRecipe | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [recipesRes, catsRes, groceriesRes, mealsRes] = await Promise.all([
        fetchPaprikaRecipes(),
        fetchPaprikaCategories(),
        fetchPaprikaGroceries(),
        fetchPaprikaMeals(),
      ]);
      setRecipes(recipesRes.recipes);
      setCategories(catsRes.categories);
      setGroceries(groceriesRes.groceries);
      setMeals(mealsRes.meals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshPaprikaCache();
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleMealRecipeClick = useCallback(
    async (uid: string) => {
      const cached = recipes.find((r) => r.uid === uid);
      if (cached) {
        setSelectedRecipe(cached);
        return;
      }
      try {
        const { recipe } = await fetchPaprikaRecipe(uid);
        setSelectedRecipe(recipe);
      } catch {
        // ignore - recipe may have been deleted
      }
    },
    [recipes],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of categories) {
      m.set(cat.uid, cat.name);
    }
    return m;
  }, [categories]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const uid of r.categories) {
        counts.set(uid, (counts.get(uid) || 0) + 1);
      }
    }
    return categories
      .filter((c) => (counts.get(c.uid) || 0) > 0)
      .sort((a, b) => (counts.get(b.uid) || 0) - (counts.get(a.uid) || 0))
      .slice(0, 20);
  }, [categories, recipes]);

  const filteredRecipes = useMemo(() => {
    let list = recipes;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.ingredients.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      );
    }
    if (selectedCategory) {
      list = list.filter((r) => r.categories.includes(selectedCategory));
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [recipes, search, selectedCategory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading recipes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        <Card className="flex flex-col items-center py-12">
          <UtensilsCrossed className="size-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load recipes
          </p>
          <p className="text-xs text-muted mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadData();
            }}
            className="rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 transition-colors"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15">
            <ChefHat className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Recipes</h1>
            <p className="text-sm text-muted">
              {recipes.length} recipes from Paprika
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-muted hover:bg-white/10 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
          />
          Sync
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 border border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              tab === id
                ? "bg-accent/15 text-accent shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{label}</span>
            {id === "groceries" && groceries.filter((g) => !g.purchased).length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                {groceries.filter((g) => !g.purchased).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "recipes" && (
        <>
          {/* Search & filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search recipes, ingredients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-zinc-600 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm transition-colors",
                showFilters || selectedCategory
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-white/[0.03] text-muted hover:text-foreground",
              )}
            >
              <Filter className="size-4" />
              <span className="hidden sm:inline">Filter</span>
            </button>
          </div>

          {/* Category pills */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pb-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      !selectedCategory
                        ? "bg-accent/20 text-accent"
                        : "bg-white/5 text-muted hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                  {topCategories.map((cat) => (
                    <button
                      key={cat.uid}
                      onClick={() =>
                        setSelectedCategory(
                          selectedCategory === cat.uid ? null : cat.uid,
                        )
                      }
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedCategory === cat.uid
                          ? "bg-accent/20 text-accent"
                          : "bg-white/5 text-muted hover:text-foreground",
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results count */}
          {(search || selectedCategory) && (
            <p className="text-xs text-muted">
              {filteredRecipes.length} result{filteredRecipes.length !== 1 ? "s" : ""}
              {selectedCategory && categoryMap.get(selectedCategory) && (
                <> in <span className="text-accent">{categoryMap.get(selectedCategory)}</span></>
              )}
            </p>
          )}

          {/* Recipe grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.uid}
                recipe={recipe}
                categoryMap={categoryMap}
                onClick={() => setSelectedRecipe(recipe)}
              />
            ))}
          </div>

          {filteredRecipes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Search className="size-12 mb-3 text-zinc-700" />
              <p className="text-sm">No recipes found</p>
            </div>
          )}
        </>
      )}

      {tab === "meals" && (
        <MealPlanSection meals={meals} onRecipeClick={handleMealRecipeClick} />
      )}

      {tab === "groceries" && <GrocerySection groceries={groceries} />}

      {/* Recipe detail modal */}
      <AnimatePresence>
        {selectedRecipe && (
          <RecipeDetail
            recipe={selectedRecipe}
            categoryMap={categoryMap}
            onClose={() => setSelectedRecipe(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
