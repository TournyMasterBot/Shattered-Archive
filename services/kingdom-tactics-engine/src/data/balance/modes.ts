import type { GameModeConfig, GameModeId } from '../../model/index.js';

/**
 * HAND-AUTHORED game-mode configurations (docs/ARCHITECTURE.md §5.1). Modes are data,
 * not code branches — adding or rebalancing one is an edit here and flows to the
 * simulators. All nine modes from the roadmap are in scope.
 */
export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  duel: {
    id: 'duel', name: 'Duel', sides: 2, budget: 1, budgetKind: 'units', scale: 'skirmish',
    usesSquadrons: false, victory: 'rout', board: { width: 6, height: 6 },
    terrainProfile: 'arena', asymmetric: false,
  },
  duo: {
    id: 'duo', name: 'Duo', sides: 2, budget: 2, budgetKind: 'units', scale: 'skirmish',
    usesSquadrons: false, victory: 'rout', board: { width: 8, height: 8 },
    terrainProfile: 'arena', asymmetric: false,
  },
  skirmish: {
    // Skirmish-scale modes field an equal NUMBER of units per side — points don't matter at
    // this scale; point budgets are reserved for the larger battles (relative power balancing).
    id: 'skirmish', name: 'Skirmish', sides: 2, budget: 5, budgetKind: 'units', scale: 'skirmish',
    usesSquadrons: false, victory: 'rout', board: { width: 10, height: 10 },
    terrainProfile: 'arena', asymmetric: false,
  },
  squadron: {
    id: 'squadron', name: 'Squadron', sides: 2, budget: 60, budgetKind: 'points', scale: 'small',
    usesSquadrons: false, victory: 'rout', board: { width: 12, height: 12 },
    terrainProfile: 'open-field', asymmetric: false,
  },
  battle: {
    id: 'battle', name: 'Battle', sides: 2, budget: 200, budgetKind: 'points', scale: 'large',
    usesSquadrons: true, victory: 'rout', board: { width: 20, height: 20 },
    terrainProfile: 'open-field', asymmetric: false,
  },
  siege: {
    id: 'siege', name: 'Siege', sides: 2, budget: 150, budgetKind: 'points', scale: 'large',
    usesSquadrons: true, victory: 'destroy-objective', board: { width: 18, height: 18 },
    terrainProfile: 'siege', asymmetric: true,
  },
  ffa: {
    // Skirmish-scale free-for-all: equal unit count per side (3 each across 4 sides), not points.
    id: 'ffa', name: 'Free-for-All', sides: 4, budget: 3, budgetKind: 'units', scale: 'skirmish',
    usesSquadrons: false, victory: 'rout', board: { width: 14, height: 14 },
    terrainProfile: 'arena', asymmetric: false,
  },
  objective: {
    id: 'objective', name: 'Objective', sides: 2, budget: 40, budgetKind: 'points', scale: 'small',
    usesSquadrons: false, victory: 'control-point', board: { width: 12, height: 12 },
    terrainProfile: 'arena', asymmetric: false,
  },
  horde: {
    id: 'horde', name: 'Horde', sides: 2, budget: 50, budgetKind: 'points', scale: 'small',
    usesSquadrons: false, victory: 'survive-waves', board: { width: 12, height: 12 },
    terrainProfile: 'arena', asymmetric: true,
  },
};

export const GAME_MODE_LIST: readonly GameModeConfig[] = Object.values(GAME_MODES);
