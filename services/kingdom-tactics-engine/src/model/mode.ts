/** The nine supported game modes (see docs/ARCHITECTURE.md §5.1). */
export type GameModeId =
  | 'duel'
  | 'duo'
  | 'skirmish'
  | 'squadron'
  | 'battle'
  | 'siege'
  | 'ffa'
  | 'objective'
  | 'horde';

/** How a match is won. */
export type VictoryCondition = 'rout' | 'control-point' | 'survive-waves' | 'destroy-objective';

/** Whether the budget is a point pool or a fixed unit count. */
export type BudgetKind = 'points' | 'units';

/** Relative board/force scale (drives default board size + squadron use). */
export type ModeScale = 'skirmish' | 'small' | 'large';

/**
 * A game mode as pure data (authored in data/balance/modes.ts, read via
 * IGameModeProvider). Adding or rebalancing a mode is a data edit, so it flows to
 * the simulators like any other tuning value.
 */
export interface GameModeConfig {
  readonly id: GameModeId;
  readonly name: string;
  /** Number of opposing sides (2 for most; 3–4 for ffa). */
  readonly sides: number;
  /** Deployment budget per side, interpreted per `budgetKind`. */
  readonly budget: number;
  readonly budgetKind: BudgetKind;
  readonly scale: ModeScale;
  /** Board tokens are aggregated squadrons rather than individual units. */
  readonly usesSquadrons: boolean;
  readonly victory: VictoryCondition;
  readonly board: { readonly width: number; readonly height: number };
  /** Terrain profile key for map generation, e.g. 'open-field' | 'siege' | 'arena'. */
  readonly terrainProfile: string;
  /** Asymmetric attacker/defender (e.g. Siege) vs balanced. */
  readonly asymmetric: boolean;
}
