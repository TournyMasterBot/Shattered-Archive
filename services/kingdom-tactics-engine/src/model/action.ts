import type { Coord, Side } from './coord.js';

/** Move a token to a destination tile. */
export interface MoveAction {
  readonly type: 'move';
  readonly tokenId: string;
  readonly to: Coord;
}

/** Attack another token (by instance id). */
export interface AttackAction {
  readonly type: 'attack';
  readonly tokenId: string;
  readonly targetId: string;
}

/** Use a named ability, optionally at a target tile or token. */
export interface AbilityAction {
  readonly type: 'ability';
  readonly tokenId: string;
  readonly abilityKey: string;
  readonly target?: Coord | string;
}

/** End the active side's turn. */
export interface EndTurnAction {
  readonly type: 'end-turn';
  readonly side: Side;
}

/** The full set of things a general can do in a turn. Discriminated by `type`. */
export type Action = MoveAction | AttackAction | AbilityAction | EndTurnAction;
