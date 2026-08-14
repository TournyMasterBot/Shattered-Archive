/**
 * What a room id is allowed to look like, in one place. Soulsteel always mints real
 * `crypto.randomUUID()` ids, but the check stays permissive over the character set (mirrors
 * scrum-poker-client's `room-id.ts`) rather than matching the UUID grammar exactly — the only
 * job here is to reject shapes that clearly aren't a room id at all.
 */
export const ROOM_ID_CHARS = '[A-Za-z0-9-]{4,64}';

/** Matches a whole room path, e.g. `/room/<id>` with an optional trailing slash. */
export const ROOM_PATH_RE = new RegExp(`^/room/(${ROOM_ID_CHARS})/?$`);

/** Finds a `/room/<id>` segment anywhere in a string — used to read an id out of a pasted URL. */
const ROOM_IN_TEXT_RE = new RegExp(`/room/(${ROOM_ID_CHARS})`);

/** Pulls a room id out of whatever got pasted — a bare id, or a whole invite link. */
export function extractRoomId(raw: string): string {
  const trimmed = raw.trim();
  const fromLink = ROOM_IN_TEXT_RE.exec(trimmed);
  return fromLink ? fromLink[1]! : trimmed;
}
