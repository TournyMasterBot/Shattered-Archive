/** Immutable, data-only domain model for Kingdom Tactics. */
export type { Coord, Side } from './coord.js';
export type { Board, Tile, TileFeature } from './board.js';
export type {
  MovementClass,
  StatBlock,
  MovePattern,
  AttackPattern,
  UnitTemplate,
  StatusEffect,
  Unit,
} from './unit.js';
export type { Squadron, SquadronMember, BoardToken } from './squadron.js';
export type { Army } from './army.js';
export type {
  Action,
  MoveAction,
  AttackAction,
  AbilityAction,
  SetStanceAction,
  EndTurnAction,
} from './action.js';
export type {
  GameModeId,
  VictoryCondition,
  BudgetKind,
  ModeScale,
  GameModeConfig,
} from './mode.js';
export type { MatchState, MoonContext } from './match.js';
export type {
  AbilityCategory,
  AbilityTargeting,
  AbilityUsageKind,
  ScalingAttr,
  AbilityDamageSpec,
  AbilityMaladictionSpec,
  AbilityBuffSpec,
  AbilityUtilitySpec,
  AbilityMechanics,
} from './ability.js';
