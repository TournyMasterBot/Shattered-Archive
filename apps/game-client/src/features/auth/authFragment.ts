// apps\game-client\src\features\auth\authFragment.ts
// Phase D: pure parser for the game-sso callback's URL fragment. Deliberately
// split out of gameSso.ts, which imports siteApi.ts's `import.meta.env` usage —
// this repo's Jest "client" project can't compile `import.meta` anywhere in a
// module's import graph (a pre-existing gap, not new to this file), so the one
// genuinely pure/testable piece lives on its own with zero such imports.

export type ParsedAuthFragment = { kind: 'token'; token: string; expiresAt: string } | { kind: 'error' } | { kind: 'none' };

/**
 * Parses `#auth_token=...&expires_at=...` (success) or `#auth_error=1`
 * (failure) off a URL fragment. Kept free of any DOM/env access so it's
 * testable without a browser.
 */
export function parseAuthFragment(hash: string): ParsedAuthFragment {
  if (!hash || hash === '#') return { kind: 'none' };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('auth_token');
  const expiresAt = params.get('expires_at');
  if (token && expiresAt) return { kind: 'token', token, expiresAt };
  if (params.get('auth_error')) return { kind: 'error' };
  return { kind: 'none' };
}
