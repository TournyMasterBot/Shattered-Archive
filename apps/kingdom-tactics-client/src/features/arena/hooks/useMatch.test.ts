import { renderHook, act as rtlAct } from '@testing-library/react';
import {
  GreedyPolicy,
  type ArmyRoster,
  type MoveAction,
} from '@shatteredarchive/kingdom-tactics-engine';

import { useMatch } from './useMatch';

const warrior = (side: number): ArmyRoster => ({
  side,
  picks: [{ raceKey: 'Human', classKey: 'Warrior' }],
});

describe('useMatch', () => {
  it('applies a legal move and rejects an illegal action', () => {
    const { result } = renderHook(() =>
      useMatch({ modeId: 'duel', rosters: [warrior(0), warrior(1)], seed: 1 }),
    );

    const before = result.current.snapshot;
    const unit = before.tokens.find((t) => t.side === 0)!;
    const moves = result.current
      .legalActionsFor(unit.instanceId)
      .filter((a): a is MoveAction => a.type === 'move');
    expect(moves.length).toBeGreaterThan(0);

    let ok = false;
    rtlAct(() => {
      ok = result.current.act(moves[0]);
    });
    expect(ok).toBe(true);
    expect(result.current.snapshot).not.toBe(before);
    const moved = result.current.snapshot.tokens.find((t) => t.instanceId === unit.instanceId)!;
    expect(moved.pos).toEqual(moves[0].to);

    // Illegal: attack a target that does not exist → engine no-ops, act returns false.
    let ok2 = true;
    rtlAct(() => {
      ok2 = result.current.act({ type: 'attack', tokenId: unit.instanceId, targetId: 'nope' });
    });
    expect(ok2).toBe(false);
  });

  it('runAi drives the AI seat then hands back to the human (or decides)', () => {
    const { result } = renderHook(() =>
      useMatch({
        modeId: 'duel',
        rosters: [warrior(0), warrior(1)],
        seed: 1,
        aiPolicies: { 1: new GreedyPolicy() },
      }),
    );

    rtlAct(() => {
      result.current.act({ type: 'end-turn', side: 0 });
    });
    expect(result.current.snapshot.activeSide).toBe(1);

    rtlAct(() => {
      result.current.runAi();
    });
    const s = result.current.snapshot;
    expect(s.status === 'decided' || s.activeSide === 0).toBe(true);
  });

  it('reset rebuilds the original match', () => {
    const { result } = renderHook(() =>
      useMatch({ modeId: 'duel', rosters: [warrior(0), warrior(1)], seed: 1 }),
    );
    const start = result.current.snapshot;
    const unit = start.tokens.find((t) => t.side === 0)!;
    const move = result.current
      .legalActionsFor(unit.instanceId)
      .find((a): a is MoveAction => a.type === 'move')!;
    rtlAct(() => {
      result.current.act(move);
    });
    expect(result.current.snapshot).not.toEqual(start);
    rtlAct(() => {
      result.current.reset();
    });
    expect(result.current.snapshot).toEqual(start);
  });
});
