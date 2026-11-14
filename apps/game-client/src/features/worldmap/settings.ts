// apps/game-client/src/features/worldmap/settings.ts
//
// What the map window remembers about how it draws: how many other floors are shown behind the current one, labels, and the fog of war (off by default).
// Kept in localStorage (one JSON object, every field checked on the way in: a missing or damaged one falls back to its default).

export type FloorsMode = 'this' | 'near' | 'all';
/** Fog of war: off shows everything; `user` shows only what any character of the account has explored; `character` only what the one being played has. */
export type FogMode = 'off' | 'user' | 'character';

export interface MapSettings {
  /** Other floors behind the current one: none, the nearest two above and below, or all (up to 8 away). */
  floors: FloorsMode;
  labels: boolean;
  fog: FogMode;
  /** A red "you are here" dot on the player's room, when the player's place on the map is known. */
  here: boolean;
}

export const SETTINGS_KEY = 'shatteredarchive:worldmap:settings:v1';
export const DEFAULT_SETTINGS: MapSettings = { floors: 'near', labels: true, fog: 'off', here: true };

/** How many floors above and below each mode draws (the renderer's `ghosts`). */
export const GHOSTS_BY_MODE: Readonly<Record<FloorsMode, number>> = { this: 0, near: 2, all: 8 };

export const FOG_LABELS: Readonly<Record<FogMode, string>> = {
  off: 'Off (show everything)',
  user: 'Rooms my account has visited',
  character: 'Rooms this character has visited',
};

export const FLOORS_LABELS: Readonly<Record<FloorsMode, string>> = {
  this: 'This floor only',
  near: 'Nearby floors (2 up and down)',
  all: 'All floors',
};

export function parseSettings(text: string | null): MapSettings {
  if (text === null) return DEFAULT_SETTINGS;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_SETTINGS;
  const v = value as Record<string, unknown>;
  return {
    floors: v.floors === 'this' || v.floors === 'near' || v.floors === 'all' ? v.floors : DEFAULT_SETTINGS.floors,
    labels: typeof v.labels === 'boolean' ? v.labels : DEFAULT_SETTINGS.labels,
    fog: v.fog === 'off' || v.fog === 'user' || v.fog === 'character' ? v.fog : DEFAULT_SETTINGS.fog,
    here: typeof v.here === 'boolean' ? v.here : DEFAULT_SETTINGS.here,
  };
}

export interface SettingsStore {
  get(): MapSettings;
  set(patch: Partial<MapSettings>): void;
  subscribe(listener: () => void): () => void;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** `storage`: omitted means the browser's localStorage, null means none (the choices then last until the page closes). */
export function createSettingsStore(storage?: StorageLike | null): SettingsStore {
  let backing: StorageLike | null = null;
  let read: string | null = null;
  try {
    // reading localStorage itself can throw in a browser that blocks it; so can getItem
    backing = storage === undefined ? window.localStorage : storage;
    read = backing?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    read = null;
  }
  let current = parseSettings(read);
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(patch) {
      // a patch value is checked like a stored one: nothing but the known choices gets in
      current = parseSettings(JSON.stringify({ ...current, ...patch }));
      try {
        backing?.setItem(SETTINGS_KEY, JSON.stringify(current));
      } catch {
        // storage refused: the choice lasts until the page closes
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

let shared: SettingsStore | null = null;

/** The page's one store, so every window shows the same choices. */
export function sharedSettings(): SettingsStore {
  shared ??= createSettingsStore();
  return shared;
}

/** Test-only: forget the shared store. */
export function __resetSharedSettingsForTests(): void {
  shared = null;
}
