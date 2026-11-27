// apps/game-client/src/features/connection/connectionId.ts

/**
 * The one connection id the DSL game and the not-yet-connected state share.
 *
 * Every per-connection store (scripts, globals, variables, auto-leveling,
 * library, equipment…) is keyed by this id. It used to be `default` while
 * disconnected and `dsl-mud` once connected, so a script saved before the socket
 * opened landed in a different bucket than the one the connected client read.
 *
 * `dsl-mud` is the survivor because it is where connected users' data already
 * lives (and where mobile and the cloud buckets file it): folding the smaller
 * `default` set into it moves the least data, and a rollback to an older build
 * still finds what it expects.
 */
export const SHARED_CONNECTION_ID = 'dsl-mud';

/** The id the not-yet-connected state used before it was folded into `dsl-mud`. */
export const LEGACY_UNCONNECTED_ID = 'default';

/**
 * Normalizes a raw connection id: empty, whitespace and the legacy `default`
 * all resolve to `dsl-mud` (old localStorage keys, cloud buckets from older
 * clients, and any caller that still passes nothing). Custom servers keep their
 * own `host:port` id.
 */
export function canonicalConnectionId(raw?: string | null): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id === LEGACY_UNCONNECTED_ID) return SHARED_CONNECTION_ID;
  return id;
}

/** The connection id for a connected host/port; `dsl-mud` for the DSL game or no connection. */
export function connectionIdForHost(host?: string | null, port?: number | null): string {
  if (!host || !port) return SHARED_CONNECTION_ID;
  if (host.includes('dsl-mud')) return SHARED_CONNECTION_ID;
  return `${host}:${port}`;
}
