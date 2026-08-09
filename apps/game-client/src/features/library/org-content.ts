// apps/game-client/src/features/library/org-content.ts
// Organizations Phase 2 Step 5 — API client for the game-client Organizations tab.
// Structurally mirrors ../auth/cloudSync.ts's authedRequest pattern (Bearer token,
// same three-state result shape) rather than librarySync.ts's diff/push
// orchestration: org content has no local IndexedDB mirror to reconcile against
// (see the plan doc's Step 5 progress-log entry for why — multi-writer shared
// data with a rotating per-org encryption key makes a local cache a staleness
// bug generator, not a feature), so every read is a live fetch.

import { getToken, clearToken } from '../auth/authTokenStore';
import { siteApiBase } from '../auth/siteApi';
import type { OrgSummary, OrgDetail, OrgContentType, OrgContentItem } from './org-content-types';

export type OrgApiResult<T> = { kind: 'ok'; data: T } | { kind: 'unauthenticated' } | { kind: 'error'; message: string };

async function authedRequest<T>(path: string, init?: RequestInit): Promise<OrgApiResult<T>> {
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

export function listMyOrganizations(): Promise<OrgApiResult<OrgSummary[]>> {
  return authedRequest('/library/organizations');
}

export function getOrganization(orgId: string): Promise<OrgApiResult<OrgDetail>> {
  return authedRequest(`/library/organizations/${encodeURIComponent(orgId)}`);
}

// No listCharacters/createCharacter here — Step 5's scope is content browsing
// within orgs the player already belongs to. Every such org's OrgDetail already
// carries myCharacterMemberships (the exact characters usable as "acting as"
// here), and joining an org at all requires picking a character via the web
// dashboard first, so this pane never needs its own character-management calls.

export function listOrgContent(orgId: string, type: OrgContentType): Promise<OrgApiResult<OrgContentItem[]>> {
  return authedRequest(`/library/organizations/${encodeURIComponent(orgId)}/content/${type}`);
}

export interface SaveOrgContentResult {
  id: string;
  authorCharacterId: string;
  authorCharacterName: string;
  revisionNumber: number;
}

/**
 * `characterId` is a CONTROL field, not stored content — the server strips it out
 * and uses it purely to check the acting character's role and to stamp
 * authorCharacterId/authorCharacterName. Pass null only when the caller is
 * relying on an account-level admin grant or service-Admin override (no
 * character at all) — see OrgDetail.myAccountRole / viaServiceAdminOverride.
 */
export function saveOrgContent(
  orgId: string,
  type: OrgContentType,
  id: string,
  item: Omit<OrgContentItem, 'id' | 'authorCharacterId' | 'authorCharacterName'>,
  characterId: string | null,
): Promise<OrgApiResult<SaveOrgContentResult>> {
  return authedRequest(`/library/organizations/${encodeURIComponent(orgId)}/content/${type}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, characterId: characterId ?? undefined }),
  });
}

export function deleteOrgContent(
  orgId: string,
  type: OrgContentType,
  id: string,
  characterId: string | null,
): Promise<OrgApiResult<void>> {
  const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
  return authedRequest(`/library/organizations/${encodeURIComponent(orgId)}/content/${type}/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
  });
}
