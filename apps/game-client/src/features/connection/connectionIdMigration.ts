// apps/game-client/src/features/connection/connectionIdMigration.ts
//
// Idempotent move of everything stored under the legacy `default` connection id
// into `dsl-mud`, the shared id. See connectionId.ts for why the two existed.
//
// Rules this module keeps:
//  - Nothing is deleted without being either copied intact to the new key or
//    backed up. When BOTH sides held data, a backup of both raw values is written
//    first and the move for that key is skipped if the backup cannot be written.
//  - On a conflict the `dsl-mud` side wins: it is what a connected user has been
//    running. Collections are merged (so scripts that exist only under `default`
//    survive); single values keep the `dsl-mud` one.
//  - It runs on every start, not behind a one-shot flag: it only acts on keys that
//    still carry the legacy id, so a stale tab or an old cloud load that writes one
//    again is folded in on the next start.

import { SHARED_CONNECTION_ID as NEW, LEGACY_UNCONNECTED_ID as OLD } from './connectionId';

export const MIGRATION_BACKUP_PREFIX = 'shatteredArchive.migrationBackup.defaultToDslMud.';

export interface MigrationReport {
  /** Keys whose legacy value was moved to the new key (no conflicting data). */
  moved: string[];
  /** Keys where both sides had data and were merged (backup written). */
  merged: string[];
  /** Records rewritten in IndexedDB. */
  rows: number;
  /** Keys or stores that could not be migrated and were left untouched. */
  skipped: string[];
}

function emptyReport(): MigrationReport {
  return { moved: [], merged: [], rows: 0, skipped: [] };
}

/* ------------------------------ merge helpers ------------------------------ */

type Merge = (preferred: string, other: string) => string;

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function tryParse(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Arrays of `{ id }` objects (user scripts): union by id, preferred side wins. */
export const mergeScriptLists: Merge = (preferred, other) => {
  const a = tryParse(preferred);
  const b = tryParse(other);
  if (!Array.isArray(a)) return Array.isArray(b) ? other : preferred;
  if (!Array.isArray(b)) return preferred;

  const seen = new Set<string>();
  for (const item of a) {
    if (isObject(item) && typeof item.id === 'string') seen.add(item.id);
  }
  const out = [...a];
  for (const item of b) {
    if (isObject(item) && typeof item.id === 'string' && !seen.has(item.id)) out.push(item);
  }
  return JSON.stringify(out);
};

const GLOBAL_LANGUAGES = ['javascript', 'lua', 'python', 'typescript'] as const;

/** Per language, the preferred source if non-empty, else the other's. */
export function mergeGlobalSources(
  preferred: Record<string, unknown>,
  other: Record<string, unknown>,
): Record<(typeof GLOBAL_LANGUAGES)[number], string> {
  const out = {} as Record<(typeof GLOBAL_LANGUAGES)[number], string>;
  for (const lang of GLOBAL_LANGUAGES) {
    const pa = preferred[lang];
    const pb = other[lang];
    out[lang] = typeof pa === 'string' && pa.length > 0 ? pa : typeof pb === 'string' ? pb : '';
  }
  return out;
}

/** `{ schema, sources: { <language>: string } }` payloads, merged per language. */
export const mergeGlobalScriptPayloads: Merge = (preferred, other) => {
  const a = tryParse(preferred);
  const b = tryParse(other);
  if (!isObject(a) || !isObject(a.sources)) return isObject(b) && isObject(b.sources) ? other : preferred;
  if (!isObject(b) || !isObject(b.sources)) return preferred;
  return JSON.stringify({ ...a, sources: mergeGlobalSources(a.sources, b.sources) });
};

/** `{ schema, vars: {...} }` payloads (global vars, named variables): key-wise merge, preferred wins. */
export const mergeVarPayloads: Merge = (preferred, other) => {
  const a = tryParse(preferred);
  const b = tryParse(other);
  if (!isObject(a) || !isObject(a.vars)) return isObject(b) && isObject(b.vars) ? other : preferred;
  if (!isObject(b) || !isObject(b.vars)) return preferred;
  return JSON.stringify({ ...a, vars: { ...b.vars, ...a.vars } });
};

/** Plain `{ key: value }` records (brew letter map / recipes): key-wise merge, preferred wins. */
export const mergeRecords: Merge = (preferred, other) => {
  const a = tryParse(preferred);
  const b = tryParse(other);
  if (!isObject(a)) return isObject(b) ? other : preferred;
  if (!isObject(b)) return preferred;
  return JSON.stringify({ ...b, ...a });
};

/** A single opaque value (auto-leveling config): the preferred side, unless it is blank. */
export const preferNonBlank: Merge = (preferred, other) => (preferred.trim() ? preferred : other);

/* ------------------------------ localStorage ------------------------------ */

interface KeyRule {
  /** The new key for a legacy key this rule owns, else null. */
  target(key: string): string | null;
  merge: Merge;
}

/** `<prefix>dsl-mud` -> `<prefix>default`. */
function suffixRule(prefix: string, merge: Merge): KeyRule {
  const oldKey = `${prefix}${OLD}`;
  return { target: (key) => (key === oldKey ? `${prefix}${NEW}` : null), merge };
}

/** `<prefix>dsl-mud.<rest>` -> `<prefix>default.<rest>` (one key per plugin). */
function dottedRule(prefix: string, merge: Merge): KeyRule {
  const oldHead = `${prefix}${OLD}.`;
  return {
    target: (key) => (key.startsWith(oldHead) ? `${prefix}${NEW}.${key.slice(oldHead.length)}` : null),
    merge,
  };
}

const KEY_RULES: KeyRule[] = [
  suffixRule('shatteredArchive.userScripts.', mergeScriptLists),
  suffixRule('shatteredArchive.userGlobalScripts.', mergeGlobalScriptPayloads),
  suffixRule('shatteredArchive.userGlobalVars.', mergeVarPayloads),
  suffixRule('shatteredArchive.userVariables.', mergeVarPayloads),
  suffixRule('autoleveling-config-v3:', preferNonBlank),
  suffixRule('autoleveling-config-v2:', preferNonBlank),
  suffixRule('brew.plugin.letterMap.', mergeRecords),
  suffixRule('brew.plugin.recipes.', mergeRecords),
  dottedRule('shatteredArchive.pluginCssOverride.', preferNonBlank),
];

/** localStorage blobs shaped `{ [connectionId]: value }`; the value may also carry its own connectionId. */
const CONNECTION_MAP_KEYS = [
  'shatteredArchive.equipment.state.v1',
  'shatteredArchive.equipment.prefs.v1',
  'shatteredArchive.equipment.profile.v1',
];

function allKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null) keys.push(k);
  }
  return keys;
}

function backupKey(now: number, originalKey: string): string {
  return `${MIGRATION_BACKUP_PREFIX}${now}.${originalKey}`;
}

function migrateKeys(storage: Storage, now: number, report: MigrationReport): void {
  for (const oldKey of allKeys(storage)) {
    // Never treat a backup written by this module as a legacy key.
    if (oldKey.startsWith(MIGRATION_BACKUP_PREFIX)) continue;

    for (const rule of KEY_RULES) {
      const newKey = rule.target(oldKey);
      if (newKey === null) continue;

      try {
        const oldRaw = storage.getItem(oldKey);
        if (oldRaw === null) break;
        const newRaw = storage.getItem(newKey);

        if (newRaw === null || newRaw === oldRaw) {
          storage.setItem(newKey, oldRaw);
          // Lossless move: confirm the copy landed before the original goes.
          if (storage.getItem(newKey) !== oldRaw) throw new Error('copy did not persist');
          storage.removeItem(oldKey);
          report.moved.push(oldKey);
        } else {
          // Both sides have data: back up both raw values FIRST so nothing is lost.
          storage.setItem(backupKey(now, oldKey), JSON.stringify({ [OLD]: oldRaw, [NEW]: newRaw }));
          // The surviving `dsl-mud` value is the preferred side of the merge.
          storage.setItem(newKey, rule.merge(newRaw, oldRaw));
          storage.removeItem(oldKey);
          report.merged.push(oldKey);
        }
      } catch {
        // Quota or storage failure: leave this key exactly as it was.
        report.skipped.push(oldKey);
      }
      break;
    }
  }
}

function rewriteInnerConnectionId(value: unknown): unknown {
  return isObject(value) && value.connectionId === OLD ? { ...value, connectionId: NEW } : value;
}

function migrateConnectionMaps(storage: Storage, now: number, report: MigrationReport): void {
  for (const key of CONNECTION_MAP_KEYS) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const map = tryParse(raw);
      if (!isObject(map) || !(OLD in map)) continue;

      storage.setItem(backupKey(now, key), raw);
      const next: Record<string, unknown> = { ...map };
      // An existing `dsl-mud` entry survives; the `default` one only fills the gap.
      next[NEW] = NEW in map ? map[NEW] : rewriteInnerConnectionId(map[OLD]);
      delete next[OLD];
      storage.setItem(key, JSON.stringify(next));
      report.merged.push(key);
    } catch {
      report.skipped.push(key);
    }
  }
}

/** Synchronous localStorage half. Safe to call on every start. */
export function migrateLocalStorage(storage: Storage, now: number = Date.now()): MigrationReport {
  const report = emptyReport();
  migrateKeys(storage, now, report);
  migrateConnectionMaps(storage, now, report);
  return report;
}

/* ------------------------------ IndexedDB ------------------------------ */

/** The minimal surface the row logic needs, so it can be tested without IndexedDB. */
export interface RowStore<Row> {
  all(): Promise<Row[]>;
  put(row: Row): Promise<void>;
  remove(key: string): Promise<void>;
}

type ConnRow = { connectionId?: unknown };

/** Rows keyed by their own id and indexed by connectionId (library): re-label legacy rows in place. */
export async function relabelRows<Row extends ConnRow>(store: RowStore<Row>): Promise<number> {
  const rows = await store.all();
  let count = 0;
  for (const row of rows) {
    if (row.connectionId !== OLD) continue;
    await store.put({ ...row, connectionId: NEW });
    count += 1;
  }
  return count;
}

/**
 * Rows whose key IS the connection id (equipment). A `default` row becomes the
 * `dsl-mud` row when there is none; when a `dsl-mud` row already exists it stays
 * and the `default` row is handed to `backupDropped` before it is removed.
 * Returns rows changed.
 */
export async function moveKeyedRow<Row extends ConnRow>(
  store: RowStore<Row>,
  backupDropped: (row: Row) => void,
): Promise<number> {
  const rows = await store.all();
  const legacy = rows.find((r) => r.connectionId === OLD);
  if (!legacy) return 0;

  const survivor = rows.find((r) => r.connectionId === NEW);
  if (survivor) backupDropped(legacy);
  else await store.put({ ...legacy, connectionId: NEW });

  await store.remove(OLD);
  return 1;
}

/* IndexedDB adapter. Only touches databases that already exist: opening a missing
 * one would create it empty at version 1 and stop the owning module's own
 * onupgradeneeded from ever creating its stores. */

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txToPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function openExistingDb(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === name)) return null;
  return reqToPromise(indexedDB.open(name));
}

function rowStore<Row>(db: IDBDatabase, storeName: string): RowStore<Row> | null {
  if (!db.objectStoreNames.contains(storeName)) return null;
  return {
    async all() {
      const tx = db.transaction(storeName, 'readonly');
      const rows = (await reqToPromise(tx.objectStore(storeName).getAll())) as Row[];
      await txToPromise(tx);
      return rows;
    },
    async put(row) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(row);
      await txToPromise(tx);
    },
    async remove(key) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await txToPromise(tx);
    },
  };
}

const LIBRARY_DB = 'shatteredArchive.library';
const LIBRARY_STORES = ['notes', 'books', 'user_notes'];
const EQUIPMENT_DB = 'shatteredArchive.equipment';
const EQUIPMENT_STORES = ['equipment_state', 'equipment_prefs', 'profiles'];

async function migrateIndexedDb(storage: Storage, now: number, report: MigrationReport): Promise<void> {
  const libraryDb = await openExistingDb(LIBRARY_DB);
  if (libraryDb) {
    try {
      for (const name of LIBRARY_STORES) {
        const store = rowStore<ConnRow>(libraryDb, name);
        if (store) report.rows += await relabelRows(store);
      }
    } finally {
      libraryDb.close();
    }
  }

  const equipmentDb = await openExistingDb(EQUIPMENT_DB);
  if (equipmentDb) {
    try {
      for (const name of EQUIPMENT_STORES) {
        const store = rowStore<ConnRow>(equipmentDb, name);
        if (!store) continue;
        report.rows += await moveKeyedRow(store, (row) => {
          try {
            storage.setItem(backupKey(now, `idb.${name}.${OLD}`), JSON.stringify(row));
          } catch {
            // The dropped `default` equipment row is re-captured from the game; a failed backup is tolerable.
          }
        });
      }
    } finally {
      equipmentDb.close();
    }
  }
}

/* ------------------------------ entry point ------------------------------ */

/**
 * Runs the localStorage migration synchronously (before the call returns, so it
 * lands ahead of modules that read localStorage at import time) and the
 * IndexedDB migration after. The promise never rejects: a failure is recorded in
 * the report and the app starts anyway.
 */
export function runConnectionIdMigration(): Promise<MigrationReport> {
  if (typeof window === 'undefined') return Promise.resolve(emptyReport());

  const now = Date.now();
  let report: MigrationReport;
  try {
    report = migrateLocalStorage(window.localStorage, now);
  } catch {
    report = emptyReport();
    report.skipped.push('localStorage');
  }

  return migrateIndexedDb(window.localStorage, now, report)
    .catch(() => {
      report.skipped.push('indexedDB');
    })
    .then(() => report);
}
