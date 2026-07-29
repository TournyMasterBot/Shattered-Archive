import type { RoomSettings, RoomSettingsPatch, RoomView } from './types.js';

/**
 * The `/ws/scrum` wire contract, plus the parser both ends validate against.
 *
 * `parseScrumClientMessage` treats its input as hostile: it is the only thing standing
 * between an arbitrary websocket frame and the room reducers, so it validates shape and
 * primitive types for every field and returns `undefined` rather than throwing.
 */

export const SCRUM_PROTOCOL_VERSION = 1;

export type ScrumClientMessage =
  /**
   * First frame on every connection. `participantSecret`/`hostToken` are replayed from
   * localStorage on a reconnect — both are credentials, which is why the participant's public
   * id (broadcast to the whole room) is deliberately NOT what re-attaches you to your row.
   */
  | { type: 'join'; roomId: string; name: string; participantSecret?: string; hostToken?: string }
  | { type: 'rename'; name: string }
  | { type: 'vote'; card: string | null }
  | { type: 'reveal' }
  | { type: 'hide' }
  | { type: 'resetEstimates' }
  | { type: 'clearUsers' }
  | { type: 'updateSettings'; settings: Partial<RoomSettings> }
  /** Activity heartbeat — the only frame that exists purely to keep an idle timer alive. */
  | { type: 'ping' }
  | { type: 'leave' };

/**
 * Machine-readable reason on an error frame. The client branches on this, never on the
 * message text — in particular it must tell `evicted` (you went quiet for an hour: ask
 * before rejoining) from every other reason (auto-recover), or it would silently re-add
 * the very participant the idle sweep just removed.
 */
export type ScrumErrorCode =
  | 'no-room'
  | 'expired'
  | 'evicted'
  | 'not-joined'
  | 'forbidden'
  | 'invalid'
  | 'room-full'
  | 'internal';

export type ScrumServerMessage =
  /**
   * Acknowledges a join and tells the client which row/host status the server settled on.
   * `participantSecret` is the only time that credential crosses the wire outbound; the client
   * stores it and replays it to re-attach. It goes to this ONE connection, never in a broadcast.
   */
  | {
      type: 'joined';
      roomId: string;
      participantId: string;
      participantSecret: string;
      isHost: boolean;
      protocolVersion: number;
    }
  | { type: 'state'; room: RoomView }
  | { type: 'pong' }
  /** `fatal` means "do not retry this connection" — the room is gone, not merely unhappy. */
  | { type: 'error'; code: ScrumErrorCode; message: string; fatal?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Picks only the known settings keys off an untrusted object, discarding anything else.
 * Value ranges are NOT checked here — `applySettingsPatch` owns that, so there is exactly
 * one place that decides what a legal deck or room name is.
 */
function parseSettingsPatch(value: unknown): Partial<RoomSettings> | undefined {
  if (!isRecord(value)) return undefined;
  const patch: RoomSettingsPatch = {};

  if ('friendlyName' in value) {
    if (typeof value.friendlyName !== 'string') return undefined;
    patch.friendlyName = value.friendlyName;
  }
  if ('deck' in value) {
    if (!isStringArray(value.deck)) return undefined;
    patch.deck = value.deck;
  }
  for (const key of [
    'hideUntilRevealed',
    'allowGuestsToReveal',
    'allowGuestsToReset',
    'allowGuestsToClearUsers',
    'showAverage',
    'showMedian',
  ] as const) {
    if (key in value) {
      if (typeof value[key] !== 'boolean') return undefined;
      patch[key] = value[key];
    }
  }
  return patch;
}

/** Parses one untrusted frame. Returns `undefined` for anything malformed — never throws. */
export function parseScrumClientMessage(raw: string): ScrumClientMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return undefined;

  switch (parsed.type) {
    case 'join': {
      if (typeof parsed.roomId !== 'string' || typeof parsed.name !== 'string') return undefined;
      if ('participantSecret' in parsed && typeof parsed.participantSecret !== 'string') return undefined;
      if ('hostToken' in parsed && typeof parsed.hostToken !== 'string') return undefined;
      const msg: ScrumClientMessage = { type: 'join', roomId: parsed.roomId, name: parsed.name };
      if (typeof parsed.participantSecret === 'string') msg.participantSecret = parsed.participantSecret;
      if (typeof parsed.hostToken === 'string') msg.hostToken = parsed.hostToken;
      return msg;
    }
    case 'rename':
      return typeof parsed.name === 'string' ? { type: 'rename', name: parsed.name } : undefined;
    case 'vote':
      if (parsed.card === null) return { type: 'vote', card: null };
      return typeof parsed.card === 'string' ? { type: 'vote', card: parsed.card } : undefined;
    case 'reveal':
    case 'hide':
    case 'resetEstimates':
    case 'clearUsers':
    case 'ping':
    case 'leave':
      return { type: parsed.type };
    case 'updateSettings': {
      const settings = parseSettingsPatch(parsed.settings);
      return settings ? { type: 'updateSettings', settings } : undefined;
    }
    default:
      return undefined;
  }
}
