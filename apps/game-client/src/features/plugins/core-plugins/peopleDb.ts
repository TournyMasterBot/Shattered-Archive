// apps/game-client/src/features/plugins/core-plugins/peopleDb.ts
//
// Module-level singleton for the People database.
// Populated by the People plugin; read by the Highlighter plugin.

const DB_STORAGE_KEY = 'shatteredarchive.plugins.people.db';
// Cap on retained people. This survives across sessions (localStorage), so an
// account that runs `who`/`cinfo` a lot over weeks would otherwise grow this
// without bound — trim keeps the per-persist JSON.stringify cost bounded.
// Evicts by oldest lastSeen first.
const MAX_PEOPLE = 3000;
const TRIM_TO = 2500;

export interface PersonInfo {
  name: string; // Properly capitalised (as seen on who list)
  level?: number;
  race?: string;
  class?: string;
  org?: string; // Clan or kingdom name
  orgType?: 'clan' | 'kingdom' | '';
  craft?: string;
  craftRank?: string;
  status?: 'enemy' | 'ally' | 'neutral';
  team?: string; // Optional DSL-colored team label
  lastSeen?: number; // Unix ms
}

// ── In-memory store ────────────────────────────────────────────────────

let db: Map<string, PersonInfo> = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as PersonInfo[];
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (p?.name) db.set(p.name.toLowerCase(), p);
      }
    }
  } catch {
    // ignore corrupt storage
  }
}

function trimIfNeeded(): void {
  if (db.size <= MAX_PEOPLE) return;
  const bySeenDesc = [...db.entries()].sort((a, b) => (b[1].lastSeen ?? 0) - (a[1].lastSeen ?? 0));
  db = new Map(bySeenDesc.slice(0, TRIM_TO));
}

function writePersist() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify([...db.values()]));
  } catch {
    // ignore
  }
}

// Debounced trailing-edge persist: a `who`/`cinfo`/craft-hall listing can call
// setPerson() dozens of times in one burst (one match per line). Without this,
// every call re-serializes the entire — possibly thousands-strong — map AND
// calls the synchronous, blocking window.localStorage.setItem on the JS
// thread, once per matching line instead of once per burst.
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

export function getPerson(name: string): PersonInfo | null {
  ensureLoaded();
  return db.get(name.toLowerCase()) ?? null;
}

export function setPerson(name: string, update: Partial<PersonInfo>) {
  ensureLoaded();
  const key = name.toLowerCase();
  const existing = db.get(key) ?? { name };
  db.set(key, { ...existing, ...update, lastSeen: Date.now() });
  // Cheap size check on every call; the O(n log n) rebuild only actually runs
  // on the rare occasion the cap is crossed — this bounds db.size even across
  // one very long continuous burst, without adding real cost to the common case.
  trimIfNeeded();
  persist();
}

export function getAllPeople(): PersonInfo[] {
  ensureLoaded();
  return [...db.values()];
}

export function findPeople(query: string): PersonInfo[] {
  ensureLoaded();
  const lc = query.toLowerCase();
  return [...db.values()].filter((p) => p.name.toLowerCase().startsWith(lc));
}

export function findByOrg(orgType: 'clan' | 'kingdom', query: string): PersonInfo[] {
  ensureLoaded();
  const lc = query.toLowerCase();
  // Special alias: 'conclave' = all three Robe clans
  if (orgType === 'clan' && lc === 'conclave') {
    return [...db.values()].filter((p) => p.orgType === 'clan' && (p.org ?? '').toLowerCase().includes('robes'));
  }
  return [...db.values()].filter((p) => p.orgType === orgType && (p.org ?? '').toLowerCase().startsWith(lc));
}

export function findByCraft(query: string): PersonInfo[] {
  ensureLoaded();
  const lc = query.toLowerCase();
  return [...db.values()]
    .filter((p) => p.craft && p.craft.toLowerCase().startsWith(lc))
    .sort((a, b) => {
      const RANKS: Record<string, number> = {
        'Legendary Grand Master': 11,
        'Grand Master': 10,
        Master: 9,
        Senior: 8,
        Journeyman: 7,
        Junior: 6,
        Assistant: 5,
        Neophyte: 4,
        Apprentice: 3,
        'Junior Apprentice': 2,
        Helper: 1,
      };
      return (RANKS[b.craftRank ?? ''] ?? 0) - (RANKS[a.craftRank ?? ''] ?? 0);
    });
}

export function dbSize(): number {
  ensureLoaded();
  return db.size;
}
