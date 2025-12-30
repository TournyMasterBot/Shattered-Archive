// apps\game-client\src\features\equipment\equipment-idb.ts
import type { EquipmentProfile } from './equipment-types';

const DB_NAME = 'shatteredArchive.equipment';
const DB_VERSION = 1;

const STORE_PROFILES = 'profiles';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        const s = db.createObjectStore(STORE_PROFILES, { keyPath: 'connectionId' });
        s.createIndex('by_connection', 'connectionId', { unique: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadEquipmentProfile(connectionId: string): Promise<EquipmentProfile> {
  const db = await openDb();
  const tx = db.transaction(STORE_PROFILES, 'readonly');
  const store = tx.objectStore(STORE_PROFILES);

  const req = store.get(connectionId);

  const row = await new Promise<unknown>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  await txDone(tx);

  if (isRecord(row)) {
    const aliases = isRecord(row.aliases) ? (row.aliases as Record<string, string>) : {};
    const sets = Array.isArray(row.sets) ? (row.sets as any[]) : [];
    const snapshot = isRecord(row.snapshot) ? (row.snapshot as any) : undefined;
    const activeSetId = typeof row.activeSetId === 'string' ? row.activeSetId : undefined;

    return {
      connectionId,
      aliases: aliases as any,
      sets: sets as any,
      snapshot: snapshot as any,
      activeSetId,
    };
  }

  // default profile
  return {
    connectionId,
    aliases: {},
    sets: [],
    snapshot: undefined,
    activeSetId: undefined,
  };
}

export async function saveEquipmentProfile(profile: EquipmentProfile): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PROFILES, 'readwrite');
  tx.objectStore(STORE_PROFILES).put(profile);
  await txDone(tx);
}
