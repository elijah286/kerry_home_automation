'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  CookingPot,
  Search,
  RefreshCw,
  Star,
  Clock,
  Loader2,
  Timer,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useAssistant } from '@/components/ChatBot';
import { useLCARSFrame } from '@/components/lcars/LCARSFrameContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSystemTerminalBottomInset } from '@/providers/SystemTerminalProvider';
import {
  getPaprikaRecipesFull,
  getPaprikaCategories,
  getPaprikaGroceries,
  getPaprikaMeals,
  refreshPaprika,
} from '@/lib/api';
import type { PaprikaRecipe, PaprikaCategory, PaprikaGroceryItem, PaprikaMeal } from '@ha/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recipeImageSrc(r: PaprikaRecipe): string | null {
  if (r.image_url) return r.image_url;
  if (r.photo_hash || r.photo) return `/api/paprika/recipes/${r.uid}/photo`;
  return null;
}

function StarsDisplay({ rating }: { rating: number }) {
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
  // Paprika dates may be YYYY-MM-DD, YYYY-MM-DD HH:MM:SS, or other formats
  const normalized = dateStr.includes('T') ? dateStr : dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr + 'T00:00:00';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return dateStr; // fallback to raw string if unparseable
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Recipe Detail (full-screen, tablet-optimized)
// ---------------------------------------------------------------------------

function RecipeDetail({
  recipe,
  onBack,
  onOpenTimers,
}: {
  recipe: PaprikaRecipe;
  onBack: () => void;
  onOpenTimers: () => void;
}) {
  const [photoExpanded, setPhotoExpanded] = useState(true);
  const imgSrc = recipeImageSrc(recipe);
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const terminalBottom = useSystemTerminalBottomInset();
  const lcarsFrame = useLCARSFrame();
  /** LCARS: content lives in `main.lcars-content` (fixed + overflow-y auto); fill that rect — do not use 100dvh or the whole main scrolls. */
  const inLcarsContent = lcarsFrame !== null;
  const shellHeight = useMemo(() => {
    const headerPx = 48;
    const bottomNavPx = isMdUp ? 0 : 64;
    return `calc(100dvh - ${headerPx + bottomNavPx + terminalBottom}px)`;
  }, [isMdUp, terminalBottom]);

  return (
    <div
      className={
        inLcarsContent
          ? 'absolute inset-0 z-[1] flex min-h-0 flex-col overflow-hidden'
          : 'flex min-h-0 flex-col overflow-hidden'
      }
      style={inLcarsContent ? undefined : { height: shellHeight, maxHeight: shellHeight }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--color-border)' }}>
        <button type="button" onClick={onBack} className="rounded-md p-1 hover:bg-[var(--color-bg-hover)]" aria-label="Back to recipes">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{recipe.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {recipe.rating > 0 && <StarsDisplay rating={recipe.rating} />}
            {recipe.total_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {recipe.total_time}
              </span>
            )}
            {recipe.servings && <span>Serves {recipe.servings}</span>}
            {recipe.source && <span>{recipe.source}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenTimers}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Open kitchen timers"
        >
          <Timer className="h-4 w-4" />
          Timers
        </button>
      </div>

      {/* Two columns: left (ingredients + notes) and right (directions) each scroll independently */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex w-72 min-w-0 shrink-0 flex-col overflow-hidden border-r"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div className="ha-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Ingredients
            </h2>
            {recipe.ingredients ? (
              <div className="space-y-1 pr-1">
                {recipe.ingredients.split('\n').filter(Boolean).map((line, i) => (
                  <label key={i} className="group flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0" />
                    <span className="group-has-[:checked]:line-through group-has-[:checked]:opacity-50">
                      {line}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No ingredients listed</p>
            )}

            {recipe.notes ? (
              <>
                <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Notes
                </h2>
                <p className="whitespace-pre-line pr-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {recipe.notes}
                </p>
              </>
            ) : null}
          </div>
        </div>

        {/* Directions: photo fixed; steps scroll */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {imgSrc && (
            <div className="shrink-0 px-4 pt-4">
              {photoExpanded ? (
                <div className="relative">
                  <img
                    src={imgSrc}
                    alt={recipe.name}
                    className="max-h-64 w-full rounded-lg object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoExpanded(false)}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                  >
                    <ChevronUp className="h-3.5 w-3.5" /> Hide
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPhotoExpanded(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <ChevronDown className="h-3.5 w-3.5" /> Show photo
                </button>
              )}
            </div>
          )}

          <h2 className="shrink-0 px-4 pt-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Directions
          </h2>
          <div className="ha-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {recipe.directions ? (
              <div className="space-y-4">
                {recipe.directions.split('\n').filter(Boolean).map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-accent)', color: '#fff', opacity: 0.85 }}
                    >
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No directions listed</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Recipes Page
// ---------------------------------------------------------------------------

function RecipesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<PaprikaRecipe[]>([]);
  const [categories, setCategories] = useState<PaprikaCategory[]>([]);
  const [groceries, setGroceries] = useState<PaprikaGroceryItem[]>([]);
  const [meals, setMeals] = useState<PaprikaMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [pinnedUids, setPinnedUids] = useState<Set<string> | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<PaprikaRecipe | null>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const { openTimersPanel } = useAssistant();

  // Close category dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build UID → name map for categories
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.uid, c.name);
    return map;
  }, [categories]);

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

  // Apply ?uids= param from assistant navigation (exact UID set), then clean URL
  const uidsParam = searchParams.get('uids');
  useEffect(() => {
    if (!uidsParam) return;
    setPinnedUids(new Set(uidsParam.split(',').map((u) => u.trim()).filter(Boolean)));
    setSearch('');
    setSelectedCategory('');
    router.replace('/recipes', { scroll: false });
  }, [uidsParam, router]);

  // Apply ?q= search param from assistant navigation, then clean URL
  const qParam = searchParams.get('q');
  useEffect(() => {
    if (!qParam) return;
    setSearch(qParam);
    setPinnedUids(null);
    router.replace('/recipes', { scroll: false });
  }, [qParam, router]);

  const openUid = searchParams.get('open');
  useEffect(() => {
    if (!openUid || loading || recipes.length === 0) return;
    const found = recipes.find((r) => r.uid === openUid);
    if (found) {
      setSelectedRecipe(found);
      router.replace('/recipes', { scroll: false });
    }
  }, [openUid, loading, recipes, router]);

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
    // When the assistant pins exact UIDs, show only those (preserving match order)
    if (pinnedUids) {
      const ordered = [...pinnedUids]
        .map((uid) => recipes.find((r) => r.uid === uid))
        .filter((r): r is typeof recipes[number] => r !== undefined);
      return ordered;
    }
    return recipes.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.ingredients.toLowerCase().includes(q) && !(r.source ?? '').toLowerCase().includes(q)) return false;
      }
      if (selectedCategory && !r.categories.includes(selectedCategory)) return false;
      return true;
    });
  }, [recipes, search, selectedCategory, pinnedUids]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const c of r.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([uid]) => categoryMap.has(uid))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([uid, count]) => ({ uid, name: categoryMap.get(uid)!, count }));
  }, [recipes, categoryMap]);

  // Recipe lookup by UID for meal plan
  const recipesByUid = useMemo(() => {
    const map = new Map<string, PaprikaRecipe>();
    for (const r of recipes) map.set(r.uid, r);
    return map;
  }, [recipes]);

  // Meals sorted descending (future on top, past below), with today anchored
  const mealsByDate = useMemo(() => {
    const grouped = new Map<string, PaprikaMeal[]>();
    for (const m of meals) {
      const list = grouped.get(m.date) ?? [];
      list.push(m);
      grouped.set(m.date, list);
    }
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [meals]);

  // Scroll to today when meal plan tab is shown
  const scrollToToday = useCallback(() => {
    setTimeout(() => todayRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
  }, []);

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

  // Full-screen recipe detail view
  if (selectedRecipe) {
    return (
      <RecipeDetail
        recipe={selectedRecipe}
        onBack={() => setSelectedRecipe(null)}
        onOpenTimers={openTimersPanel}
      />
    );
  }

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

  const today = todayStr();

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
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

      <Tabs.Root defaultValue="recipes" onValueChange={(v) => { if (v === 'meal-plan') scrollToToday(); }}>
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
        <Tabs.Content value="recipes" forceMount className="pt-4 space-y-4 data-[state=inactive]:hidden">

          {/* AI filtered banner */}
          {pinnedUids && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              <span>✦ {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''} matched by AI assistant</span>
              <button
                onClick={() => { setPinnedUids(null); setSearch(''); }}
                className="ml-3 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-70"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
              >
                Clear
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2 h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPinnedUids(null); }}
                className="w-full rounded-md border pl-8 pr-3 py-1.5 text-sm"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div className="relative" ref={categoryDropdownRef}>
              <button
                onClick={() => setCategoryDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm min-w-[140px]"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <span className="flex-1 text-left truncate">
                  {selectedCategory ? (categoryMap.get(selectedCategory) ?? selectedCategory) : 'All categories'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              </button>
              {categoryDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 w-56 max-h-72 overflow-y-auto rounded-lg border shadow-lg"
                  style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}
                >
                  <button
                    onClick={() => { setSelectedCategory(''); setCategoryDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{ color: selectedCategory === '' ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: selectedCategory === '' ? 600 : 400 }}
                  >
                    All categories
                  </button>
                  {topCategories.map((c) => (
                    <button
                      key={c.uid}
                      onClick={() => { setSelectedCategory(c.uid); setCategoryDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-bg-hover)] flex items-center justify-between"
                      style={{ color: selectedCategory === c.uid ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: selectedCategory === c.uid ? 600 : 400 }}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs shrink-0 ml-2" style={{ color: 'var(--color-text-muted)' }}>{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredRecipes.map((r) => {
              const imgSrc = recipeImageSrc(r);
              return (
              <Card key={r.uid} className="cursor-pointer overflow-hidden !p-0" onClick={() => setSelectedRecipe(r)}>
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={r.name}
                    className="h-32 w-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="h-32 w-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                    <CookingPot className="h-8 w-8" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  </div>
                )}
                <div className="p-2.5 space-y-1">
                  <h3 className="text-sm font-medium line-clamp-1">{r.name}</h3>
                  <div className="flex items-center gap-2">
                    {r.rating > 0 && <StarsDisplay rating={r.rating} />}
                    {r.total_time && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        <Clock className="h-2.5 w-2.5" /> {r.total_time}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
              );
            })}
          </div>

          {filteredRecipes.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
              No recipes match your search
            </p>
          )}
        </Tabs.Content>

        {/* Meal Plan Tab — future on top, today anchored, past below */}
        <Tabs.Content value="meal-plan" forceMount className="pt-4 space-y-3 data-[state=inactive]:hidden">
          {mealsByDate.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No meals planned</p>
          ) : (
            mealsByDate.map(([date, dayMeals]) => {
              const isToday = date === today;
              const isPast = date < today;
              return (
                <div
                  key={date}
                  ref={isToday ? todayRef : undefined}
                  className={isToday ? 'ring-2 ring-[var(--color-accent)] rounded-lg p-3' : 'p-3'}
                  style={isPast ? { opacity: 0.5 } : undefined}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium">{relativeDate(date)}</h3>
                    {isToday && <Badge variant="info">Today</Badge>}
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{date.split(' ')[0]}</span>
                  </div>
                  <div className="space-y-1">
                    {dayMeals.map((m) => {
                      const recipe = m.recipe_uid ? recipesByUid.get(m.recipe_uid) : undefined;
                      return (
                        <div
                          key={m.uid}
                          className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm${recipe ? ' cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]' : ''}`}
                          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                          onClick={recipe ? () => setSelectedRecipe(recipe) : undefined}
                        >
                          {recipe && recipeImageSrc(recipe) ? (
                            <img
                              src={recipeImageSrc(recipe)!}
                              alt={m.name}
                              className="h-8 w-8 rounded object-cover shrink-0"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div
                              className="flex h-8 w-8 items-center justify-center rounded shrink-0"
                              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                            >
                              <CookingPot className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                          )}
                          <span className="flex-1 min-w-0 truncate">{m.name}</span>
                          <Badge className="text-[10px] shrink-0">
                            {m.type === 0 ? 'Breakfast' : m.type === 1 ? 'Lunch' : m.type === 2 ? 'Dinner' : 'Snack'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </Tabs.Content>

        {/* Grocery List Tab */}
        <Tabs.Content value="grocery-list" forceMount className="pt-4 space-y-4 data-[state=inactive]:hidden">
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
    </div>
  );
}

export default function RecipesPage() {
  return (
    <Suspense
      fallback={(
        <div className="mx-auto flex max-w-5xl items-center gap-2 p-4 lg:p-6">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading recipes...</span>
        </div>
      )}
    >
      <RecipesPageContent />
    </Suspense>
  );
}
