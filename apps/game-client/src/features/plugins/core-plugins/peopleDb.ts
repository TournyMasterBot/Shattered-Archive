// apps/game-client/src/features/plugins/core-plugins/peopleDb.ts
//
// Module-level singleton for the People database.
// Populated by the People plugin; read by the Highlighter plugin.

const DB_STORAGE_KEY = 'shatteredarchive.plugins.people.db';

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

function persist() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify([...db.values()]));
  } catch {
    // ignore
  }
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
