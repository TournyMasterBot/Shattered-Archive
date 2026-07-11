import {
  GreedyPolicy,
  RandomPolicy,
  buildMatch,
  runMatch,
  type ArmyRoster,
  type EngineProviders,
  type GameModeId,
  type IAiPolicy,
  type MatchResult,
  type Side,
  type TerrainChoice,
} from '@shatteredarchive/kingdom-tactics-engine';

/** Which AI drives a side in a simulated batch. */
export type PolicyKind = 'greedy' | 'random';

/**
 * One dashboard batch request: a mode, an AI policy per side, how many matches, and the
 * base seed. Rosters are the mode's mirrored default (one Human Warrior army per side) —
 * custom rosters are a later enhancement.
 */
export interface SimConfig {
  readonly modeId: GameModeId;
  /** side index → policy that controls it. */
  readonly policyBySide: Readonly<Record<number, PolicyKind>>;
  readonly matches: number;
  readonly baseSeed: number;
  readonly terrain?: TerrainChoice;
}

/**
 * Aggregate outcome of a batch — the same shape the engine's `runBatch` produces, so a
 * `SimConfig` reproduces its summary exactly (match `i` uses `baseSeed + i`).
 */
export interface SimSummary {
  readonly matches: number;
  readonly winsBySide: Readonly<Record<number, number>>;
  readonly draws: number;
  readonly turnLimitHits: number;
  readonly avgTurns: number;
  readonly results: readonly MatchResult[];
}

/** Yield to the event loop so a long batch never freezes the tab. */
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const newPolicy = (kind: PolicyKind): IAiPolicy =>
  kind === 'greedy' ? new GreedyPolicy() : new RandomPolicy();

/**
 * The mode's mirrored default roster count: for a `units` budget the count is the budget
 * itself; for a `points` budget, as many Human Warriors as the pool affords (≥ 1).
 */
function defaultRosterSize(modeId: GameModeId, providers: EngineProviders): number {
  const mode = providers.modes.mode(modeId);
  if (mode.budgetKind === 'units') return mode.budget;
  const warriorCost = providers.data.unitTemplate('Human', 'Warrior').cost;
  return Math.max(1, Math.floor(mode.budget / warriorCost));
}

/** One Human-Warrior army per side, sized to the mode's budget — identical for every side. */
function mirroredRosters(modeId: GameModeId, providers: EngineProviders): ArmyRoster[] {
  const mode = providers.modes.mode(modeId);
  const size = defaultRosterSize(modeId, providers);
  const picks = Array.from({ length: size }, () => ({ raceKey: 'Human', classKey: 'Warrior' }));
  return Array.from({ length: mode.sides }, (_, side) => ({ side, picks }));
}

/**
 * Run a headless AI-vs-AI batch for the dashboard. All match stepping and the win/draw/turn
 * aggregation come from the engine (`buildMatch` + `runMatch`); this only chunks the loop so
 * the UI stays responsive, aggregating exactly like the engine's `runBatch`.
 *
 * The initial `MatchState` is built once (rosters + terrain are fixed); each match `i` replays
 * it under seed `baseSeed + i`, so the same `SimConfig` always yields a deep-equal `SimSummary`.
 * `onProgress(done)` fires after each chunk; `shouldCancel()` (polled between chunks) stops early
 * and returns the partial summary gathered so far.
 */
export async function runSimBatch(
  config: SimConfig,
  providers: EngineProviders,
  onProgress?: (done: number) => void,
  shouldCancel?: () => boolean,
): Promise<SimSummary> {
  const { modeId, policyBySide, matches, baseSeed, terrain } = config;

  const rosters = mirroredRosters(modeId, providers);
  const initial = buildMatch(modeId, rosters, providers, { seed: baseSeed, terrain });

  const policies: Record<number, IAiPolicy> = {};
  for (const [side, kind] of Object.entries(policyBySide)) policies[Number(side)] = newPolicy(kind);

  const results: MatchResult[] = [];
  const winsBySide: Record<number, number> = {};
  let draws = 0;
  let turnLimitHits = 0;
  let turnSum = 0;

  const CHUNK = 16;
  for (let i = 0; i < matches; i++) {
    const r = runMatch({ initial, policies, providers, seed: baseSeed + i });
    results.push(r);
    turnSum += r.turns;
    if (r.reason === 'turn-limit') turnLimitHits++;
    if (r.winner === 'draw') draws++;
    else winsBySide[r.winner as Side] = (winsBySide[r.winner as Side] ?? 0) + 1;

    if ((i + 1) % CHUNK === 0 || i === matches - 1) {
      onProgress?.(i + 1);
      if (shouldCancel?.()) break;
      await macrotask();
    }
  }

  const ran = results.length;
  return {
    matches: ran,
    winsBySide,
    draws,
    turnLimitHits,
    avgTurns: ran > 0 ? turnSum / ran : 0,
    results,
  };
}
