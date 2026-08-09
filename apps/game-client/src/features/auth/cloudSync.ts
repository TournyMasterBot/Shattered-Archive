// apps\game-client\src\features\auth\cloudSync.ts
// Phase D: fetch wrappers for the C# site's per-account cloud storage
// (Server.Web.Public's UserContentController) — whole-collection GET/PUT,
// matching the shape these already have client-side (a single JSON array).
// A 401 means the stored token is missing/expired/revoked: clear it so the
// caller can fall back to a "please log in again" outcome rather than a crash.

import { siteApiBase } from './siteApi';
import { getToken, clearToken } from './authTokenStore';
import type { AnyUserScript } from '../userScripts/types';
import type { GlobalScriptBucket } from '../userScripts/globalScriptsStore';
import type { InstalledPluginRecord } from '../../hooks/usePlugins';
import type { LibraryNote, UserNote, LibraryBook } from '../library/library-types';

export type CloudSyncResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

async function authedRequest<T>(path: string, init?: RequestInit): Promise<CloudSyncResult<T>> {
  const stored = getToken();
  if (!stored) return { kind: 'unauthenticated' };

  let res: Response;
  try {
    res = await fetch(`${siteApiBase()}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${stored.token}` },
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (res.status === 401) {
    clearToken();
    return { kind: 'unauthenticated' };
  }

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    return { kind: 'error', message };
  }

  if (res.status === 204) return { kind: 'ok', data: undefined as T };

  const data = (await res.json()) as T;
  return { kind: 'ok', data };
}

export function loadScripts(): Promise<CloudSyncResult<AnyUserScript[]>> {
  return authedRequest('/api/user-content/scripts');
}

export function saveScripts(scripts: AnyUserScript[]): Promise<CloudSyncResult<{ count: number }>> {
  return authedRequest('/api/user-content/scripts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scripts),
  });
}

export function loadGlobalScripts(): Promise<CloudSyncResult<GlobalScriptBucket[]>> {
  return authedRequest('/api/user-content/global-scripts');
}

export function saveGlobalScripts(buckets: GlobalScriptBucket[]): Promise<CloudSyncResult<{ count: number }>> {
  return authedRequest('/api/user-content/global-scripts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buckets),
  });
}

export function loadPluginConfigs(): Promise<CloudSyncResult<InstalledPluginRecord[]>> {
  return authedRequest('/api/user-content/plugin-configs');
}

export function savePluginConfigs(configs: InstalledPluginRecord[]): Promise<CloudSyncResult<{ count: number }>> {
  return authedRequest('/api/user-content/plugin-configs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs),
  });
}

// Phase E: item-level Library-content sync (parchment/notes/books) against
// LibraryController's `library/my-writings/*` endpoints — a DIFFERENT base path than
// the api/user-content/* calls above (both go through the same siteApiBase()/proxy, no
// special handling needed). Unlike scripts/plugin-configs this is per-item PUT/DELETE,
// not a whole-collection PUT — see librarySync.ts for the diff/upsert orchestration and
// the connectionId-scoping rule that makes per-item deletes safe. Cloud rows may have no
// connectionId (mobile- or My-Writings-web-page-created); the local types require one
// (each connection keeps its own IndexedDB slice), so the wire shape here is the local
// type with connectionId loosened to optional, not the local type itself.
export type CloudLibraryNote = Omit<LibraryNote, 'connectionId'> & { connectionId?: string };
export type CloudUserNote = Omit<UserNote, 'connectionId'> & { connectionId?: string };
export type CloudLibraryBook = Omit<LibraryBook, 'connectionId'> & { connectionId?: string };

export function loadParchmentCloud(): Promise<CloudSyncResult<CloudLibraryNote[]>> {
  return authedRequest('/library/my-writings/parchment');
}

export function upsertParchmentCloud(item: LibraryNote): Promise<CloudSyncResult<{ id: string }>> {
  return authedRequest(`/library/my-writings/parchment/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export function deleteParchmentCloud(id: string): Promise<CloudSyncResult<void>> {
  return authedRequest(`/library/my-writings/parchment/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function loadUserNotesCloud(): Promise<CloudSyncResult<CloudUserNote[]>> {
  return authedRequest('/library/my-writings/notes');
}

export function upsertUserNoteCloud(item: UserNote): Promise<CloudSyncResult<{ id: string }>> {
  return authedRequest(`/library/my-writings/notes/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export function deleteUserNoteCloud(id: string): Promise<CloudSyncResult<void>> {
  return authedRequest(`/library/my-writings/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function loadLibraryBooksCloud(): Promise<CloudSyncResult<CloudLibraryBook[]>> {
  return authedRequest('/library/my-writings/books');
}

export function upsertLibraryBookCloud(item: LibraryBook): Promise<CloudSyncResult<{ id: string }>> {
  return authedRequest(`/library/my-writings/books/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export function deleteLibraryBookCloud(id: string): Promise<CloudSyncResult<void>> {
  return authedRequest(`/library/my-writings/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
