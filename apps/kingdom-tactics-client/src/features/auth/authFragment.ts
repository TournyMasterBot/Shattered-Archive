/**
 * Phase F: pure parser for the kt-sso callback's URL fragment
 * (`#auth_token=...&expires_at=...` on success, `#auth_error=1` on failure). Deliberately free
 * of `import.meta` (unlike `kt-auth-config.ts`) so it needs no jest stub-swap — the one
 * genuinely testable piece of this flow.
 */

export type ParsedAuthFragment =
  | { readonly kind: 'token'; readonly token: string; readonly expiresAt: string }
  | { readonly kind: 'error' }
  | { readonly kind: 'none' };

export function parseAuthFragment(hash: string): ParsedAuthFragment {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { kind: 'none' };

  const params = new URLSearchParams(raw);
  if (params.get('auth_error') === '1') return { kind: 'error' };

  const token = params.get('auth_token');
  const expiresAt = params.get('expires_at');
  if (token && expiresAt) return { kind: 'token', token, expiresAt };

  return { kind: 'none' };
}
