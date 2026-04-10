'use client';

import { useState, useEffect, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  CookingPot,
  Search,
  RefreshCw,
  X,
  Star,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  getPaprikaRecipesFull,
  getPaprikaCategories,
  getPaprikaGroceries,
  getPaprikaMeals,
  refreshPaprika,
} from '@/lib/api';
import type { PaprikaRecipe, PaprikaCategory, PaprikaGroceryItem, PaprikaMeal } from '@ha/shared';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-3 w-3"
          style={{
            color: i <= rating ? 'var(--color-warning)' : 'var(--color-text-muted)',
            fill: i <= rating ? 'var(--color-warning)' : 'none',
          }}
        />
      ))}
    </span>
  );
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<PaprikaRecipe[]>([]);
  const [categories, setCategories] = useState<PaprikaCategory[]>([]);
  const [groceries, setGroceries] = useState<PaprikaGroceryItem[]>([]);
  const [meals, setMeals] = useState<PaprikaMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<PaprikaRecipe | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recipeRes, catRes, grocRes, mealRes] = await Promise.all([
        getPaprikaRecipesFull(),
        getPaprikaCategories(),
        getPaprikaGroceries(),
        getPaprikaMeals(),
      ]);
      setRecipes(recipeRes.recipes);
      setCategories(catRes.categories);
      setGroceries(grocRes.groceries);
      setMeals(mealRes.meals);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshPaprika();
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.ingredients.toLowerCase().includes(q) && !r.source.toLowerCase().includes(q)) return false;
      }
      if (selectedCategory && !r.categories.includes(selectedCategory)) return false;
      return true;
    });
  }, [recipes, search, selectedCategory]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const c of r.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name]) => name);
  }, [recipes]);

  const mealsByDate = useMemo(() => {
    const grouped = new Map<string, PaprikaMeal[]>();
    for (const m of meals) {
      const list = grouped.get(m.date) ?? [];
      list.push(m);
      grouped.set(m.date, list);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [meals]);

  const groceriesByAisle = useMemo(() => {
    const grouped = new Map<string, PaprikaGroceryItem[]>();
    for (const g of groceries) {
      const aisle = g.aisle || 'Uncategorized';
      const list = grouped.get(aisle) ?? [];
      list.push(g);
      grouped.set(aisle, list);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [groceries]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 lg:p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading recipes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-3">
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>Failed to load recipes: {error}</p>
        <button onClick={loadData} className="rounded-md px-3 py-1.5 text-sm" style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
            <CookingPot className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Recipes</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{recipes.length} recipes</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      <Tabs.Root defaultValue="recipes">
        <Tabs.List className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
          {['recipes', 'meal-plan', 'grocery-list'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors data-[state=active]:border-[var(--color-accent)] data-[state=active]:text-[var(--color-accent)] data-[state=inactive]:border-transparent"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {tab === 'recipes' ? 'Recipes' : tab === 'meal-plan' ? 'Meal Plan' : 'Grocery List'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Recipes Tab */}
        <Tabs.Content value="recipes" className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2 h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border pl-8 pr-3 py-1.5 text-sm"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="">All categories</option>
              {topCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRecipes.map((r) => (
              <Card key={r.uid} className="cursor-pointer overflow-hidden !p-0" onClick={() => setSelectedRecipe(r)}>
                {r.image_url && (
                  <img
                    src={r.image_url}
                    alt={r.name}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="p-3 space-y-1.5">
                  <h3 className="text-sm font-medium line-clamp-2">{r.name}</h3>
                  <div className="flex items-center gap-2">
                    {r.rating > 0 && <Stars rating={r.rating} />}
                    {r.total_time && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <Clock className="h-3 w-3" /> {r.total_time}
                      </span>
                    )}
                  </div>
                  {r.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.categories.slice(0, 3).map((c) => (
                        <Badge key={c} className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {filteredRecipes.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
              No recipes match your search
            </p>
          )}
        </Tabs.Content>

        {/* Meal Plan Tab */}
        <Tabs.Content value="meal-plan" className="pt-4 space-y-4">
          {mealsByDate.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No meals planned</p>
          ) : (
            mealsByDate.map(([date, dayMeals]) => (
              <div key={date}>
                <h3 className="text-sm font-medium mb-2">{relativeDate(date)}</h3>
                <div className="space-y-1">
                  {dayMeals.map((m) => (
                    <Card key={m.uid} className="!py-2 !px-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{m.name}</span>
                        <Badge className="text-[10px]">
                          {m.type === 0 ? 'Breakfast' : m.type === 1 ? 'Lunch' : m.type === 2 ? 'Dinner' : 'Snack'}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </Tabs.Content>

        {/* Grocery List Tab */}
        <Tabs.Content value="grocery-list" className="pt-4 space-y-4">
          {groceriesByAisle.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Grocery list is empty</p>
          ) : (
            groceriesByAisle.map(([aisle, items]) => (
              <div key={aisle}>
                <h3 className="text-sm font-medium mb-2">{aisle}</h3>
                <div className="space-y-0.5">
                  {items.map((g) => (
                    <div key={g.uid} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                      <input type="checkbox" checked={g.purchased} readOnly className="h-3.5 w-3.5" />
                      <span className={g.purchased ? 'line-through' : ''} style={{ color: g.purchased ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                        {g.name}
                        {g.quantity && <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>({g.quantity})</span>}
                      </span>
                      {g.recipe && (
                        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>{g.recipe}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </Tabs.Content>
      </Tabs.Root>

      {/* Recipe detail modal */}
      <Dialog.Root open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border shadow-xl"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
          >
            {selectedRecipe && (
              <>
                {selectedRecipe.image_url && (
                  <img src={selectedRecipe.image_url} alt={selectedRecipe.name} className="h-48 w-full object-cover rounded-t-xl" />
                )}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedRecipe.name}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        {selectedRecipe.rating > 0 && <Stars rating={selectedRecipe.rating} />}
                        {selectedRecipe.total_time && (
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock className="h-3 w-3" /> {selectedRecipe.total_time}
                          </span>
                        )}
                        {selectedRecipe.servings && (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Serves {selectedRecipe.servings}
                          </span>
                        )}
                      </div>
                    </div>
                    <Dialog.Close asChild>
                      <button className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]">
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>

                  {selectedRecipe.description && (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{selectedRecipe.description}</p>
                  )}

                  {selectedRecipe.ingredients && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Ingredients</h3>
                      <div className="text-sm whitespace-pre-line" style={{ color: 'var(--color-text-secondary)' }}>
                        {selectedRecipe.ingredients}
                      </div>
                    </div>
                  )}

                  {selectedRecipe.directions && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Directions</h3>
                      <div className="text-sm whitespace-pre-line" style={{ color: 'var(--color-text-secondary)' }}>
                        {selectedRecipe.directions}
                      </div>
                    </div>
                  )}

                  {selectedRecipe.notes && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Notes</h3>
                      <div className="text-sm whitespace-pre-line" style={{ color: 'var(--color-text-secondary)' }}>
                        {selectedRecipe.notes}
                      </div>
                    </div>
                  )}

                  {selectedRecipe.source && (
                    <div className="text-xs pt-2 border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Source: {selectedRecipe.source_url ? (
                        <a href={selectedRecipe.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                          {selectedRecipe.source}
                        </a>
                      ) : selectedRecipe.source}
                    </div>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
