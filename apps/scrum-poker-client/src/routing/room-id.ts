/**
 * What a room id is allowed to look like, in one place.
 *
 * Ids are UUIDs, but this stays deliberately permissive over the character set rather than
 * matching the UUID grammar: rooms created before the switch have plain numeric ids and their
 * links must keep working. Whether an id EXISTS is the server's 404 to give — the only job
 * here is to reject shapes that clearly aren't a room id at all.
 */
export const ROOM_ID_CHARS = '[A-Za-z0-9-]{4,64}';

/** Matches a whole room path, e.g. `/room/<id>` with an optional trailing slash. */
export const ROOM_PATH_RE = new RegExp(`^/room/(${ROOM_ID_CHARS})/?$`);

/** Finds a `/room/<id>` segment anywhere in a string — used to read an id out of a pasted URL. */
const ROOM_IN_TEXT_RE = new RegExp(`/room/(${ROOM_ID_CHARS})`);

/**
 * Pulls a room id out of whatever got pasted.
 *
 * Ids are UUIDs now, so nobody is retyping one off a phone call — in practice people paste the
 * whole invite link, and a field that only accepted a bare id would reject the single most
 * likely input.
 */
export function extractRoomId(raw: string): string {
  const trimmed = raw.trim();
  const fromLink = ROOM_IN_TEXT_RE.exec(trimmed);
  return fromLink ? fromLink[1]! : trimmed;
}
