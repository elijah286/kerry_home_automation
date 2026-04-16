// ---------------------------------------------------------------------------
// CameraCoordinator — arbitrate a finite number of live MSE streams across
// all cameras currently mounted in the DOM.
//
// Why this exists: Samsung A9+ tablets fall over past ~2 simultaneous MSE
// decoders; iPad Pro does ~6. The CameraCard asks the coordinator for a slot;
// if it gets one it goes live, otherwise it falls back to snapshot polling.
//
// Eviction policy: visible + recently-focused wins. A camera that scrolls off
// screen `release()`s its slot so a newly-visible one can go live. Ties break
// by arrival order (oldest wins — prevents thrash on scroll).
// ---------------------------------------------------------------------------

type Listener = (hasSlot: boolean) => void;

interface Slot {
  id: string;           // stable camera/entity id
  requestedAt: number;  // epoch ms
  visible: boolean;
  priority: number;     // higher = prefer live
  listener: Listener;
  granted: boolean;
}

class CameraCoordinator {
  private slots = new Map<string, Slot>();
  private budget = 2;

  setBudget(n: number): void {
    if (n === this.budget) return;
    this.budget = Math.max(0, n);
    this.reconcile();
  }

  getBudget(): number { return this.budget; }

  /**
   * Register interest in a live slot. Returns an unregister fn. The listener
   * is called immediately (async microtask) with the initial grant state and
   * again whenever it changes.
   */
  request(id: string, listener: Listener, opts: { visible?: boolean; priority?: number } = {}): () => void {
    const existing = this.slots.get(id);
    if (existing) {
      // Re-registering with the same id just updates metadata — don't bump
      // `requestedAt` because that would lose eviction fairness.
      existing.visible = opts.visible ?? existing.visible;
      existing.priority = opts.priority ?? existing.priority;
      existing.listener = listener;
    } else {
      this.slots.set(id, {
        id,
        requestedAt: Date.now(),
        visible: opts.visible ?? true,
        priority: opts.priority ?? 0,
        listener,
        granted: false,
      });
    }
    queueMicrotask(() => this.reconcile());
    return () => this.release(id);
  }

  /** Update visibility / priority without re-registering. */
  update(id: string, patch: { visible?: boolean; priority?: number }): void {
    const s = this.slots.get(id);
    if (!s) return;
    if (patch.visible !== undefined) s.visible = patch.visible;
    if (patch.priority !== undefined) s.priority = patch.priority;
    this.reconcile();
  }

  release(id: string): void {
    const s = this.slots.get(id);
    if (!s) return;
    this.slots.delete(id);
    if (s.granted) s.listener(false);
    this.reconcile();
  }

  /** Pure read; useful for debug overlays. */
  snapshot(): { budget: number; total: number; granted: string[] } {
    const granted: string[] = [];
    for (const s of this.slots.values()) if (s.granted) granted.push(s.id);
    return { budget: this.budget, total: this.slots.size, granted };
  }

  private reconcile(): void {
    // Rank slots: visible > hidden, higher priority > lower, older request > newer.
    const ranked = [...this.slots.values()].sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.requestedAt - b.requestedAt;
    });

    const winners = new Set(ranked.slice(0, this.budget).map((s) => s.id));
    for (const s of this.slots.values()) {
      const shouldGrant = winners.has(s.id);
      if (shouldGrant !== s.granted) {
        s.granted = shouldGrant;
        try { s.listener(shouldGrant); }
        catch (err) { console.warn('[CameraCoordinator] listener threw', err); }
      }
    }
  }
}

// Module-scoped singleton — the provider updates `setBudget` on tier change.
export const cameraCoordinator = new CameraCoordinator();
