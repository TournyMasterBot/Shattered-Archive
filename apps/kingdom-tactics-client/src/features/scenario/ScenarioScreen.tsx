import { useRef, useState } from 'react';
import {
  ScenarioSimulator,
  buildMatch,
  createRng,
  legalActions,
  type Action,
  type MatchState,
} from '@shatteredarchive/kingdom-tactics-engine';

import { Arena } from '../arena';
import { useNav } from '../../state/nav';
import { providers } from '../../state/providers';
import { QUICK_MATCH_SETUP } from '../match';
import './ScenarioScreen.css';

/**
 * Scenario mode — one player drives BOTH sides over a {@link ScenarioSimulator} (no AI). The
 * arena always lets the player control whichever side is active (`controllableSide = activeSide`),
 * so ending a turn hands control to the other side. Shows turn / controlled side / steps taken,
 * and a completion banner once the underlying match is decided. All rules are the engine's.
 */

/** Default scenario setup (a small mirrored Skirmish, same as Quick Match). */
const SCENARIO_SETUP = QUICK_MATCH_SETUP;

function newSim(): ScenarioSimulator {
  const initial = buildMatch(SCENARIO_SETUP.modeId, SCENARIO_SETUP.rosters, providers, {
    seed: SCENARIO_SETUP.seed,
  });
  return new ScenarioSimulator(initial, providers, createRng(SCENARIO_SETUP.seed));
}

export function ScenarioScreen() {
  const { navigate } = useNav();
  const simRef = useRef<ScenarioSimulator | null>(null);
  if (simRef.current === null) simRef.current = newSim();

  const [state, setState] = useState<MatchState>(() => simRef.current!.getState());
  const [steps, setSteps] = useState(0);

  const sim = simRef.current;

  const legalActionsFor = (tokenId: string): Action[] =>
    legalActions(state, state.activeSide, providers).filter(
      (a) => a.type !== 'end-turn' && 'tokenId' in a && a.tokenId === tokenId,
    );

  const onAct = (action: Action): void => {
    const before = sim.getState();
    const after = sim.step(action);
    if (after !== before) {
      setState(after);
      setSteps(sim.history().length);
    }
  };

  const reset = (): void => {
    simRef.current = newSim();
    setState(simRef.current.getState());
    setSteps(0);
  };

  const over = sim.isOver();

  return (
    <div className="kt-scenario">
      <header className="kt-scenario-head">
        <h1 className="kt-title">Scenario</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={() => navigate('menu')}>
          Back to menu
        </button>
      </header>

      <div className="kt-hud" aria-label="Scenario status">
        <span>Turn {state.turn}</span>
        <span>·</span>
        <span>Controlling: Side {state.activeSide}</span>
        <span>·</span>
        <span>Steps: {steps}</span>
      </div>

      {over ? (
        <div className="kt-banner" role="status">
          <h2 className="kt-banner-title">
            Scenario complete — winner {String(state.winner ?? 'draw')}
          </h2>
          <div className="kt-banner-actions">
            <button type="button" className="kt-btn kt-btn--primary" onClick={reset}>
              Reset scenario
            </button>
            <button type="button" className="kt-btn" onClick={() => navigate('menu')}>
              Back to menu
            </button>
          </div>
        </div>
      ) : (
        <>
          <Arena
            state={state}
            controllableSide={state.activeSide}
            legalActionsFor={legalActionsFor}
            onAct={onAct}
          />
          <div className="kt-scenario-controls">
            <button type="button" className="kt-btn" onClick={reset}>
              Reset scenario
            </button>
          </div>
        </>
      )}
    </div>
  );
}
