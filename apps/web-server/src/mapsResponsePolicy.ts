// apps/web-server/src/mapsResponsePolicy.ts

/**
 * Cache and visibility policy for the /maps/* responses, kept free of the service bootstrap in
 * index.ts so it can be tested on its own.
 *
 * Why it exists (2026-11-13): the wizard was served a 31-class snapshot dated 2026-09-19 for weeks
 * because the upstream address was wrong inside the container, the snapshot answered quietly, and it
 * went out with a 30-day Cache-Control that browsers then kept. An offline answer is a stop-gap, so
 * it must never be cached by the browser and must be noticed once per process in the log.
 */

/** Browsers may keep a live (or recently cached upstream) answer; an offline snapshot is never kept. */
export function cacheControlFor(source: string, maxAgeSeconds: number): string {
  return source === 'offline' ? 'no-store' : `public, max-age=${maxAgeSeconds}`;
}

/**
 * Returns a function that logs one warning per endpoint the first time it falls back to the
 * snapshot, then stays quiet; it returns true only when it logged.
 */
export function createFallbackNotifier(
  warn: (message: string, meta: { endpoint: string }) => void,
): (endpoint: string) => boolean {
  const seen = new Set<string>();
  return (endpoint: string) => {
    if (seen.has(endpoint)) return false;
    seen.add(endpoint);
    warn('[web-server] upstream unreachable, serving offline snapshot', { endpoint });
    return true;
  };
}
