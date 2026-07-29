/**
 * Domain types shared by scrum-poker-server and scrum-poker-client.
 *
 * Two shapes matter here and must not be confused:
 *  - `Room` is the SERVER-SIDE record. It holds every raw vote and the host token.
 *  - `RoomView` is the only thing that ever goes over the wire. `toRoomView` (room.ts)
 *    strips the host token always, and strips unrevealed votes when the room's
 *    `hideUntilRevealed` is on — the hiding is enforced there, on the server, not by
 *    the client choosing not to render a value it already has.
 */

/** The estimate cards a room offers, in display order (e.g. `['?', '☕', '1', '2', '3']`). */
export type EstimateDeck = readonly string[];

/** Everything an organizer can configure about a room. */
export interface RoomSettings {
  /** Human label shown in the room header; the room id stays the shareable key. */
  readonly friendlyName: string;
  readonly deck: EstimateDeck;
  /** When true, other people's votes are withheld by the server until `revealed`. */
  readonly hideUntilRevealed: boolean;
  /** Guest permissions — mirror the reference site's defaults (all permissive). */
  readonly allowGuestsToReveal: boolean;
  readonly allowGuestsToReset: boolean;
  readonly allowGuestsToClearUsers: boolean;
  /** Post-reveal summary stats over the numeric cards only. */
  readonly showAverage: boolean;
  readonly showMedian: boolean;
}

/**
 * A mutable draft of `RoomSettings`. `RoomSettings` is fully readonly, so anything that
 * assembles a partial update key by key (the frame parser, the create route, the settings
 * dialog) builds one of these and hands it to `applySettingsPatch`, which validates it.
 */
export type RoomSettingsPatch = { -readonly [K in keyof RoomSettings]?: RoomSettings[K] };

/** A transient participant. There are no accounts: a name plus a server-minted id. */
export interface Participant {
  /**
   * PUBLIC. Broadcast to every client in the room (it is the render key, and how a client
   * spots its own row), so it must never be accepted as proof of identity — see `secret`.
   */
  readonly id: string;
  /**
   * PRIVATE. The re-attach credential: held only by this participant's browser, replayed on
   * join to land back on this row after a refresh, and stripped from every wire payload by
   * `toRoomView`.
   *
   * It exists because `id` cannot do this job. `id` is in the roster every client receives,
   * so when re-attach was keyed off it, any member could rejoin as any other — voting in
   * their name and, because a viewer always sees their OWN card, reading a hidden estimate
   * before the reveal. That is precisely the peeking `hideUntilRevealed` exists to prevent.
   */
  readonly secret: string;
  readonly name: string;
  /** The card this person picked, or null for "hasn't voted / was reset". */
  readonly vote: string | null;
  readonly joinedAt: number;
  /** Bumped by every interaction; drives the idle sweep. */
  readonly lastActiveAt: number;
}

/** Server-side room record. Never sent to a client as-is — see `toRoomView`. */
export interface Room {
  readonly id: string;
  readonly settings: RoomSettings;
  readonly participants: readonly Participant[];
  readonly revealed: boolean;
  readonly createdAt: number;
  readonly lastActiveAt: number;
  /**
   * Opaque secret handed to the creator once, kept in their browser's localStorage, and
   * required to change room settings. Deliberately NOT a password hash: this gates
   * "who may rename the room", not access to anything sensitive, and the room file lives
   * on a private server volume. It is stripped from every wire payload by `toRoomView`.
   */
  readonly hostToken: string;
}

/** A participant as seen by other clients. `vote` is null whenever the server is hiding it. */
export interface ParticipantView {
  readonly id: string;
  readonly name: string;
  readonly hasVoted: boolean;
  /** The card, or null when unrevealed-and-hidden (or genuinely not voted yet). */
  readonly vote: string | null;
  readonly lastActiveAt: number;
}

/** One bar of the post-reveal distribution. */
export interface DeckTally {
  readonly card: string;
  readonly count: number;
}

/** Post-reveal summary. Null until the room is revealed. */
export interface RoomStats {
  /** Mean of the numeric cards only (☕/? are excluded), or null if none were numeric. */
  readonly average: number | null;
  readonly median: number | null;
  /** Every card that got at least one vote, in deck order. */
  readonly distribution: readonly DeckTally[];
  /** True when every voter picked the same card — the "we're agreed" signal. */
  readonly consensus: boolean;
}

/** The wire shape of a room. Everything the client renders comes from this. */
export interface RoomView {
  readonly id: string;
  readonly settings: RoomSettings;
  readonly participants: readonly ParticipantView[];
  readonly revealed: boolean;
  readonly stats: RoomStats | null;
}
