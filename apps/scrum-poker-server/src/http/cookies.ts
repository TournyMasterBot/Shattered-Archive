/**
 * Per-room HttpOnly credentials for scrum-poker: `participantSecret` and `hostToken` used to
 * travel over the `/ws/scrum` wire and live in the client's localStorage — readable by any
 * script on the page, which is the whole cost `'unsafe-inline'` removal (2026-08-05) was
 * defending against. Moving them to HttpOnly cookies makes them invisible to JS entirely, even
 * from a future XSS the CSP didn't catch. Hand-parsed/hand-built — no cookie-parser dependency,
 * mirroring auth-server's session-guard.ts (`.npmrc`'s minimum-dep-age makes a new dependency
 * for this genuinely not worth it).
 *
 * Cookies are named PER ROOM (`__Host-sp_secret_<roomId>`, `__Host-sp_host_<roomId>`) rather
 * than one shared cookie, because a browser can legitimately hold membership in several rooms
 * at once — see storage.ts's (now-removed) per-room localStorage keys, which this replaces.
 * The `__Host-` prefix forces `Path=/`, `Secure`, and no `Domain` attribute, closing the same
 * cross-subdomain cookie-tossing vector auth-server's session-guard.ts documents: any other
 * `*.shatteredarchive.dev` origin could otherwise set a `Domain=.shatteredarchive.dev` cookie
 * of the same name and shadow or replace this one.
 *
 * `Path=/` is required, not incidental: these cookies must ride along on the `/ws/scrum`
 * WebSocket upgrade request, which shares no path prefix with wherever the join page lives
 * (`/room/<id>`). Scoping to `/room/<id>` would look tighter but would silently never reach
 * the socket handshake.
 *
 * `Max-Age` is pinned to the room TTL rather than left unset: a cookie has no server-side
 * concept of "the room it names no longer exists", so without an expiry these would
 * accumulate in the browser's Cookie header for as long as it holds the site's cookies at
 * all — every one of them replayed on every future request, no matter how many rooms a
 * browser has ever visited. Expiring in lockstep with the room means a cookie for a room
 * that's gone is never far behind it.
 */

const SECRET_PREFIX = '__Host-sp_secret_';
const HOST_PREFIX = '__Host-sp_host_';

export function secretCookieName(roomId: string): string {
  return `${SECRET_PREFIX}${roomId}`;
}

export function hostCookieName(roomId: string): string {
  return `${HOST_PREFIX}${roomId}`;
}

/**
 * Reads one cookie's value out of a raw `Cookie:` header. Takes the header as a plain string
 * rather than an Express `Request` so the same function serves both the HTTP routes (Express's
 * `req.headers.cookie`) and the WebSocket gateway (the raw upgrade `http.IncomingMessage`'s
 * `request.headers.cookie`, captured once at connection time since `msg.roomId` — and so the
 * cookie NAME to look for — isn't known until the first `join` frame arrives).
 */
export function readCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Same attributes on every mint: HttpOnly, Secure, SameSite=Lax, `__Host-`-compatible. */
export function buildSetCookie(name: string, value: string, maxAgeMs: number): string {
  const maxAgeSeconds = Math.max(0, Math.round(maxAgeMs / 1000));
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`;
}
