import type { Action, MatchState, Side } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import type { EngineProviders } from '../engine/game-engine.js';

/**
 * A pluggable decision maker for one side. Given a state it returns exactly ONE legal
 * `Action`; the match/simulator loop calls it repeatedly (a side may move one token then
 * attack with another) until it returns `end-turn`. Policies must be pure w.r.t. the
 * inputs and draw all randomness from `rng` so a match is reproducible from (state, seed).
 */
export interface IAiPolicy {
  readonly name: string;
  chooseAction(state: MatchState, side: Side, p: EngineProviders, rng: ISeededRng): Action;
}
