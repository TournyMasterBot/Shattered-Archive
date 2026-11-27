import { isAllowedExtraHost, normalizeHost, type ReadableStorage } from './connectionGate';

/** The local-only vhost that serves the read-only world data (docs/game/simulacrum-admin.md, "World data"). */
export const DEFAULT_WORLD_BASE = 'https://simulacrum-admin.shatteredarchive.dev';

/** localStorage key for the owner's override of the base address (an origin only). */
export const WORLD_BASE_STORAGE_KEY = 'simulacrumAdmin.world.base';

/**
 * A base address as a bare origin (`https://host` or `http://host:port`): a path, query, fragment or credentials are refused, and the
 * host must be the local machine, a private network address or the dev domain, the same rule as the host additions (LOCAL-05), so a
 * stored value cannot point the panel's requests at a public server. Returns the normalised origin, or `undefined`.
 */
export function normalizeWorldBase(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') return undefined;
  const host = normalizeHost(url.hostname);
  if (host === undefined || !isAllowedExtraHost(host)) return undefined;
  return url.origin;
}

/** The address from a window's storage; a browser that blocks storage (reading the property throws) gets the default. */
export function readWorldBaseFrom(win: { readonly localStorage: Storage }): string {
  let storage: Storage | undefined;
  try {
    storage = win.localStorage;
  } catch {
    storage = undefined;
  }
  return readWorldBase(storage);
}

/** The address to read the world from: the stored override when valid, else the default. A bad or blocked value is ignored with one fixed warning. */
export function readWorldBase(storage: ReadableStorage | undefined): string {
  if (!storage) return DEFAULT_WORLD_BASE;
  try {
    const stored = storage.getItem(WORLD_BASE_STORAGE_KEY);
    if (stored === null) return DEFAULT_WORLD_BASE;
    const base = normalizeWorldBase(stored);
    if (base === undefined) {
      console.warn('[simulacrum-admin] the stored world address is not an allowed local address and was ignored');
      return DEFAULT_WORLD_BASE;
    }
    return base;
  } catch {
    console.warn('[simulacrum-admin] could not read the stored world address');
    return DEFAULT_WORLD_BASE;
  }
}
