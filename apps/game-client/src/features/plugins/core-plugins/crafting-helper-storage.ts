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
