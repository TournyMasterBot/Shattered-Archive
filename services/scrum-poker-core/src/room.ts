import { DEFAULT_DECK, cardValue, validateDeck } from './deck.js';
import type { DeckTally, Participant, Room, RoomSettings, RoomStats, RoomView } from './types.js';

/**
 * Every state transition a room can undergo, as pure functions: `(room, …, now) -> room`.
 *
 * Nothing here reads a clock, generates an id, or touches I/O — the caller supplies `now`
 * and any new id. That is what lets the server persist the result and the test suite drive
 * an hour of idle time in a single expression.
 */

export const MAX_NAME_LENGTH = 32;
export const MAX_FRIENDLY_NAME_LENGTH = 60;
/** Guard against a runaway tab loop filling a room; far above any real team size. */
export const MAX_PARTICIPANTS = 100;

export const DEFAULT_SETTINGS: RoomSettings = {
  friendlyName: '',
  deck: DEFAULT_DECK,
  hideUntilRevealed: true,
  allowGuestsToReveal: true,
  allowGuestsToReset: true,
  allowGuestsToClearUsers: true,
  showAverage: true,
  showMedian: true,
};

/** Trims, collapses inner whitespace, and caps length. Returns '' for an unusable name. */
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function createRoom(id: string, hostToken: string, now: number, settings?: Partial<RoomSettings>): Room {
  return {
    id,
    hostToken,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    participants: [],
    revealed: false,
    createdAt: now,
    lastActiveAt: now,
  };
}

/** The settings that are plain on/off switches — checked as a group by `applySettingsPatch`. */
const BOOLEAN_SETTINGS = [
  'hideUntilRevealed',
  'allowGuestsToReveal',
  'allowGuestsToReset',
  'allowGuestsToClearUsers',
  'showAverage',
  'showMedian',
] as const;

/**
 * Validates a settings patch against the same rules the client's dialog uses, returning
 * either the merged settings or a human-readable reason. The server calls this on every
 * update — a client is never the authority on what a valid deck is.
 *
 * It checks TYPES as well as values, which looks redundant next to `parseScrumClientMessage`
 * (that already guarantees types for websocket frames) but is not: this is also the validator
 * for room records read off DISK, where nothing has vouched for the shape. A `deck: null` in a
 * hand-edited rooms.json used to throw a TypeError straight out of RoomStore's constructor and
 * stop the server booting — the exact opposite of the "a bad file degrades, never crashes"
 * rule the rest of the store follows.
 */
export function applySettingsPatch(
  current: RoomSettings,
  patch: Partial<RoomSettings>,
): { settings: RoomSettings } | { error: string } {
  const merged: RoomSettings = { ...current, ...patch };

  if (typeof merged.friendlyName !== 'string') return { error: 'Room name must be text.' };
  if (!Array.isArray(merged.deck) || merged.deck.some((card) => typeof card !== 'string')) {
    return { error: 'Estimate cards must be a list of text values.' };
  }
  for (const key of BOOLEAN_SETTINGS) {
    if (typeof merged[key] !== 'boolean') return { error: `Setting "${key}" must be true or false.` };
  }

  const friendlyName = merged.friendlyName.replace(/\s+/g, ' ').trim();
  if (friendlyName.length > MAX_FRIENDLY_NAME_LENGTH) {
    return { error: `Room name is longer than ${MAX_FRIENDLY_NAME_LENGTH} characters.` };
  }

  const deckError = validateDeck(merged.deck);
  if (deckError) return { error: deckError };

  return { settings: { ...merged, friendlyName, deck: [...merged.deck] } };
}

/**
 * Adds a participant, or re-attaches an existing one by their secret.
 *
 * Re-attaching is what makes a reconnect (refresh, laptop lid, dropped wifi) invisible:
 * the browser keeps its participant secret, so it lands back on its own row with its vote
 * intact instead of appearing as a duplicate ghost.
 *
 * Re-attach is keyed off `secret`, NEVER off the public `id`. Every state frame carries every
 * participant's id to every client, so treating an id as proof of identity let any member
 * rejoin as any other — casting votes in their name and reading their hidden estimate, since
 * a viewer is always shown their own card. The caller mints a fresh id+secret for a genuinely
 * new participant and passes whatever secret the client replayed; the row that comes back is
 * whichever one the server decided on, which is what the connection must then act as.
 */
export function joinRoom(
  room: Room,
  input: { participantId: string; participantSecret: string; replayedSecret?: string; name: string; now: number },
): { room: Room; participant: { id: string; secret: string } } | { error: string } {
  const name = sanitizeName(input.name);
  if (!name) return { error: 'Enter a name to join.' };

  const existing = input.replayedSecret
    ? room.participants.find((p) => p.secret === input.replayedSecret)
    : undefined;
  if (existing) {
    const participants = room.participants.map((p) =>
      p.id === existing.id ? { ...p, name, lastActiveAt: input.now } : p,
    );
    return {
      room: { ...room, participants, lastActiveAt: input.now },
      participant: { id: existing.id, secret: existing.secret },
    };
  }

  if (room.participants.length >= MAX_PARTICIPANTS) {
    return { error: 'This room is full.' };
  }

  const participant: Participant = {
    id: input.participantId,
    secret: input.participantSecret,
    name,
    vote: null,
    joinedAt: input.now,
    lastActiveAt: input.now,
  };
  return {
    room: { ...room, participants: [...room.participants, participant], lastActiveAt: input.now },
    participant: { id: participant.id, secret: participant.secret },
  };
}

export function renameParticipant(room: Room, participantId: string, rawName: string, now: number): Room | { error: string } {
  const name = sanitizeName(rawName);
  if (!name) return { error: 'Name cannot be empty.' };
  return {
    ...room,
    participants: room.participants.map((p) => (p.id === participantId ? { ...p, name, lastActiveAt: now } : p)),
    lastActiveAt: now,
  };
}

/**
 * Records a vote. `card` must be in the room's current deck (or null to clear) — a deck
 * edit mid-round can otherwise leave a vote referencing a card that no longer exists.
 */
export function castVote(room: Room, participantId: string, card: string | null, now: number): Room | { error: string } {
  if (card !== null && !room.settings.deck.includes(card)) {
    return { error: 'That card is not in this room’s deck.' };
  }
  if (!room.participants.some((p) => p.id === participantId)) {
    return { error: 'You are not in this room.' };
  }
  return {
    ...room,
    participants: room.participants.map((p) => (p.id === participantId ? { ...p, vote: card, lastActiveAt: now } : p)),
    lastActiveAt: now,
  };
}

export function setRevealed(room: Room, revealed: boolean, now: number): Room {
  return { ...room, revealed, lastActiveAt: now };
}

/** Clears every vote and re-hides the room, ready for the next story. People stay put. */
export function resetEstimates(room: Room, now: number): Room {
  return {
    ...room,
    revealed: false,
    participants: room.participants.map((p) => ({ ...p, vote: null })),
    lastActiveAt: now,
  };
}

/**
 * Empties the participant list. Everyone still connected simply re-joins on their next
 * frame, so in practice this drops stale rows rather than kicking the live team out.
 */
export function clearParticipants(room: Room, now: number): Room {
  return { ...room, revealed: false, participants: [], lastActiveAt: now };
}

/** Bumps a participant's activity clock — called for every interaction, including heartbeats. */
export function touchParticipant(room: Room, participantId: string, now: number): Room {
  if (!room.participants.some((p) => p.id === participantId)) return room;
  return {
    ...room,
    participants: room.participants.map((p) => (p.id === participantId ? { ...p, lastActiveAt: now } : p)),
    lastActiveAt: now,
  };
}

/** Drops participants idle for longer than `idleMs`. Returns the same object when nothing changed. */
export function sweepIdle(room: Room, now: number, idleMs: number): Room {
  const kept = room.participants.filter((p) => now - p.lastActiveAt < idleMs);
  if (kept.length === room.participants.length) return room;
  return { ...room, participants: kept };
}

/** Numeric summary of the current votes, in deck order. Callers gate this on `revealed`. */
export function computeStats(room: Room): RoomStats {
  const votes = room.participants.map((p) => p.vote).filter((v): v is string => v !== null);

  const distribution: DeckTally[] = room.settings.deck
    .map((card) => ({ card, count: votes.filter((v) => v === card).length }))
    .filter((t) => t.count > 0);

  const numbers = votes.map(cardValue).filter((n): n is number => n !== null);
  const average = numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;

  let median: number | null = null;
  if (numbers.length > 0) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  }

  return {
    average: average === null ? null : Math.round(average * 100) / 100,
    median,
    distribution,
    consensus: votes.length > 1 && distribution.length === 1,
  };
}

/**
 * Projects a room to the wire shape for one specific viewer.
 *
 * This is the single chokepoint where hiding is enforced. While the room is unrevealed
 * and `hideUntilRevealed` is on, every other participant's `vote` becomes null — the value
 * never leaves the server, so a client cannot peek at the payload to see the answer. The
 * viewer always sees their OWN vote, which is what lets the UI keep their card highlighted.
 *
 * It is also the boundary that keeps `Participant.secret` server-side. The projection lists
 * every field explicitly rather than spreading the participant — spreading here would put
 * every member's re-attach credential into every other member's payload, and the "viewer sees
 * their own vote" rule above is exactly what would then be turned against the room.
 */
export function toRoomView(room: Room, viewerId: string | null): RoomView {
  const hide = room.settings.hideUntilRevealed && !room.revealed;
  return {
    id: room.id,
    settings: room.settings,
    revealed: room.revealed,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      hasVoted: p.vote !== null,
      vote: hide && p.id !== viewerId ? null : p.vote,
      lastActiveAt: p.lastActiveAt,
    })),
    stats: room.revealed ? computeStats(room) : null,
  };
}
