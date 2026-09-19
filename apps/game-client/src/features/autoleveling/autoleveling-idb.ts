// apps/game-client/src/features/autoleveling/autoleveling-idb.ts

/**
 * Tiny async key/value store used by the auto-leveling area cache and the
 * user-data store. The default implementation is IndexedDB (matching
 * autoleveling-maps-client.ts); `memoryKvStore()` is a drop-in for tests and
 * for environments without IndexedDB.
 */

export interface KvStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

type KvRecord = { key: string; value: unknown; updatedAt: number };

/* ----------------------------- IndexedDB impl ----------------------------- */

function openDb(dbName: string, storeName: string, version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export function indexedDbKvStore(dbName: string, storeName: string): KvStore {
  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb(dbName, storeName);
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  };

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const rec = await withStore<KvRecord | undefined>('readonly', (s) => s.get(key));
        return (rec?.value as T) ?? null;
      } catch {
        return null;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      try {
        await withStore('readwrite', (s) => s.put({ key, value, updatedAt: Date.now() } satisfies KvRecord));
      } catch {
        // ignore quota / private-mode errors
      }
    },
    async delete(key: string): Promise<void> {
      try {
        await withStore('readwrite', (s) => s.delete(key));
      } catch {
        // ignore
      }
    },
    async keys(): Promise<string[]> {
      try {
        const keys = await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
        return keys.map((k) => String(k));
      } catch {
        return [];
      }
    },
  };
}

/* ------------------------------- memory impl ------------------------------ */

export function memoryKvStore(seed?: Record<string, unknown>): KvStore {
  const map = new Map<string, unknown>(Object.entries(seed ?? {}));
  return {
    async get<T>(key: string) {
      return (map.has(key) ? (map.get(key) as T) : null);
    },
    async set(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

/** True when IndexedDB is usable in this environment. */
export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
