// apps/game-client/src/features/equipment/equipment-store.ts
import type {
  EquipmentPreferences,
  EquipmentSlot,
  EquipmentSlotState,
  EquipmentState,
  EquipmentSnapshot,
  EquipmentProfile,
  HotbarDockMode,
  EqSlot,
} from './equipment-types';

const LS_KEY_STATE = 'shatteredArchive.equipment.state.v1';
const LS_KEY_PREFS = 'shatteredArchive.equipment.prefs.v1';
const LS_KEY_PROFILE = 'shatteredArchive.equipment.profile.v1';

const DB_NAME = 'shatteredArchive.equipment';
const DB_VERSION = 2;

const STORE_STATE = 'equipment_state';
const STORE_PREFS = 'equipment_prefs';
const STORE_PROFILES = 'profiles';

function now() {
  return Date.now();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function emptySlots(): EquipmentState['slots'] {
  return {
    wielded: null,
    secondary: null,
    shield: null,
    sheathed: null,
  };
}

/* ---------------- LocalStorage ---------------- */

function readAllStateFromLS(): Record<string, EquipmentState> {
  const parsed = safeJsonParse<Record<string, EquipmentState>>(window.localStorage.getItem(LS_KEY_STATE));
  return parsed && isRecord(parsed) ? (parsed as Record<string, EquipmentState>) : {};
}

function writeAllStateToLS(all: Record<string, EquipmentState>) {
  try {
    window.localStorage.setItem(LS_KEY_STATE, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function readAllPrefsFromLS(): Record<string, EquipmentPreferences> {
  const parsed = safeJsonParse<Record<string, EquipmentPreferences>>(window.localStorage.getItem(LS_KEY_PREFS));
  return parsed && isRecord(parsed) ? (parsed as Record<string, EquipmentPreferences>) : {};
}

function writeAllPrefsToLS(all: Record<string, EquipmentPreferences>) {
  try {
    window.localStorage.setItem(LS_KEY_PREFS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function readAllProfilesFromLS(): Record<string, EquipmentProfile> {
  const parsed = safeJsonParse<Record<string, EquipmentProfile>>(window.localStorage.getItem(LS_KEY_PROFILE));
  return parsed && isRecord(parsed) ? (parsed as Record<string, EquipmentProfile>) : {};
}

function writeAllProfilesToLS(all: Record<string, EquipmentProfile>) {
  try {
    window.localStorage.setItem(LS_KEY_PROFILE, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/* ---------------- IndexedDB ---------------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'connectionId' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'connectionId' });
      }
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

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);

  const req = store.get(key);
  const row = await new Promise<T | null>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result ?? null) as T | null);
    req.onerror = () => reject(req.error);
  });

  await txDone(tx);
  return row;
}

async function idbPut<T>(storeName: string, row: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(row as any);
  await txDone(tx);
}

/* ---------------- In-memory + subscriptions ---------------- */

type Listener = () => void;

const mem = {
  stateByConn: typeof window !== 'undefined' ? readAllStateFromLS() : ({} as Record<string, EquipmentState>),
  prefsByConn: typeof window !== 'undefined' ? readAllPrefsFromLS() : ({} as Record<string, EquipmentPreferences>),
  profileByConn: typeof window !== 'undefined' ? readAllProfilesFromLS() : ({} as Record<string, EquipmentProfile>),
  listeners: new Set<Listener>(),
};

function emit() {
  for (const fn of mem.listeners) fn();
}

export function subscribeEquipment(fn: Listener): () => void {
  mem.listeners.add(fn);
  return () => mem.listeners.delete(fn);
}

/* ---------------- Getters ---------------- */

export function getEquipmentState(connectionId: string): EquipmentState {
  const existing = mem.stateByConn[connectionId];
  if (existing) return existing;

  const fresh: EquipmentState = {
    connectionId,
    slots: emptySlots(),
  };
  mem.stateByConn[connectionId] = fresh;
  writeAllStateToLS(mem.stateByConn);
  return fresh;
}

export function getEquipmentPrefs(connectionId: string): EquipmentPreferences {
  const existing = mem.prefsByConn[connectionId];
  if (existing) return existing;

  const fresh: EquipmentPreferences = {
    connectionId,
    hotbarDockMode: 'docked',
  };
  mem.prefsByConn[connectionId] = fresh;
  writeAllPrefsToLS(mem.prefsByConn);
  return fresh;
}

export function getEquipmentProfile(connectionId: string): EquipmentProfile {
  const existing = mem.profileByConn[connectionId];
  if (existing) return existing;

  const fresh: EquipmentProfile = {
    connectionId,
    aliases: {},
    sets: [],
    snapshot: undefined,
    activeSetId: undefined,
  };
  mem.profileByConn[connectionId] = fresh;
  writeAllProfilesToLS(mem.profileByConn);
  return fresh;
}

/* ---------------- Hydration ---------------- */

export async function hydrateEquipment(connectionId: string): Promise<void> {
  // state
  try {
    const row = await idbGet<EquipmentState>(STORE_STATE, connectionId);
    if (row) {
      mem.stateByConn[connectionId] = normalizeState(row);
      writeAllStateToLS(mem.stateByConn);
      emit();
    }
  } catch {
    // ignore
  }

  // prefs
  try {
    const row = await idbGet<EquipmentPreferences>(STORE_PREFS, connectionId);
    if (row) {
      mem.prefsByConn[connectionId] = normalizePrefs(row);
      writeAllPrefsToLS(mem.prefsByConn);
      emit();
    }
  } catch {
    // ignore
  }

  // profile
  try {
    const row = await idbGet<EquipmentProfile>(STORE_PROFILES, connectionId);
    if (row) {
      mem.profileByConn[connectionId] = normalizeProfile(row);
      writeAllProfilesToLS(mem.profileByConn);
      emit();
    }
  } catch {
    // ignore
  }
}

function normalizeState(input: EquipmentState): EquipmentState {
  const slots = input?.slots ?? ({} as any);

  const normSlot = (slot: EquipmentSlot): EquipmentSlotState | null => {
    const s = slots?.[slot] as any;
    if (!s || typeof s.text !== 'string') return null;

    return {
      slot,
      text: s.text,
      updatedAt: Number.isFinite(s.updatedAt) ? Number(s.updatedAt) : now(),
      dirty: !!s.dirty,
    };
  };

  return {
    connectionId: String(input.connectionId ?? 'default'),
    lastEqAt: Number.isFinite(input.lastEqAt) ? Number(input.lastEqAt) : undefined,
    slots: {
      wielded: normSlot('wielded'),
      secondary: normSlot('secondary'),
      shield: normSlot('shield'),
      sheathed: normSlot('sheathed'),
    },
  };
}

function normalizePrefs(input: EquipmentPreferences): EquipmentPreferences {
  const mode = input?.hotbarDockMode;
  const hotbarDockMode: HotbarDockMode = mode === 'floating' ? 'floating' : 'docked';

  return {
    connectionId: String(input.connectionId ?? 'default'),
    hotbarDockMode,
  };
}

function normalizeProfile(input: EquipmentProfile): EquipmentProfile {
  return {
    connectionId: String(input.connectionId ?? 'default'),
    aliases: isRecord(input.aliases) ? (input.aliases as Record<string, string>) : {},
    sets: Array.isArray(input.sets) ? input.sets : [],
    snapshot: isRecord(input.snapshot) ? (input.snapshot as any as EquipmentSnapshot) : undefined,
    activeSetId: typeof input.activeSetId === 'string' ? input.activeSetId : undefined,
  };
}

/* ---------------- Mutations ---------------- */

export async function setEquipmentFromEq(
  connectionId: string,
  slots: Partial<Record<EquipmentSlot, string>>,
): Promise<void> {
  const prev = getEquipmentState(connectionId);
  const ts = now();

  const nextSlots: EquipmentState['slots'] = { ...prev.slots };

  const apply = (slot: EquipmentSlot) => {
    // IMPORTANT: "(nothing)" should remain a literal string if caller sends it.
    const raw = String(slots[slot] ?? '');
    const text = raw.trim();

    if (!text) {
      nextSlots[slot] = null;
      return;
    }

    nextSlots[slot] = {
      slot,
      text,
      updatedAt: ts,
      dirty: false,
    };
  };

  apply('wielded');
  apply('secondary');
  apply('shield');
  apply('sheathed');

  const next: EquipmentState = {
    connectionId,
    slots: nextSlots,
    lastEqAt: ts,
  };

  mem.stateByConn[connectionId] = next;
  writeAllStateToLS(mem.stateByConn);
  emit();

  try {
    await idbPut(STORE_STATE, next);
  } catch {
    // ignore
  }
}

export async function setEqSnapshot(connectionId: string, snapshot: EquipmentSnapshot): Promise<void> {
  const prev = getEquipmentProfile(connectionId);

  const next: EquipmentProfile = {
    ...prev,
    connectionId,
    snapshot,
  };

  mem.profileByConn[connectionId] = next;
  writeAllProfilesToLS(mem.profileByConn);
  emit();

  try {
    await idbPut(STORE_PROFILES, next);
  } catch {
    // ignore
  }
}

/**
 * Incrementally update the "full gear" snapshot from non-eq text (wear/wield/disarm/etc).
 * - If rawLine is null, that slot is removed from the snapshot.
 * - This does not attempt to rebuild allLines perfectly; the modal can render from slots if desired.
 */
export async function applyEqSnapshotDelta(connectionId: string, eqSlot: EqSlot, rawLine: string | null): Promise<void> {
  const prev = getEquipmentProfile(connectionId);
  const prevSnap = prev.snapshot;

  const ts = now();

  const nextSlots: any = { ...(prevSnap?.slots ?? {}) };

  if (!rawLine) {
    delete nextSlots[eqSlot];
  } else {
    nextSlots[eqSlot] = {
      slot: eqSlot,
      rawLine,
      updatedAt: ts,
    };
  }

  const nextSnap: EquipmentSnapshot = {
    updatedAt: ts,
    slots: nextSlots,
    // keep prior allLines if present; optional (UI can render from slots instead)
    allLines: prevSnap?.allLines ?? [],
  };

  await setEqSnapshot(connectionId, nextSnap);
}

export async function setSlotOptimistic(connectionId: string, slot: EquipmentSlot, text: string | null): Promise<void> {
  const prev = getEquipmentState(connectionId);
  const ts = now();

  const nextSlots: EquipmentState['slots'] = { ...prev.slots };

  const t = String(text ?? '').trim();
  if (!t) {
    nextSlots[slot] = null;
  } else {
    nextSlots[slot] = {
      slot,
      text: t,
      updatedAt: ts,
      dirty: true,
    };
  }

  const next: EquipmentState = { ...prev, slots: nextSlots };
  mem.stateByConn[connectionId] = next;
  writeAllStateToLS(mem.stateByConn);
  emit();

  try {
    await idbPut(STORE_STATE, next);
  } catch {
    // ignore
  }
}

export async function setHotbarDockMode(connectionId: string, mode: HotbarDockMode): Promise<void> {
  const prev = getEquipmentPrefs(connectionId);
  const next: EquipmentPreferences = { ...prev, hotbarDockMode: mode };

  mem.prefsByConn[connectionId] = next;
  writeAllPrefsToLS(mem.prefsByConn);
  emit();

  try {
    await idbPut(STORE_PREFS, next);
  } catch {
    // ignore
  }
}
