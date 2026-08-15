/**
 * Core domain shapes for a Soulsteel game. Everything here is pure data — no browser or React
 * dependency — so it can be unit-tested directly and (per the follow-on auth/archive plan)
 * reused as the wire shape for an archived room.
 */

export type Alignment = 'darkKnight' | 'assassin' | 'neutral';

export interface RoleDef {
  id: string;
  name: string;
  alignment: Alignment;
  /** Built-in roles (Umbraseer, Darkshield, Dark Knight, Cultist Assassin) vs. a Disciple-added
   * "Game Modifier" role. */
  builtin: boolean;
  /** The role's night action, if any, may be used at most once per night. */
  oncePerNight?: boolean;
  description: string;
  /**
   * Custom/modifier roles only. Whether this role's alignment counts toward the automatic
   * win-condition tally. Defaults to counting (`undefined`/`true`) — set `false` for a role like
   * the rules' example Cultist Minion, which serves the Assassins without being counted as one.
   * Built-in roles always count; this field is ignored for them.
   */
  countsTowardWinTally?: boolean;
}

export type EliminationCause = 'executed' | 'assassinated' | 'other';

export interface EliminationRecord {
  day: number;
  phase: 'day' | 'night';
  cause: EliminationCause;
  note?: string;
}

export interface Player {
  id: string;
  name: string;
  roleId: string | null;
  alive: boolean;
  eliminatedAt?: EliminationRecord;
}

export type TimelineEntry =
  | { id: string; kind: 'night-check'; day: number; checkerId: string; targetId: string; result: Alignment; roleName: string }
  | { id: string; kind: 'night-protect'; day: number; protectorId: string; targetId: string }
  | { id: string; kind: 'night-assassin-target'; day: number; targetId: string }
  | { id: string; kind: 'night-elimination'; day: number; targetId: string; protected: boolean }
  | { id: string; kind: 'day-vote-tally'; day: number; tally: Record<string, number> }
  | { id: string; kind: 'day-execution'; day: number; targetId: string | null; note?: string }
  | { id: string; kind: 'admin-status-change'; day: number; phase: 'day' | 'night'; targetId: string; alive: boolean };

export interface RoomSettings {
  nightTimerSeconds: number;
  discussTimerSeconds: number;
  voteTimerSeconds: number;
  /** Recommendations section: "Don't block a murder first night in very small games... or add a
   * twist." Left as a Herald toggle rather than an enforced rule. */
  firstNightNoKill: boolean;
  /** House rule for small games that otherwise resolve too quickly: if the Darkshield's
   * protection target for a night turns out to be Assassin-aligned, "Umbral forces" interfere
   * with the Umbraseer's sight that same night, regardless of who the Umbraseer checked. */
  darkshieldBlocksUmbraseer: boolean;
}

export type WinResult = 'darkKnights' | 'assassins' | null;

/** One numbered physical bag a Herald pre-stuffs with a role parchment before the game, keyed by
 * its ordinal position — the same number used in the in-game `N.container` addressing syntax
 * (merc's `number_argument`, e.g. `put parch 2.sack` targets the 2nd "sack" the Herald holds). */
export interface BagEntry {
  number: number;
  roleId: string | null;
}

export interface RoomState {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** The current round number. Phase alternates day/night within a round: Day 1, Night 1, Day 2... */
  dayNumber: number;
  phase: 'day' | 'night';
  players: Player[];
  roles: RoleDef[];
  timeline: TimelineEntry[];
  settings: RoomSettings;
  /** The in-game keyword for the container the Herald is using as bags (e.g. "sack"), shared by
   * every bag — only the `N.` ordinal in `bags` tells them apart. */
  bagContainerKeyword: string;
  bags: BagEntry[];
  /** The keyword for a single larger container the Herald consolidates every stuffed bag into
   * before the game — see `bagPlan.ts`'s `compiledBagSetupCommands`. */
  masterBagKeyword: string;
  /** Milliseconds between staggered `doAfter` calls in a generated alias script — see
   * `aliasScript.ts`'s `DEFAULT_COMMAND_DELAY_MS`. */
  commandDelayMs: number;
}
