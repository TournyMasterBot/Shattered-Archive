import type { RoomState } from '../domain/types.js';

/**
 * All of Soulsteel's game data lives here — one IndexedDB object store, keyed by room GUID, no
 * server round-trip involved (see the MVP plan's Constraints: no server-side persistence in
 * Phase 1). A room id is a client-generated workspace identifier, not a server-brokered
 * multiplayer session, so there is nothing to reconcile across devices here — this is local,
 * per-browser storage for a single Herald.
 */

const DB_NAME = 'soulsteel';
const DB_VERSION = 1;
const STORE_NAME = 'rooms';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('failed to open the soulsteel IndexedDB'));
  });
}

export async function saveRoom(room: RoomState): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(room);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('failed to save the room'));
    });
  } finally {
    db.close();
  }
}

export async function loadRoom(id: string): Promise<RoomState | undefined> {
  const db = await openDb();
  try {
    return await new Promise<RoomState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as RoomState | undefined);
      req.onerror = () => reject(req.error ?? new Error('failed to load the room'));
    });
  } finally {
    db.close();
  }
}

export async function deleteRoom(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('failed to delete the room'));
    });
  } finally {
    db.close();
  }
}

export interface RoomSummary {
  id: string;
  updatedAt: string;
  dayNumber: number;
  playerCount: number;
}

/** Newest-first list for the Landing page's "Resume" list. A herald keeps a handful of games at
 * most, so reading the full records and projecting client-side is simpler than a second index
 * and cheap enough at this scale. */
export async function listRoomSummaries(): Promise<RoomSummary[]> {
  const db = await openDb();
  try {
    const rooms = await new Promise<RoomState[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as RoomState[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('failed to list rooms'));
    });
    return rooms
      .map((r) => ({ id: r.id, updatedAt: r.updatedAt, dayNumber: r.dayNumber, playerCount: r.players.length }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } finally {
    db.close();
  }
}
