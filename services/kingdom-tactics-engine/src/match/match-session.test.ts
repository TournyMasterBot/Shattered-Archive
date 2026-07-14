import {
  createGameDataProvider,
  createGameModeProvider,
  createRng,
  GreedyPolicy,
} from '../index.js';
import type {
  Board,
  Coord,
  EngineProviders,
  MatchState,
  Side,
  Tile,
  Unit,
} from '../index.js';
import { MatchSession } from './match-session.js';

const providers: EngineProviders = {
  data: createGameDataProvider(),
  modes: createGameModeProvider(),
};

function board(w: number, h: number): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(instanceId: string, templateId: string, pos: Coord, side: number, hp = 999): Unit {
  return { kind: 'unit', instanceId, templateId, side, pos, hp, statuses: [], hasMoved: false, hasActed: false };
}

function state(tokens: Unit[], w = 6, h = 6): MatchState {
  return {
    modeId: 'skirmish',
    board: board(w, h),
    armies: [],
    tokens,
    turn: 1,
    activeSide: 0,
    moon: { gameHour: 0, sky: { Black: 'HalfMoon', Red: 'HalfMoon', White: 'HalfMoon' } },
    rngState: 1,
    status: 'in-progress',
  };
}

/** A tiny 1v1 duel on a 6×6 (token 'a' = side 0, token 'd' = side 1). */
function duel(): MatchState {
  return state([
    unit('a', 'Human:Warrior', { x: 1, y: 1 }, 0),
    unit('d', 'Human:Warrior', { x: 4, y: 4 }, 1),
  ]);
}

function session(initial: MatchState): MatchSession {
  return new MatchSession({
    matchId: 'm1',
    initial,
    providers,
    seed: 1,
    aiPolicies: { 1: new GreedyPolicy() },
    combatSalt: 42, // fixed so combat reactions are deterministic in tests
  });
}

describe('MatchSession', () => {
  it('claims a free human seat; rejects AI-controlled and taken seats', () => {
    const s = session(duel());
    expect(s.claimSeat(0, 'c1')).toEqual({ ok: true });
    expect(s.claimSeat(0, 'c1')).toEqual({ ok: true }); // idempotent re-claim by the same client
    expect(s.claimSeat(1, 'c2').ok).toBe(false); // side 1 is AI-controlled
    expect(s.claimSeat(0, 'c2').ok).toBe(false); // side 0 is already held by c1
  });

  it('rejects an action for a side the caller does not own', () => {
    const s = session(duel());
    s.claimSeat(0, 'c1');
    const endEnemy = s.applyClientAction('c1', { type: 'end-turn', side: 1 as Side });
    expect('error' in endEnemy).toBe(true);
    const moveEnemy = s.applyClientAction('c1', { type: 'move', tokenId: 'd', to: { x: 3, y: 3 } });
    expect('error' in moveEnemy).toBe(true);
  });

  it('applies a legal action and advances the state (new snapshot ref)', () => {
    const s = session(duel());
    s.claimSeat(0, 'c1');
    const before = s.snapshot();
    const res = s.applyClientAction('c1', { type: 'move', tokenId: 'a', to: { x: 2, y: 1 } });
    expect('error' in res).toBe(false);
    expect(s.snapshot()).not.toBe(before);
    const moved = s.snapshot().tokens.find((t) => t.instanceId === 'a');
    expect(moved?.pos).toEqual({ x: 2, y: 1 });
  });

  it('runAiUntilHuman drives the AI seat and hands control back at the human turn', () => {
    const s = session(duel());
    s.claimSeat(0, 'c1');
    // Human ends its turn → side 1 (AI) becomes active.
    const end = s.applyClientAction('c1', { type: 'end-turn', side: 0 });
    expect('state' in end).toBe(true);
    expect(s.snapshot().activeSide).toBe(1);

    const snaps = s.runAiUntilHuman();
    expect(snaps.length).toBeGreaterThan(0);
    // Control returns to the human seat (or the match has ended).
    expect(s.isOver() || s.snapshot().activeSide === 0).toBe(true);
  });

  it('plays a full human(0) + Greedy AI(1) duel through to a decision', () => {
    // Dominant side 0 (two warriors) vs a lone weak defender — a known side-0 victory.
    const initial = state(
      [
        unit('a1', 'Human:Warrior', { x: 3, y: 3 }, 0),
        unit('a2', 'Human:Warrior', { x: 3, y: 4 }, 0),
        unit('d', 'Human:Warrior', { x: 4, y: 3 }, 1, 30),
      ],
      8,
      8,
    );
    const s = new MatchSession({ matchId: 'm2', initial, providers, seed: 1, aiPolicies: { 1: new GreedyPolicy() }, combatSalt: 42 });
    s.claimSeat(0, 'c1');

    // The "human" plays greedily too, routed through applyClientAction (proves the server accepts
    // a full sequence of legal human actions through to victory).
    const humanBrain = new GreedyPolicy();
    const chooseRng = createRng(0); // GreedyPolicy is rng-free; a throwaway stream satisfies the signature.

    let guard = 0;
    while (!s.isOver() && guard < 5000) {
      guard++;
      if (s.snapshot().activeSide === 0) {
        const action = humanBrain.chooseAction(s.snapshot(), 0, providers, chooseRng);
        const res = s.applyClientAction('c1', action);
        if ('error' in res) {
          const ended = s.applyClientAction('c1', { type: 'end-turn', side: 0 });
          if ('error' in ended) break;
        }
      } else {
        const snaps = s.runAiUntilHuman();
        if (snaps.length === 0) break;
      }
    }

    expect(s.isOver()).toBe(true);
    expect(s.winner()).toBe(0);
  });
});

describe('MatchSession — salted combat RNG', () => {
  /** A both-sides-AI duel that plays to completion under one salt (drives many combat rolls). */
  function bothAiDuel(combatSalt: number): MatchSession {
    const initial = state([
      unit('a', 'Human:Warrior', { x: 1, y: 1 }, 0, 60),
      unit('d', 'Human:Warrior', { x: 4, y: 4 }, 1, 60),
    ]);
    return new MatchSession({
      matchId: 'r',
      initial,
      providers,
      seed: 1,
      aiPolicies: { 0: new GreedyPolicy(), 1: new GreedyPolicy() },
      combatSalt,
    });
  }

  it('same salt + same action order replays an identical outcome', () => {
    const a = bothAiDuel(777);
    a.runAiUntilHuman();
    const b = bothAiDuel(777);
    b.runAiUntilHuman();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.winner()).toBe(b.winner());
  });

  it('a different salt diverges (avoidance rolls differ over a full match)', () => {
    const a = bothAiDuel(777);
    a.runAiUntilHuman();
    const b = bothAiDuel(987654321);
    b.runAiUntilHuman();
    // Many salted dodge/parry/block rolls across a full duel ⇒ the trajectories differ.
    expect(a.snapshot()).not.toEqual(b.snapshot());
  });

  it('the secret salt never appears in a broadcast snapshot', () => {
    const salt = 0xabcdef;
    const s = bothAiDuel(salt);
    s.runAiUntilHuman();
    const json = JSON.stringify(s.snapshot());
    expect(json).not.toContain('combatSalt');
    expect(json).not.toContain(String(salt));
  });
});
