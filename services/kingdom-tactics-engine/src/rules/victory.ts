import type { IGameDataProvider } from '../data/index.js';
import type { Coord, GameModeConfig, MatchState, Side } from '../model/index.js';
import { tokenAt } from './board.js';

export interface VictoryResult {
  readonly decided: boolean;
  readonly winner?: Side | 'draw';
}

/** Sides that still have a living token (unit hp > 0 or squadron hpPool > 0). */
function livingSides(state: MatchState): Set<Side> {
  const sides = new Set<Side>();
  for (const t of state.tokens) {
    const alive = t.kind === 'unit' ? t.hp > 0 : t.hpPool > 0;
    if (alive) sides.add(t.side);
  }
  return sides;
}

/** Coords of tiles carrying a given feature kind. */
function featureCoords(state: MatchState, kind: string): Coord[] {
  const out: Coord[] = [];
  const { board } = state;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.tiles[y][x].feature?.kind === kind) out.push({ x, y });
    }
  }
  return out;
}

/**
 * Determine whether the match is decided and, if so, the winner. Pure. Dispatches
 * on the mode's victory condition.
 */
export function evaluateVictory(
  state: MatchState,
  mode: GameModeConfig,
  _provider: IGameDataProvider,
): VictoryResult {
  // A match already flagged decided reports its recorded winner.
  if (state.status === 'decided') {
    return { decided: true, winner: state.winner };
  }

  switch (mode.victory) {
    case 'rout':
      return evaluateRout(state);
    case 'control-point':
      return evaluateControlPoint(state);
    case 'destroy-objective':
      return evaluateDestroyObjective(state);
    case 'survive-waves':
      return evaluateSurviveWaves(state);
    default:
      return { decided: false };
  }
}

/** Rout: one side left standing wins; none left is a draw. */
function evaluateRout(state: MatchState): VictoryResult {
  const sides = livingSides(state);
  if (sides.size === 0) return { decided: true, winner: 'draw' };
  if (sides.size === 1) return { decided: true, winner: [...sides][0] };
  return { decided: false };
}

/** Control-point: decided when every control-point tile is held by one same side. */
function evaluateControlPoint(state: MatchState): VictoryResult {
  const points = featureCoords(state, 'control-point');
  if (points.length === 0) return { decided: false };

  const holders = new Set<Side>();
  for (const c of points) {
    const occupant = tokenAt(state, c);
    const owner = occupant ? occupant.side : state.board.tiles[c.y][c.x].feature?.owner;
    if (owner === undefined) return { decided: false }; // uncontested point
    holders.add(owner);
  }
  return holders.size === 1 ? { decided: true, winner: [...holders][0] } : { decided: false };
}

/** Destroy-objective: decided when all objective features are destroyed (hp <= 0). */
function evaluateDestroyObjective(state: MatchState): VictoryResult {
  const objectives = featureCoords(state, 'objective');
  if (objectives.length === 0) return { decided: false };

  const allDestroyed = objectives.every((c) => {
    const hp = state.board.tiles[c.y][c.x].feature?.hp ?? 0;
    return hp <= 0;
  });
  if (!allDestroyed) return { decided: false };

  // The attacker (the side that does not own the objective) wins.
  const defender = state.board.tiles[objectives[0].y][objectives[0].x].feature?.owner;
  const sides = [...new Set(state.tokens.map((t) => t.side))].sort((a, b) => a - b);
  const attacker = sides.find((s) => s !== defender) ?? (defender === 0 ? 1 : 0);
  return { decided: true, winner: attacker };
}

/** Survive-waves (placeholder): side 0 wins once no enemy (side !== 0) token lives. */
function evaluateSurviveWaves(state: MatchState): VictoryResult {
  const enemyAlive = state.tokens.some((t) => {
    const alive = t.kind === 'unit' ? t.hp > 0 : t.hpPool > 0;
    return alive && t.side !== 0;
  });
  return enemyAlive ? { decided: false } : { decided: true, winner: 0 };
}
