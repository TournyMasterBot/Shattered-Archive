import { createGameDataProvider, createGameModeProvider, GreedyPolicy } from '../index.js';
import type { ArmyRoster, EngineProviders, MoveAction } from '../index.js';
import { createLocalMatch } from './local-match.js';

const providers: EngineProviders = {
  data: createGameDataProvider(),
  modes: createGameModeProvider(),
};

const warrior = (side: number): ArmyRoster => ({
  side,
  picks: [{ raceKey: 'Human', classKey: 'Warrior' }],
});

const rosters: readonly ArmyRoster[] = [warrior(0), warrior(1)];

function firstMoveFor(match: ReturnType<typeof createLocalMatch>, tokenId: string): MoveAction {
  const move = match.legalActionsFor(tokenId).find((a): a is MoveAction => a.type === 'move');
  if (!move) throw new Error('no legal move');
  return move;
}

describe('LocalMatch (hotseat / single-device)', () => {
  it('lets the local player act for whichever side is active (hotseat), but not off-turn', () => {
    const match = createLocalMatch({ modeId: 'duel', rosters, providers, seed: 1 });
    const start = match.snapshot();
    const u0 = start.tokens.find((t) => t.side === 0)!;
    const u1 = start.tokens.find((t) => t.side === 1)!;

    // Off-turn (side 1 while side 0 is active): the reducer's active-side lock rejects it.
    expect(match.act({ type: 'move', tokenId: u1.instanceId, to: { x: 0, y: 0 } })).toBe(false);

    // Side 0 acts, then passes the device: side 1 becomes active and the SAME local seat may act.
    expect(match.act(firstMoveFor(match, u0.instanceId))).toBe(true);
    expect(match.act({ type: 'end-turn', side: 0 })).toBe(true);
    expect(match.snapshot().activeSide).toBe(1);
    expect(match.act(firstMoveFor(match, u1.instanceId))).toBe(true);
  });

  it('drives an AI seat and hands control back to the local human (single-player)', () => {
    const match = createLocalMatch({
      modeId: 'duel',
      rosters,
      providers,
      seed: 1,
      aiPolicies: { 1: new GreedyPolicy() },
    });
    expect(match.act({ type: 'end-turn', side: 0 })).toBe(true);
    expect(match.snapshot().activeSide).toBe(1);
    expect(match.runAi()).toBe(true);
    const s = match.snapshot();
    expect(s.status === 'decided' || s.activeSide === 0).toBe(true);
  });

  it('is deterministic from the seed — avoidance rolls included (seed-derived salt)', () => {
    const both = { modeId: 'duel' as const, rosters, providers, seed: 7, aiPolicies: { 0: new GreedyPolicy(), 1: new GreedyPolicy() } };
    const a = createLocalMatch(both);
    while (a.runAi()) { /* play out */ }
    const b = createLocalMatch(both);
    while (b.runAi()) { /* play out */ }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('reset rebuilds the original match byte-identically', () => {
    const match = createLocalMatch({ modeId: 'duel', rosters, providers, seed: 1 });
    const start = match.snapshot();
    const u0 = start.tokens.find((t) => t.side === 0)!;
    match.act(firstMoveFor(match, u0.instanceId));
    expect(match.snapshot()).not.toEqual(start);
    match.reset();
    expect(match.snapshot()).toEqual(start);
  });
});
