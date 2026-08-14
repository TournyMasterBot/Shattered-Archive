import { useEffect, useState } from 'react';

/**
 * AI-ANNOTATION
 * @ai-summary `?returnTo=` support for the login page: an app that needs a hub session sends
 *   the user here, and once signed in they are sent straight back. This is what makes the
 *   other apps' sign-in feel like one step — the user only ever manages the auth.* login.
 * @ai-public useReturnTo, parseReturnTo
 * @ai-notes The destination is validated against auth-server's OWN configured device origins
 *   (GET /api/device/origins), never against a list kept here. Two reasons: an unvalidated
 *   returnTo is a textbook open redirect (a phishing page reached via a real, trusted login
 *   URL), and a second hand-maintained allowlist would drift from the one that actually
 *   governs enrollment. Failing to fetch the list means NO redirect — the user lands on the
 *   account page, which is a harmless outcome, whereas guessing would not be.
 */

/** Same-origin: auth-client is served by auth-server's own host in every deployment. */
const ORIGINS_URL = '/api/device/origins';

/**
 * Validates a candidate destination against the allowed origins.
 *
 * Exported for its own tests: it holds the security-relevant decision, and a relative URL, a
 * scheme change, or a lookalike host must all be rejected on their own evidence.
 */
export function parseReturnTo(raw: string | null, allowedOrigins: string[]): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    // Absolute only. A relative value would resolve against the hub's own origin and is never
    // what a returning app wants, so there is no reason to accept the ambiguity.
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // Exact origin match — scheme, host AND port. A substring or endsWith check here is the
  // classic open-redirect bug (evil-build.shatteredarchive.dev.attacker.test would pass one).
  if (!allowedOrigins.includes(url.origin)) return null;
  return url.toString();
}

export interface ReturnTo {
  /** Validated destination, or null when there is none or it was refused. */
  url: string | null;
  /** True until the allowlist has been fetched, so callers do not redirect prematurely. */
  loading: boolean;
}

export function useReturnTo(search: string = window.location.search): ReturnTo {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = new URLSearchParams(search).get('returnTo');
    if (!raw) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(ORIGINS_URL, { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { origins?: string[] };
        if (!cancelled) setUrl(parseReturnTo(raw, body.origins ?? []));
      } catch {
        // No allowlist means no way to tell a legitimate destination from a hostile one.
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  return { url, loading };
}
