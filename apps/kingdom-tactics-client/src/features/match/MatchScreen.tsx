import { useEffect, useMemo } from 'react';
import {
  GreedyPolicy,
  type BoardToken,
  type IAiPolicy,
  type MatchState,
  type Side,
} from '@shatteredarchive/kingdom-tactics-engine';

import { Arena, useMatch } from '../arena';
import { useNav, type MatchStartPayload } from '../../state/nav';
import { saveLastMatch } from '../../state/last-match';
import { HUMAN_SIDE, QUICK_MATCH_SETUP } from './quick-match';
import './MatchScreen.css';

/** Whether, from `side`'s view, a decided match is a win/loss/draw (null while in progress). */
export type Outcome = 'victory' | 'defeat' | 'draw';
export function matchOutcome(state: MatchState, side: Side): Outcome | null {
  if (state.status !== 'decided') return null;
  if (state.winner === undefined || state.winner === 'draw') return 'draw';
  return state.winner === side ? 'victory' : 'defeat';
}

const isLiving = (t: BoardToken): boolean => (t.kind === 'unit' ? t.hp > 0 : t.hpPool > 0);

const OUTCOME_TEXT: Record<Outcome, string> = {
  victory: 'Victory!',
  defeat: 'Defeat',
  draw: 'Draw',
};

/**
 * Local match screen: seeds a match from the nav payload (or the default Quick Match) and runs
 * a human(side 0) vs Greedy-AI(side 1) loop over the {@link Arena}. All logic is the engine's —
 * this screen renders the board + a HUD, and an effect auto-plays any AI seat whenever it becomes
 * active (after the human's turn, or on mount). A decided match shows a result banner.
 */
export function MatchScreen({ payload: payloadProp }: { readonly payload?: MatchStartPayload } = {}) {
  const { navigate, state: navState } = useNav();
  const payload = payloadProp ?? navState.matchPayload ?? QUICK_MATCH_SETUP;
  const hotSeat = payload.hotSeat ?? false;

  // Remember the setup so the menu can replay it after a reload.
  useEffect(() => {
    saveLastMatch(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hot-seat: no AI (both seats human). Otherwise Greedy holds every side the human doesn't
  // (side 0) — covers 1v1 and 3–4-side FFA alike.
  const aiPolicies = useMemo<Record<number, IAiPolicy>>(() => {
    const map: Record<number, IAiPolicy> = {};
    if (!hotSeat) for (const r of payload.rosters) if (r.side !== HUMAN_SIDE) map[r.side] = new GreedyPolicy();
    return map;
  }, [payload, hotSeat]);
  const match = useMatch({
    modeId: payload.modeId,
    rosters: payload.rosters,
    seed: payload.seed,
    terrain: payload.terrain,
    aiPolicies,
  });
  const snapshot = match.snapshot;

  // Auto-play AI-controlled seats whenever one is active (covers mount + post-human-action).
  useEffect(() => {
    if (snapshot.status === 'in-progress' && aiPolicies[snapshot.activeSide]) match.runAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // In hot-seat the local player controls whichever side is active; otherwise they hold side 0.
  const controllableSide = hotSeat ? snapshot.activeSide : HUMAN_SIDE;
  const outcome = matchOutcome(snapshot, HUMAN_SIDE);

  const counts = useMemo(() => {
    const map = new Map<Side, number>();
    for (const t of snapshot.tokens) if (isLiving(t)) map.set(t.side, (map.get(t.side) ?? 0) + 1);
    return map;
  }, [snapshot.tokens]);

  const sideName = (side: Side): string =>
    snapshot.armies.find((a) => a.side === side)?.name ??
    (side === HUMAN_SIDE ? 'You' : `Side ${side}`);

  return (
    <div className="kt-match">
      <header className="kt-match-head">
        <h1 className="kt-title">Kingdom Tactics</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={() => navigate('menu')}>
          Back to menu
        </button>
      </header>

      <div className="kt-hud" aria-label="Match status">
        <span>Turn {snapshot.turn}</span>
        <span>·</span>
        <span>Active: {sideName(snapshot.activeSide)}</span>
        <span>·</span>
        {[...counts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([side, n]) => (
            <span key={side} className={`kt-hud-count kt-hud-count--side${side}`}>
              {sideName(side)}: {n}
            </span>
          ))}
        <span>·</span>
        <span title="Each moon empowers its alignment: White→Good, Red→Neutral, Black→Evil">
          Moons: ○White {snapshot.moon.sky.White} · ◐Red {snapshot.moon.sky.Red} · ●Black{' '}
          {snapshot.moon.sky.Black}
        </span>
      </div>

      {snapshot.status === 'decided' ? (
        <div className="kt-banner" role="status">
          <h2 className="kt-banner-title">
            {hotSeat
              ? snapshot.winner === undefined || snapshot.winner === 'draw'
                ? 'Draw'
                : `${sideName(snapshot.winner)} wins`
              : OUTCOME_TEXT[outcome ?? 'draw']}
          </h2>
          <div className="kt-banner-actions">
            <button type="button" className="kt-btn kt-btn--primary" onClick={match.reset}>
              Rematch
            </button>
            <button type="button" className="kt-btn" onClick={() => navigate('menu')}>
              Back to menu
            </button>
          </div>
        </div>
      ) : (
        <Arena
          state={snapshot}
          controllableSide={controllableSide}
          legalActionsFor={match.legalActionsFor}
          legalAbilitiesFor={match.legalAbilitiesFor}
          onAct={match.act}
        />
      )}
    </div>
  );
}
