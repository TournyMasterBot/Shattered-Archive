// apps/game-client/src/features/autoleveling/autoleveling-maps-client.ts

export type ContinentNamesResponse = { continentNames: string[] };
export type AreaNamesResponse = { areaNames: string[] };

// Updated to match your API creature object shape.
export type Beast = {
  filepath: string;
  name: string; // may include ANSI
  cleanName: string;
  lookName: string;

  race: string;
  keywords: string[];

  level: number;
  damageDice: string;
  damageType: string;

  health: number;
  mana?: number;

  immunities: string[];
  resistances: string[];
  vulnerabilities: string[];
  affects: string[];
  offensiveTactics: string[];

  // optional misc
  sex?: string;
  creatureType?: string;
  alignment?: any;
  description?: string;
  raw?: string;
};

export type BeastsResponse = { beasts: Beast[] };

type KVRecord = { key: string; value: any; updatedAt: number };

const DB_NAME = 'shatteredarchive-maps';
const DB_VERSION = 1;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const r = store.get(key);
      r.onsuccess = () => {
        const rec = r.result as KVRecord | undefined;
        resolve(rec?.value ?? null);
      };
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: any): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ key, value, updatedAt: Date.now() } satisfies KVRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // ignore
  }
}

function normalizeKey(s: string): string {
  return String(s ?? '').trim().toLowerCase();
}

async function fetchJson<T>(url: string, ms = 10000): Promise<T> {
  const ac = new AbortController();
  const t = window.setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    window.clearTimeout(t);
  }
}

export async function getContinentNamesCached(): Promise<string[] | null> {
  const cached = await kvGet<ContinentNamesResponse>('continentNames');
  if (!cached?.continentNames?.length) return null;
  return cached.continentNames;
}

export async function getAreaNamesCached(continentName: string): Promise<string[] | null> {
  const key = `areaNames:${normalizeKey(continentName)}`;
  const cached = await kvGet<AreaNamesResponse>(key);
  if (!cached?.areaNames?.length) return null;
  return cached.areaNames;
}

export async function getBeastsCached(areaName: string): Promise<Beast[] | null> {
  const key = `beasts:${normalizeKey(areaName)}`;
  const cached = await kvGet<BeastsResponse>(key);
  if (!cached?.beasts) return null;
  return cached.beasts;
}

export async function fetchContinentNamesRemote(): Promise<string[]> {
  const json = await fetchJson<ContinentNamesResponse>(`/api/web/maps/continent/names`);
  const names = Array.isArray(json?.continentNames) ? json.continentNames.filter((x) => typeof x === 'string') : [];
  await kvSet('continentNames', { continentNames: names });
  return names;
}

export async function fetchAreaNamesRemote(continentName: string): Promise<string[]> {
  const enc = encodeURIComponent(continentName);
  const json = await fetchJson<AreaNamesResponse>(`/api/web/maps/continent/${enc}/get-area-names`);
  const names = Array.isArray(json?.areaNames) ? json.areaNames.filter((x) => typeof x === 'string') : [];
  await kvSet(`areaNames:${normalizeKey(continentName)}`, { areaNames: names });
  return names;
}

export async function fetchBeastsRemote(areaName: string): Promise<Beast[]> {
  const enc = encodeURIComponent(areaName);
  const json = await fetchJson<BeastsResponse>(`/api/web/maps/area/${enc}/beasts`);
  const beasts = Array.isArray(json?.beasts) ? (json.beasts as Beast[]) : [];
  await kvSet(`beasts:${normalizeKey(areaName)}`, { beasts });
  return beasts;
}

export type NamedTrainingPath = {
  id: string;
  name: string;
  raw: string;
};

export async function fetchTrainingPathsRemote(_areaId: string): Promise<NamedTrainingPath[]> {
  return [];
}

type MapAction = {
  action: string;
  action_type: string; // usually "move"
  quantity: number;
};

export function actionsToSpeedwalk(actions: MapAction[]): string {
  const parts: string[] = [];

  for (const a of actions ?? []) {
    const act = String(a?.action ?? '').trim();
    if (!act) continue;

    const qty = Math.max(1, Number(a?.quantity ?? 1) || 1);

    if (qty > 1) parts.push(`#${qty}${act}`);
    else parts.push(act);
  }

  return parts.join(';');
}
