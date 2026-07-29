/**
 * Phase F: fetch wrappers for kt-server's per-account HTTP surface (match history, replay,
 * army layouts). A 401 means the stored token is missing/expired/revoked: clear it so the
 * caller can fall back to a "please log in again" outcome rather than a crash — mirrors
 * game-client's `cloudSync.ts` (Phase D) shape.
 */
import type { MatchState } from '@shatteredarchive/kingdom-tactics-engine';
import { siteApiBase } from './kt-auth-config';
import { getToken, clearToken } from './authTokenStore';
import type { SavedArmy } from '../../state/saved-armies';

export interface MatchHistorySummary {
  readonly id: string;
  readonly matchId: string;
  readonly playedAt: string;
  readonly participants: readonly { readonly side: number; readonly accountId: string | null }[];
  readonly winner: number | 'draw';
}

export interface ReplayResult {
  readonly matchId: string;
  readonly snapshots: readonly MatchState[];
}

export type CloudSyncResult<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'error'; readonly message: string };

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

  const data = (await res.json()) as T;
  return { kind: 'ok', data };
}

export function loadMatchHistory(): Promise<CloudSyncResult<MatchHistorySummary[]>> {
  return authedRequest('/api/kt/match-history');
}

export function loadReplay(id: string): Promise<CloudSyncResult<ReplayResult>> {
  return authedRequest(`/api/kt/match-history/${encodeURIComponent(id)}/replay`);
}

export function loadArmyLayouts(): Promise<CloudSyncResult<SavedArmy[]>> {
  return authedRequest('/api/kt/army-layouts');
}

export function saveArmyLayouts(armies: readonly SavedArmy[]): Promise<CloudSyncResult<{ count: number }>> {
  return authedRequest('/api/kt/army-layouts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(armies),
  });
}
