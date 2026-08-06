import type { ScrumServerMessage } from '@shatteredarchive/scrum-poker-core';

/**
 * Narrows a raw websocket frame to a `ScrumServerMessage`, or returns undefined.
 *
 * The mirror of the core's `parseScrumClientMessage`, but with a different motive: frames
 * arrive from our own server, so this is not a security boundary — it is a version boundary.
 * A client cached from an older deploy will meet a newer server (and vice versa), and the
 * failure mode for an unrecognised frame must be "ignore it" rather than a thrown render.
 */
export function parseScrumServerMessage(raw: string): ScrumServerMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const msg = parsed as Record<string, unknown>;
  switch (msg.type) {
    case 'joined':
      // No secret field to validate here (protocol v2, 2026-08-05) — the credential that
      // reattaches this browser to its row is an HttpOnly cookie the server set separately,
      // never a payload this parser would see.
      return typeof msg.roomId === 'string' && typeof msg.participantId === 'string' && typeof msg.isHost === 'boolean'
        ? (msg as unknown as ScrumServerMessage)
        : undefined;
    case 'state':
      return typeof msg.room === 'object' &&
        msg.room !== null &&
        Array.isArray((msg.room as { participants?: unknown }).participants)
        ? (msg as unknown as ScrumServerMessage)
        : undefined;
    case 'pong':
      return { type: 'pong' };
    case 'error':
      return typeof msg.message === 'string' && typeof msg.code === 'string'
        ? (msg as unknown as ScrumServerMessage)
        : undefined;
    default:
      return undefined;
  }
}
