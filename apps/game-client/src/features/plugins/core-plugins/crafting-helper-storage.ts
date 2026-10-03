// apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts
//
// Module-level singleton for the Crafting Helper plugin's tracked craft-skill
// levels. Per-character, per-craft-type (craft type is a config-driven id,
// e.g. 'spellcrafting' today) — mirrors peopleDb.ts's lazy-load +
// debounced-persist pattern.

const DB_STORAGE_KEY = 'shatteredarchive.plugins.crafting-helper.skillLevels';
// Cap on retained skill-level entries. Cardinality here is naturally small
// (characters × craft types), but mirrors peopleDb.ts's cap in this same
// directory for the same reason: bound the per-persist JSON cost rather
// than assume growth never happens (review 3.7). Evicts by oldest
// updatedAt first.
const MAX_SKILL_ENTRIES = 500;
const TRIM_SKILL_ENTRIES_TO = 400;

export interface SkillEntry {
  level: number;
  updatedAt: number; // ms epoch
}

// ── In-memory store ────────────────────────────────────────────────────
// Keyed by `${characterKey}::${craftTypeId}` (both lowercased by the caller)
// — a flat Map, same shape as peopleDb.ts's single-level Map, rather than
// nested maps, since every read/write already knows both parts of the key.

const db: Map<string, SkillEntry> = new Map();
let loaded = false;

function compositeKey(characterKey: string, craftTypeId: string): string {
  return `${characterKey}::${craftTypeId}`;
}

function trimSkillEntriesIfNeeded(): void {
  if (db.size <= MAX_SKILL_ENTRIES) return;
  const byUpdatedAsc = [...db.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const toRemove = byUpdatedAsc.slice(0, db.size - TRIM_SKILL_ENTRIES_TO);
  for (const [key] of toRemove) db.delete(key);
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, SkillEntry>;
    if (obj && typeof obj === 'object') {
      for (const [key, entry] of Object.entries(obj)) {
        if (entry && typeof entry.level === 'number') db.set(key, entry);
      }
    }
  } catch {
    // ignore corrupt storage
  }
}

function writePersist() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(Object.fromEntries(db)));
  } catch {
    // ignore
  }
}

// Debounced trailing-edge persist: a skill-up burst (e.g. multiple crafts in
// quick succession) shouldn't trigger a synchronous localStorage write per
// call — same rationale and delay as peopleDb.ts's persist().
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const PERSIST_DELAY_MS = 400;

function persist(): void {
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    writePersist();
  }, PERSIST_DELAY_MS);
}

// ── Public API ─────────────────────────────────────────────────────────

export function getTrackedSkillLevel(characterKey: string, craftTypeId: string): number | null {
  ensureLoaded();
  const entry = db.get(compositeKey(characterKey, craftTypeId));
  return entry?.level ?? null;
}

export function setTrackedSkillLevel(characterKey: string, craftTypeId: string, level: number): void {
  ensureLoaded();
  db.set(compositeKey(characterKey, craftTypeId), { level, updatedAt: Date.now() });
  trimSkillEntriesIfNeeded();
  persist();
}

// ── Shared per-character list-store helper ────────────────────────────────
// Order queue and completed-order history are both "one localStorage array
// per character, lazy-loaded on first access, debounce-persisted" — this
// factory shares that load/persist logic while giving each caller its own
// isolated Map/Set/timer state (review 3.7). `list()` returns a copy of
// each item, not just of the outer array, so a caller mutating a returned
// object can never corrupt what's persisted (review 3.8).
function createPerCharacterListStore<T extends object>(storageKeyPrefix: string, maxEntries?: number) {
  const store: Map<string, T[]> = new Map();
  const loadedKeys: Set<string> = new Set();
  const persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  function storageKey(characterKey: string): string {
    return `${storageKeyPrefix}.${characterKey}`;
  }

  function ensureLoaded(characterKey: string) {
    if (loadedKeys.has(characterKey)) return;
    loadedKeys.add(characterKey);
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(storageKey(characterKey));
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) store.set(characterKey, arr as T[]);
    } catch {
      // ignore corrupt storage
    }
  }

  function persist(characterKey: string) {
    const existing = persistTimers.get(characterKey);
    if (existing) clearTimeout(existing);
    persistTimers.set(
      characterKey,
      setTimeout(() => {
        persistTimers.delete(characterKey);
        try {
          if (typeof window === 'undefined') return;
          const list = store.get(characterKey) ?? [];
          window.localStorage.setItem(storageKey(characterKey), JSON.stringify(list));
        } catch {
          // ignore
        }
      }, PERSIST_DELAY_MS),
    );
  }

  return {
    list(characterKey: string): T[] {
      ensureLoaded(characterKey);
      return (store.get(characterKey) ?? []).map((item) => ({ ...item }));
    },
    append(characterKey: string, item: T): void {
      ensureLoaded(characterKey);
      const next = [...(store.get(characterKey) ?? []), item];
      const trimmed = maxEntries && next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
      store.set(characterKey, trimmed);
      persist(characterKey);
    },
    removeWhere(characterKey: string, predicate: (item: T) => boolean): boolean {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return false;
      const next = [...queue];
      next.splice(idx, 1);
      store.set(characterKey, next);
      persist(characterKey);
      return true;
    },
    updateWhere(characterKey: string, predicate: (item: T) => boolean, patch: Partial<T>): void {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return;
      const next = [...queue];
      next[idx] = { ...next[idx], ...patch };
      store.set(characterKey, next);
      persist(characterKey);
    },
  };
}

// ── Order queue store ────────────────────────────────────────────────────

export type StoredQualitySpec =
  | { kind: 'atLeast'; min: number }
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

export interface StoredCraftOrder {
  id: string;
  itemName: string;
  quantityRemaining: number;
  quantityTotal: number;
  qualitySpec: StoredQualitySpec;
  createdAt: number; // ms epoch
  materialsUsed?: Record<string, number>;
}

const orderQueueStore = createPerCharacterListStore<StoredCraftOrder>('shatteredarchive.plugins.crafting-helper.orders');

export function getOrderQueue(characterKey: string): StoredCraftOrder[] {
  return orderQueueStore.list(characterKey);
}

export function addOrder(characterKey: string, order: StoredCraftOrder): void {
  orderQueueStore.append(characterKey, order);
}

export function removeOrder(characterKey: string, orderId: string): boolean {
  return orderQueueStore.removeWhere(characterKey, (o) => o.id === orderId);
}

export function updateOrder(characterKey: string, orderId: string, patch: Partial<StoredCraftOrder>): void {
  orderQueueStore.updateWhere(characterKey, (o) => o.id === orderId, patch);
}

// ── Completed order history ───────────────────────────────────────────────
// A lookup convenience, not a full audit log — unbounded growth isn't worth
// it, so only the most recent entries are kept.
const MAX_COMPLETED_ORDERS = 50;

export interface CompletedCraftOrder {
  id: string;
  itemName: string;
  quantityTotal: number;
  qualitySpec: StoredQualitySpec;
  materialsUsed: Record<string, number>;
  createdAt: number; // ms epoch — when the order was originally queued
  completedAt: number; // ms epoch
}

const completedOrdersStore = createPerCharacterListStore<CompletedCraftOrder>(
  'shatteredarchive.plugins.crafting-helper.orderHistory',
  MAX_COMPLETED_ORDERS,
);

export function getCompletedOrders(characterKey: string): CompletedCraftOrder[] {
  return completedOrdersStore.list(characterKey);
}

export function addCompletedOrder(characterKey: string, record: CompletedCraftOrder): void {
  completedOrdersStore.append(characterKey, record);
}
