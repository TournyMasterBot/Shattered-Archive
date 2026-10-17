// apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts
//
// Module-level singleton for the Crafting Helper plugin's persisted data: tracked
// craft-skill levels, the per-character order queue and the completed-order history.
// Skill levels mirror peopleDb.ts's lazy-load + debounced-persist pattern; the order
// queue and history are progress that costs real crafting materials to lose, so they
// write through immediately, and everything is flushed when the page is hidden.

const DB_STORAGE_KEY = 'shatteredarchive.plugins.crafting-helper.skillLevels';
// Cap on retained skill-level entries. Cardinality here is naturally small
// (characters × craft types), but mirrors peopleDb.ts's cap in this same
// directory for the same reason: bound the per-persist JSON cost rather
// than assume growth never happens. Evicts by oldest updatedAt first.
const MAX_SKILL_ENTRIES = 500;
const TRIM_SKILL_ENTRIES_TO = 400;

/** Most orders one character may have queued. `order add` refuses beyond it; load keeps the first N. */
export const MAX_QUEUED_ORDERS = 200;

export interface SkillEntry {
  level: number;
  updatedAt: number; // ms epoch
}

// ── Write-failure reporting ─────────────────────────────────────────────
// localStorage can be full or blocked. A silent failure means progress is held in memory only and
// reverts on reload (an order that looks finished comes back, and gets crafted again), so the
// plugin subscribes and tells the player.
type WriteErrorHandler = (storageKey: string, error: unknown) => void;
const writeErrorHandlers = new Set<WriteErrorHandler>();

export function onStorageWriteError(handler: WriteErrorHandler): () => void {
  writeErrorHandlers.add(handler);
  return () => writeErrorHandlers.delete(handler);
}

function reportWriteError(storageKey: string, error: unknown): void {
  for (const handler of [...writeErrorHandlers]) {
    try {
      handler(storageKey, error);
    } catch {
      // a broken handler must not break persistence
    }
  }
}

// ── Flush on page hide ──────────────────────────────────────────────────
// A debounced write that has not fired when the tab closes or reloads is lost.
const flushers = new Set<() => void>();

function flushAll(): void {
  for (const flush of [...flushers]) flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAll();
    });
  }
}

/** Plain JSON data only (everything stored here is): a real deep copy, so nothing a caller holds aliases the store. */
function cloneJson<V>(value: V): V {
  return JSON.parse(JSON.stringify(value)) as V;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isShortString = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

// ── In-memory skill store ──────────────────────────────────────────────
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
        if (entry && typeof entry.level === 'number') {
          // updatedAt drives eviction order; a missing / non-numeric one would make the sort comparator NaN.
          db.set(key, { level: entry.level, updatedAt: isFiniteNumber(entry.updatedAt) ? entry.updatedAt : 0 });
        }
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
  } catch (error) {
    reportWriteError(DB_STORAGE_KEY, error);
  }
}

// Debounced trailing-edge persist: a skill-up burst (e.g. multiple crafts in
// quick succession) shouldn't trigger a synchronous localStorage write per
// call — same rationale and delay as peopleDb.ts's persist(). Losing the last
// skill level is harmless (the next run re-reads `score`), and pagehide flushes it anyway.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const PERSIST_DELAY_MS = 400;

function persist(): void {
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    writePersist();
  }, PERSIST_DELAY_MS);
}

flushers.add(() => {
  if (persistTimer === undefined) return;
  clearTimeout(persistTimer);
  persistTimer = undefined;
  writePersist();
});

// ── Public API: skill levels ────────────────────────────────────────────

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
// Order queue and completed-order history are both "one localStorage array per
// character, lazy-loaded on first access, written through" — this factory shares that
// logic while giving each caller its own isolated Map/Set state.
//
// - Every stored element passes through `parse`, which returns a freshly built, validated
//   copy or null; malformed / legacy / hand-edited entries are dropped on load (and counted)
//   instead of reaching the engine, where one bad element used to wedge order mode.
// - `list()` and the write paths deep-copy, so a caller mutating a nested field (qualitySpec,
//   materialsUsed) can never corrupt what is stored, and what the caller handed in cannot
//   change the store afterwards.
// - `overflow` decides what a full list does: 'drop-oldest' (history) or 'reject' (the queue,
//   where silently discarding someone's order would be wrong).
interface ListStoreOptions<T> {
  maxEntries: number;
  overflow: 'drop-oldest' | 'reject';
  parse: (raw: unknown) => T | null;
}

function createPerCharacterListStore<T extends object>(storageKeyPrefix: string, opts: ListStoreOptions<T>) {
  const store: Map<string, T[]> = new Map();
  const loadedKeys: Set<string> = new Set();
  const droppedOnLoad: Map<string, number> = new Map();

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
      if (!Array.isArray(arr)) return;
      const valid: T[] = [];
      for (const entry of arr) {
        const parsed = opts.parse(entry);
        if (parsed) valid.push(parsed);
      }
      if (valid.length !== arr.length) droppedOnLoad.set(characterKey, arr.length - valid.length);
      const capped =
        valid.length > opts.maxEntries
          ? opts.overflow === 'reject'
            ? valid.slice(0, opts.maxEntries)
            : valid.slice(valid.length - opts.maxEntries)
          : valid;
      store.set(characterKey, capped);
    } catch {
      // ignore corrupt storage
    }
  }

  function writeNow(characterKey: string) {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(storageKey(characterKey), JSON.stringify(store.get(characterKey) ?? []));
    } catch (error) {
      reportWriteError(storageKey(characterKey), error);
    }
  }

  return {
    list(characterKey: string): T[] {
      ensureLoaded(characterKey);
      return cloneJson(store.get(characterKey) ?? []);
    },
    count(characterKey: string): number {
      ensureLoaded(characterKey);
      return (store.get(characterKey) ?? []).length;
    },
    /** Entries dropped as unreadable when this character's list was loaded; reading it resets it. */
    takeDroppedCount(characterKey: string): number {
      ensureLoaded(characterKey);
      const n = droppedOnLoad.get(characterKey) ?? 0;
      droppedOnLoad.delete(characterKey);
      return n;
    },
    /** Returns false (and stores nothing) when the list is full and overflow is 'reject' or the item is invalid. */
    append(characterKey: string, item: T): boolean {
      ensureLoaded(characterKey);
      const clean = opts.parse(cloneJson(item));
      if (!clean) return false;
      const current = store.get(characterKey) ?? [];
      if (current.length >= opts.maxEntries && opts.overflow === 'reject') return false;
      const next = [...current, clean];
      store.set(characterKey, next.length > opts.maxEntries ? next.slice(next.length - opts.maxEntries) : next);
      writeNow(characterKey);
      return true;
    },
    removeWhere(characterKey: string, predicate: (item: T) => boolean): boolean {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return false;
      const next = [...queue];
      next.splice(idx, 1);
      store.set(characterKey, next);
      writeNow(characterKey);
      return true;
    },
    updateWhere(characterKey: string, predicate: (item: T) => boolean, patch: Partial<T>): void {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return;
      const merged = opts.parse(cloneJson({ ...queue[idx], ...patch }));
      if (!merged) return; // a patch that would make the entry invalid is refused, not stored
      const next = [...queue];
      next[idx] = merged;
      store.set(characterKey, next);
      writeNow(characterKey);
    },
  };
}

// ── Validation ───────────────────────────────────────────────────────────

export type StoredQualitySpec =
  | { kind: 'atLeast'; min: number }
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

/** A well-formed quality spec as a fresh object, or null. Item condition is a percentage, so 0-100. */
export function parseStoredQualitySpec(raw: unknown): StoredQualitySpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.kind === 'atLeast' && isIntIn(s.min, 0, 100)) return { kind: 'atLeast', min: s.min };
  if (s.kind === 'exact' && isIntIn(s.value, 0, 100)) return { kind: 'exact', value: s.value };
  if (s.kind === 'range' && isIntIn(s.min, 0, 100) && isIntIn(s.max, 0, 100) && s.min <= s.max) {
    return { kind: 'range', min: s.min, max: s.max };
  }
  return null;
}

/** A plain { material: count } record with finite non-negative counts, rebuilt key by key; null if it is not one. */
function parseMaterialsRecord(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [material, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFiniteNumber(count) || count < 0 || material.length > 200) return null;
    out[material] = count;
  }
  return out;
}

// ── Order queue store ────────────────────────────────────────────────────

export interface StoredCraftOrder {
  id: string;
  itemName: string;
  quantityRemaining: number;
  quantityTotal: number;
  qualitySpec: StoredQualitySpec;
  createdAt: number; // ms epoch
  // Running tally of raw materials consumed toward this order so far, keyed
  // by material name. Optional because orders queued before this field
  // existed may already be sitting in a character's persisted queue.
  materialsUsed?: Record<string, number>;
}

function parseStoredOrder(raw: unknown): StoredCraftOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isShortString(o.id) || !isShortString(o.itemName)) return null;
  if (!isIntIn(o.quantityTotal, 1, 100_000) || !isIntIn(o.quantityRemaining, 0, o.quantityTotal)) return null;
  const qualitySpec = parseStoredQualitySpec(o.qualitySpec);
  if (!qualitySpec || !isFiniteNumber(o.createdAt)) return null;
  const order: StoredCraftOrder = {
    id: o.id,
    itemName: o.itemName,
    quantityRemaining: o.quantityRemaining,
    quantityTotal: o.quantityTotal,
    qualitySpec,
    createdAt: o.createdAt,
  };
  if (o.materialsUsed !== undefined) {
    const materialsUsed = parseMaterialsRecord(o.materialsUsed);
    if (!materialsUsed) return null;
    order.materialsUsed = materialsUsed;
  }
  return order;
}

const orderQueueStore = createPerCharacterListStore<StoredCraftOrder>(
  'shatteredarchive.plugins.crafting-helper.orders',
  {
    maxEntries: MAX_QUEUED_ORDERS,
    overflow: 'reject',
    parse: parseStoredOrder,
  },
);

export function getOrderQueue(characterKey: string): StoredCraftOrder[] {
  return orderQueueStore.list(characterKey);
}

export function countOrders(characterKey: string): number {
  return orderQueueStore.count(characterKey);
}

/** How many saved orders were unreadable and dropped when this character's queue was loaded (read once). */
export function takeDroppedOrderCount(characterKey: string): number {
  return orderQueueStore.takeDroppedCount(characterKey);
}

/** False when the queue is full (MAX_QUEUED_ORDERS) or the order is malformed; nothing is stored then. */
export function addOrder(characterKey: string, order: StoredCraftOrder): boolean {
  return orderQueueStore.append(characterKey, order);
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

function parseCompletedOrder(raw: unknown): CompletedCraftOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isShortString(o.id) || !isShortString(o.itemName) || !isIntIn(o.quantityTotal, 1, 100_000)) return null;
  const qualitySpec = parseStoredQualitySpec(o.qualitySpec);
  const materialsUsed = parseMaterialsRecord(o.materialsUsed);
  if (!qualitySpec || !materialsUsed || !isFiniteNumber(o.createdAt) || !isFiniteNumber(o.completedAt)) return null;
  return {
    id: o.id,
    itemName: o.itemName,
    quantityTotal: o.quantityTotal,
    qualitySpec,
    materialsUsed,
    createdAt: o.createdAt,
    completedAt: o.completedAt,
  };
}

const completedOrdersStore = createPerCharacterListStore<CompletedCraftOrder>(
  'shatteredarchive.plugins.crafting-helper.orderHistory',
  { maxEntries: MAX_COMPLETED_ORDERS, overflow: 'drop-oldest', parse: parseCompletedOrder },
);

export function getCompletedOrders(characterKey: string): CompletedCraftOrder[] {
  return completedOrdersStore.list(characterKey);
}

export function addCompletedOrder(characterKey: string, record: CompletedCraftOrder): void {
  completedOrdersStore.append(characterKey, record);
}
