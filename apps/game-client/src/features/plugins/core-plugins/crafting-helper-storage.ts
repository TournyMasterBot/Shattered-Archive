// apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts
//
// Module-level singleton for the Crafting Helper plugin's tracked craft-skill
// levels. Per-character, per-craft-type (craft type is a config-driven id,
// e.g. 'spellcrafting' today) — mirrors peopleDb.ts's lazy-load +
// debounced-persist pattern.

const DB_STORAGE_KEY = 'shatteredarchive.plugins.crafting-helper.skillLevels';

export interface SkillEntry {
  level: number;
  updatedAt: number; // ms epoch
}

// ── In-memory store ────────────────────────────────────────────────────
// Keyed by `${characterKey}::${craftTypeId}` (both lowercased by the caller)
// — a flat Map, same shape as peopleDb.ts's single-level Map, rather than
// nested maps, since every read/write already knows both parts of the key.

let db: Map<string, SkillEntry> = new Map();
let loaded = false;

function compositeKey(characterKey: string, craftTypeId: string): string {
  return `${characterKey}::${craftTypeId}`;
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
  persist();
}

// ── Order queue store ────────────────────────────────────────────────────
// One localStorage entry per character (not a shared keyed map like skill
// levels above) since each entry is itself an ordered array — the FIFO
// order among a character's orders IS the array order, so there's nothing
// to key by beyond the character.

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
}

const orderQueues: Map<string, StoredCraftOrder[]> = new Map();
const ordersLoaded: Set<string> = new Set();
const orderPersistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function orderStorageKey(characterKey: string): string {
  return `shatteredarchive.plugins.crafting-helper.orders.${characterKey}`;
}

function ensureOrdersLoaded(characterKey: string) {
  if (ordersLoaded.has(characterKey)) return;
  ordersLoaded.add(characterKey);
  try {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(orderStorageKey(characterKey));
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) orderQueues.set(characterKey, arr as StoredCraftOrder[]);
  } catch {
    // ignore corrupt storage
  }
}

function persistOrders(characterKey: string) {
  const existing = orderPersistTimers.get(characterKey);
  if (existing) clearTimeout(existing);
  orderPersistTimers.set(
    characterKey,
    setTimeout(() => {
      orderPersistTimers.delete(characterKey);
      try {
        if (typeof window === 'undefined') return;
        const queue = orderQueues.get(characterKey) ?? [];
        window.localStorage.setItem(orderStorageKey(characterKey), JSON.stringify(queue));
      } catch {
        // ignore
      }
    }, PERSIST_DELAY_MS),
  );
}

export function getOrderQueue(characterKey: string): StoredCraftOrder[] {
  ensureOrdersLoaded(characterKey);
  return [...(orderQueues.get(characterKey) ?? [])];
}

export function addOrder(characterKey: string, order: StoredCraftOrder): void {
  ensureOrdersLoaded(characterKey);
  const queue = [...(orderQueues.get(characterKey) ?? []), order];
  orderQueues.set(characterKey, queue);
  persistOrders(characterKey);
}

export function removeOrder(characterKey: string, orderId: string): boolean {
  ensureOrdersLoaded(characterKey);
  const queue = orderQueues.get(characterKey) ?? [];
  const idx = queue.findIndex((o) => o.id === orderId);
  if (idx === -1) return false;
  const next = [...queue];
  next.splice(idx, 1);
  orderQueues.set(characterKey, next);
  persistOrders(characterKey);
  return true;
}

export function updateOrder(characterKey: string, orderId: string, patch: Partial<StoredCraftOrder>): void {
  ensureOrdersLoaded(characterKey);
  const queue = orderQueues.get(characterKey) ?? [];
  const idx = queue.findIndex((o) => o.id === orderId);
  if (idx === -1) return;
  const next = [...queue];
  next[idx] = { ...next[idx], ...patch };
  orderQueues.set(characterKey, next);
  persistOrders(characterKey);
}
