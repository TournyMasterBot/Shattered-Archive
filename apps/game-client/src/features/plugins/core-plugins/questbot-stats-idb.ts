// apps/game-client/src/features/plugins/core-plugins/questbot-stats-idb.ts
//
// IndexedDB persistence for QuestBot session, all-time, and per-area stats.
// Stores running aggregates (count + sums) rather than individual records so
// the database stays bounded regardless of how long the bot runs.

const DB_NAME = 'shatteredArchive.questbot';
const DB_VERSION = 1;

const STORE_SESSIONS = 'sessions';
const STORE_ALLTIME = 'alltime';
const STORE_AREAS = 'areas';

const ALLTIME_KEY = 'stats';
const MAX_SESSIONS = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionRecord = {
  startedAt: number; // keyPath — ms since epoch
  endedAt: number; // 0 while still active
  questCount: number;
  totalQp: number;
  totalGold: number;
  totalQuestMs: number; // sum of individual quest durations (assignment → turn-in)
};

export type AllTimeRecord = {
  questCount: number;
  totalQp: number;
  totalGold: number;
  totalQuestMs: number;
  sessionCount: number;
  firstQuestAt: number;
};

export type AreaRecord = {
  name: string; // keyPath — quest area name as assigned by the quest master
  questCount: number;
  totalQp: number;
  totalGold: number;
  totalQuestMs: number;
  lastSeenAt: number;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'startedAt' });
      }
      if (!db.objectStoreNames.contains(STORE_ALLTIME)) {
        db.createObjectStore(STORE_ALLTIME);
      }
      if (!db.objectStoreNames.contains(STORE_AREAS)) {
        db.createObjectStore(STORE_AREAS, { keyPath: 'name' });
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

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(undefined);
  });
}

// ── Exported API ──────────────────────────────────────────────────────────────

/**
 * Called once per completed quest. Persists the updated session snapshot and
 * increments the alltime and per-area aggregates by the delta values.
 */
export async function recordQuestCompletion(opts: {
  session: SessionRecord;
  qp: number;
  gold: number;
  durationMs: number;
  areaName: string | null;
}): Promise<void> {
  const db = await openDb();

  // 1. Upsert the current session snapshot
  {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(opts.session);
    await txDone(tx);
  }

  // 2. Read-modify-write the alltime record
  {
    const tx = db.transaction(STORE_ALLTIME, 'readwrite');
    const store = tx.objectStore(STORE_ALLTIME);
    const existing = await idbGet<AllTimeRecord>(store, ALLTIME_KEY);
    const at: AllTimeRecord = existing ?? {
      questCount: 0,
      totalQp: 0,
      totalGold: 0,
      totalQuestMs: 0,
      sessionCount: 0,
      firstQuestAt: 0,
    };
    at.questCount += 1;
    at.totalQp += opts.qp;
    at.totalGold += opts.gold;
    at.totalQuestMs += opts.durationMs;
    if (!at.firstQuestAt) at.firstQuestAt = Date.now();
    store.put(at, ALLTIME_KEY);
    await txDone(tx);
  }

  // 3. Read-modify-write the per-area record
  if (opts.areaName) {
    const tx = db.transaction(STORE_AREAS, 'readwrite');
    const store = tx.objectStore(STORE_AREAS);
    const existing = await idbGet<AreaRecord>(store, opts.areaName);
    const area: AreaRecord = existing ?? {
      name: opts.areaName,
      questCount: 0,
      totalQp: 0,
      totalGold: 0,
      totalQuestMs: 0,
      lastSeenAt: 0,
    };
    area.questCount += 1;
    area.totalQp += opts.qp;
    area.totalGold += opts.gold;
    area.totalQuestMs += opts.durationMs;
    area.lastSeenAt = Date.now();
    store.put(area);
    await txDone(tx);
  }
}

/**
 * Increments the alltime session counter. Called on pq start so disconnects
 * are counted even when pq stop is never reached.
 */
export async function incrementSessionCount(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_ALLTIME, 'readwrite');
  const store = tx.objectStore(STORE_ALLTIME);
  const existing = await idbGet<AllTimeRecord>(store, ALLTIME_KEY);
  const at: AllTimeRecord = existing ?? {
    questCount: 0,
    totalQp: 0,
    totalGold: 0,
    totalQuestMs: 0,
    sessionCount: 0,
    firstQuestAt: 0,
  };
  at.sessionCount += 1;
  store.put(at, ALLTIME_KEY);
  await txDone(tx);
}

/**
 * Marks the session ended and prunes sessions older than MAX_SESSIONS.
 * Only called when at least one quest was completed in the session.
 */
export async function finalizeSession(session: SessionRecord): Promise<void> {
  const db = await openDb();

  {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(session);
    await txDone(tx);
  }

  await pruneOldSessions(db);
}

export async function loadAllTime(): Promise<AllTimeRecord> {
  const db = await openDb();
  const tx = db.transaction(STORE_ALLTIME, 'readonly');
  const result = await idbGet<AllTimeRecord>(tx.objectStore(STORE_ALLTIME), ALLTIME_KEY);
  await txDone(tx);
  return (
    result ?? {
      questCount: 0,
      totalQp: 0,
      totalGold: 0,
      totalQuestMs: 0,
      sessionCount: 0,
      firstQuestAt: 0,
    }
  );
}

export async function loadRecentSessions(limit = 5): Promise<SessionRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_SESSIONS, 'readonly');
  const req = tx.objectStore(STORE_SESSIONS).getAll();
  const all = await new Promise<SessionRecord[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result ?? []) as SessionRecord[]);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  all.sort((a, b) => b.startedAt - a.startedAt);
  return all.slice(0, limit);
}

export async function loadAllAreaStats(): Promise<AreaRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_AREAS, 'readonly');
  const req = tx.objectStore(STORE_AREAS).getAll();
  const all = await new Promise<AreaRecord[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result ?? []) as AreaRecord[]);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  all.sort((a, b) => b.questCount - a.questCount);
  return all;
}

export async function resetStats(): Promise<void> {
  const db = await openDb();
  for (const storeName of [STORE_SESSIONS, STORE_ALLTIME, STORE_AREAS]) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    await txDone(tx);
  }
}

async function pruneOldSessions(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE_SESSIONS, 'readwrite');
  const store = tx.objectStore(STORE_SESSIONS);
  const req = store.getAll();
  const all = await new Promise<SessionRecord[]>((resolve) => {
    req.onsuccess = () => resolve((req.result ?? []) as SessionRecord[]);
    req.onerror = () => resolve([]);
  });
  if (all.length > MAX_SESSIONS) {
    all.sort((a, b) => a.startedAt - b.startedAt);
    for (const s of all.slice(0, all.length - MAX_SESSIONS)) {
      store.delete(s.startedAt);
    }
  }
  await txDone(tx);
}
