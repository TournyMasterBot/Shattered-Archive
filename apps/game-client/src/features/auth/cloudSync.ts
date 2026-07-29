// apps\game-client\src\features\auth\cloudSync.ts
// Phase D: fetch wrappers for the C# site's per-account cloud storage
// (Server.Web.Public's UserContentController) — whole-collection GET/PUT,
// matching the shape these already have client-side (a single JSON array).
// A 401 means the stored token is missing/expired/revoked: clear it so the
// caller can fall back to a "please log in again" outcome rather than a crash.

import { siteApiBase } from './siteApi';
import { getToken, clearToken } from './authTokenStore';
import type { AnyUserScript } from '../userScripts/types';
import type { InstalledPluginRecord } from '../../hooks/usePlugins';

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
