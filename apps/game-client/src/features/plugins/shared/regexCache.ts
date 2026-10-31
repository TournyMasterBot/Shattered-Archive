// apps/game-client/src/features/plugins/shared/regexCache.ts
//
// Plugin pattern lists are tested against every received line. Building a RegExp per
// pattern per line (what text-to-speech did) allocated and recompiled the same
// expressions thousands of times a minute during combat; each distinct pattern is now
// compiled once. Mirrors the mobile app's compiledPattern cache.

/** Bounded so a user who keeps editing patterns cannot grow it forever; cleared wholesale when full. */
export const REGEX_CACHE_MAX = 200;

const cache = new Map<string, RegExp | null>();

/** The compiled pattern, or null when it is not a valid regular expression. Never use `g`/`y` flags (stateful). */
export function compileCached(pattern: string, flags = 'i'): RegExp | null {
  const key = `${flags}/${pattern}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let re: RegExp | null;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = null;
  }
  if (cache.size >= REGEX_CACHE_MAX) cache.clear();
  cache.set(key, re);
  return re;
}

/**
 * True when any pattern matches `text`. Each pattern is tried as a case-insensitive
 * regex; one that does not compile falls back to a literal, case-insensitive substring
 * test, so an unbalanced paren still behaves like plain text.
 */
export function matchesAnyPattern(text: string, patterns: readonly string[]): boolean {
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const re = compileCached(p);
    if (re !== null ? re.test(text) : text.toLowerCase().includes(p.toLowerCase())) return true;
  }
  return false;
}
