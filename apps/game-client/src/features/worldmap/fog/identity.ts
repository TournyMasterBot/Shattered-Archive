// apps/game-client/src/features/worldmap/fog/identity.ts
//
// Whose exploration is it? Fog of war keeps what an account has visited (the user level) and what each character of it has (the character
// level), per world. The account is told apart by an account id in the sign-in token WHEN the token carries one (a JWT, or the site's own
// `payload.signature` form: the payload's `sub`, `accountId`, `account` or `uid`; read only to key the local record, nothing is verified or
// sent). The site's device tokens are opaque, and then every page is one account called "local": the user level is then everything this
// browser has seen (a limit worth knowing; a real account id from the site is a prerequisite of the id-list sync, Phase 44). The character is the
// one the game last named (`window.__SA_IDENTITY__`, set by the identity plugin); before a name is known the character is empty, and a visit
// then counts for the account level only.

import { getToken } from '../../auth/authTokenStore';

export interface Scope {
  world: string;
  account: string;
  /** Empty while the game has not named the character yet. */
  character: string;
}

export const LOCAL_ACCOUNT = 'local';

const ACCOUNT_CLAIMS = ['sub', 'accountId', 'account', 'uid'] as const;

function claimsOf(segment: string): Record<string, unknown> | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json: unknown = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')));
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The account id the token carries in either payload position, or "local" for no token, an opaque one, or one that cannot be read. */
export function accountKeyOf(token: string | null | undefined): string {
  if (!token) return LOCAL_ACCOUNT;
  const parts = token.split('.');
  for (const segment of [parts[1], parts[0]]) {
    const claims = segment === undefined ? null : claimsOf(segment);
    for (const name of ACCOUNT_CLAIMS) {
      const value = claims?.[name];
      if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 120);
    }
  }
  return LOCAL_ACCOUNT;
}

export function characterNameNow(): string {
  const identity = (window as unknown as { __SA_IDENTITY__?: { characterName?: unknown } }).__SA_IDENTITY__;
  return typeof identity?.characterName === 'string' ? identity.characterName.trim().slice(0, 60) : '';
}

/** Who is playing in `world` right now. Reads the token and the identity each time it is called (neither is cached here). */
export function currentScope(world: string): Scope {
  return { world, account: accountKeyOf(getToken()?.token), character: characterNameNow() };
}
