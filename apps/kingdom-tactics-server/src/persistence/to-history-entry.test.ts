import {
  createGameDataProvider,
  createGameModeProvider,
  createRng,
  GreedyPolicy,
  MatchSession,
  type Board,
  type EngineProviders,
  type MatchState,
  type Tile,
  type Unit,
} from '@shatteredarchive/kingdom-tactics-engine';
import { toHistoryEntry } from './to-history-entry.js';

const providers: EngineProviders = { data: createGameDataProvider(), modes: createGameModeProvider() };

function board(w: number, h: number): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(instanceId: string, pos: { x: number; y: number }, side: number, hp = 999): Unit {
  return { kind: 'unit', instanceId, templateId: 'Human:Warrior', side, pos, hp, statuses: [], hasMoved: false, hasActed: false };
}

function dominantMatch(): MatchState {
  return {
    modeId: 'skirmish',
    board: board(8, 8),
    armies: [],
    tokens: [unit('a1', { x: 3, y: 3 }, 0), unit('a2', { x: 3, y: 4 }, 0), unit('d', { x: 4, y: 3 }, 1, 30)],
    turn: 1,
    activeSide: 0,
    moon: { gameHour: 0, sky: { Black: 'HalfMoon', Red: 'HalfMoon', White: 'HalfMoon' } },
    rngState: 1,
    status: 'in-progress',
  };
}

describe('toHistoryEntry', () => {
  it('builds a full entry from a decided session', () => {
    const initial = dominantMatch();
    const session = new MatchSession({
      matchId: 'm1',
      initial,
      providers,
      seed: 1,
      aiPolicies: { 1: new GreedyPolicy() }, // side 0 stays human (claimed below), side 1 is AI
      combatSalt: 42,
    });
    session.claimSeat(0, 'c1', 'acc-1');

    const humanBrain = new GreedyPolicy();
    const chooseRng = createRng(0);
    let guard = 0;
    while (!session.isOver() && guard < 5000) {
      guard++;
      if (session.snapshot().activeSide === 0) {
        const action = humanBrain.chooseAction(session.snapshot(), 0, providers, chooseRng);
        const res = session.applyClientAction('c1', action);
        if ('error' in res) {
          const ended = session.applyClientAction('c1', { type: 'end-turn', side: 0 });
          if ('error' in ended) break;
        }
      } else if (session.runAiUntilHuman().length === 0) {
        break;
      }
    }
    expect(session.isOver()).toBe(true);

    const entry = toHistoryEntry(session);
    expect(entry.matchId).toBe('m1');
    expect(entry.participants).toEqual([{ side: 0, accountId: 'acc-1' }]);
    expect(entry.winner).toBe(session.winner());
    expect(entry.initial).toBe(initial);
    expect(entry.actionLog).toEqual(session.getActionLog());
    expect(entry.replaySeed).toEqual({ seed: 1, combatSalt: 42 });
    expect(entry.id).toMatch(/^[0-9a-f]{16}$/);
    expect(() => new Date(entry.playedAt).toISOString()).not.toThrow();
  });

  it('gives each call a fresh, distinct id', () => {
    const session = new MatchSession({
      matchId: 'm2',
      initial: dominantMatch(),
      providers,
      seed: 1,
      aiPolicies: { 0: new GreedyPolicy(), 1: new GreedyPolicy() },
      combatSalt: 42,
    });
    while (!session.isOver()) {
      if (session.runAiUntilHuman().length === 0) break;
    }
    const a = toHistoryEntry(session);
    const b = toHistoryEntry(session);
    expect(a.id).not.toBe(b.id);
  });
});
