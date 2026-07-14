import type { Action, MatchState } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import type { EngineProviders } from '../engine/game-engine.js';
import { applyAction } from '../engine/game-engine.js';

/**
 * Drives a match under full manual control of BOTH sides (scenario / hot-seat / tutorial —
 * the brief's "one player controls both sides"). No policy: the caller supplies every Action
 * and can inspect state between them. Immutable snapshots; history is the ordered list of
 * applied actions + resulting states.
 */
export class ScenarioSimulator {
  private current: MatchState;
  private readonly log: { action: Action; state: MatchState }[] = [];

  constructor(
    initial: MatchState,
    private readonly providers: EngineProviders,
    private readonly rng: ISeededRng,
  ) {
    this.current = initial;
  }

  /** Apply one action from the caller; returns the new state. */
  step(action: Action): MatchState {
    this.current = applyAction(this.current, action, this.rng, this.providers);
    this.log.push({ action, state: this.current });
    return this.current;
  }

  /** Current match snapshot. */
  getState(): MatchState {
    return this.current;
  }

  /** Ordered (action, resulting-state) history. */
  history(): readonly { action: Action; state: MatchState }[] {
    return this.log;
  }

  /** True once the match is decided. */
  isOver(): boolean {
    return this.current.status === 'decided';
  }
}
