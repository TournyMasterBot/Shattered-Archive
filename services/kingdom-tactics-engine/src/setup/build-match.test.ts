import { createGameDataProvider, createGameModeProvider } from '../data/index.js';
import type { BoardToken, Unit } from '../model/index.js';
import type { EngineProviders } from '../engine/game-engine.js';
import { legalActions } from '../engine/game-engine.js';
import { buildMatch, rosterCost, validateRoster, type ArmyRoster } from './build-match.js';

const isUnit = (t: BoardToken): t is Unit => t.kind === 'unit';

const providers: EngineProviders = {
  data: createGameDataProvider(),
  modes: createGameModeProvider(),
};

const warrior = (side: number): ArmyRoster => ({
  side,
  picks: [{ raceKey: 'Human', classKey: 'Warrior' }],
});

describe('rosterCost', () => {
  it('sums each picked template cost', () => {
    const roster: ArmyRoster = {
      side: 0,
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    };
    const one = providers.data.unitTemplate('Human', 'Warrior').cost;
    expect(rosterCost(roster, providers)).toBe(one * 2);
  });

  it('is 0 for an empty roster', () => {
    expect(rosterCost({ side: 0, picks: [] }, providers)).toBe(0);
  });
});

describe('validateRoster', () => {
  it("passes a within-budget 'points' roster and fails an over-budget one", () => {
    const squadron = providers.modes.mode('squadron'); // 60 points (large-scale, still points)
    expect(validateRoster(warrior(0), squadron, providers).ok).toBe(true);

    const unitCost = providers.data.unitTemplate('Human', 'Warrior').cost;
    const overCount = Math.floor(squadron.budget / unitCost) + 2;
    const over: ArmyRoster = {
      side: 0,
      picks: Array.from({ length: overCount }, () => ({ raceKey: 'Human', classKey: 'Warrior' })),
    };
    const res = validateRoster(over, squadron, providers);
    expect(res.ok).toBe(false);
  });

  it("caps 'units' budgets by pick count, not points", () => {
    const duel = providers.modes.mode('duel'); // budget 1 unit
    expect(validateRoster(warrior(0), duel, providers).ok).toBe(true);
    const two: ArmyRoster = {
      side: 0,
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    };
    expect(validateRoster(two, duel, providers).ok).toBe(false);
  });

  it('rejects an illegal race/class (forbidden race)', () => {
    const skirmish = providers.modes.mode('skirmish');
    const illegal: ArmyRoster = { side: 0, picks: [{ raceKey: 'Pixie', classKey: 'Warrior' }] };
    const res = validateRoster(illegal, skirmish, providers);
    expect(res.ok).toBe(false);
  });

  it('gates a CSR class without an allegiance, allows it with', () => {
    const skirmish = providers.modes.mode('skirmish');
    const csr = { side: 0 as const, picks: [{ raceKey: 'Human', classKey: 'Battlemage' }] };
    expect(validateRoster(csr, skirmish, providers).ok).toBe(false);
    const withCtx: ArmyRoster = { ...csr, context: { allegianceKey: 'Conclave' } };
    expect(validateRoster(withCtx, skirmish, providers).ok).toBe(true);
  });
});

describe('buildMatch', () => {
  it('deploys a 1v1 duel onto opposite rows, in-progress', () => {
    const state = buildMatch('duel', [warrior(0), warrior(1)], providers, { seed: 7 });
    expect(state.status).toBe('in-progress');
    expect(state.modeId).toBe('duel');
    expect(state.turn).toBe(1);
    expect(state.activeSide).toBe(0);
    expect(state.tokens).toHaveLength(2);

    const s0 = state.tokens.find((t) => isUnit(t) && t.side === 0) as Unit;
    const s1 = state.tokens.find((t) => isUnit(t) && t.side === 1) as Unit;
    expect(s0.pos.y).toBe(state.board.height - 1); // side 0 on the bottom edge
    expect(s1.pos.y).toBe(0); // side 1 on the top edge
    expect(s0.instanceId).toBe('s0-u0');
    expect(s1.instanceId).toBe('s1-u0');
    expect(s0.templateId).toBe('Human:Warrior');
    expect(s0.hp).toBe(providers.data.unitTemplate('Human', 'Warrior').maxHp);
    expect(state.armies.map((a) => a.side).sort()).toEqual([0, 1]);
  });

  it('is deterministic — identical rosters + seed yield an equal state', () => {
    const a = buildMatch('duel', [warrior(0), warrior(1)], providers, { seed: 7 });
    const b = buildMatch('duel', [warrior(0), warrior(1)], providers, { seed: 7 });
    expect(b).toEqual(a);
  });

  it('produces a playable state (the active side has legal actions)', () => {
    const state = buildMatch('skirmish', [warrior(0), warrior(1)], providers, { seed: 1 });
    expect(legalActions(state, state.activeSide, providers).length).toBeGreaterThan(0);
  });

  it('throws on an over-budget roster', () => {
    const over: ArmyRoster = {
      side: 0,
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    };
    expect(() => buildMatch('duel', [over, warrior(1)], providers)).toThrow();
  });

  it('rejects squadron modes (deferred to Part C)', () => {
    expect(() => buildMatch('battle', [warrior(0), warrior(1)], providers)).toThrow(/squadron/);
    expect(() => buildMatch('siege', [warrior(0), warrior(1)], providers)).toThrow(/squadron/);
  });

  it('deploys a 4-side FFA onto distinct board edges, playable', () => {
    const state = buildMatch('ffa', [warrior(0), warrior(1), warrior(2), warrior(3)], providers, {
      seed: 5,
    });
    expect(state.modeId).toBe('ffa');
    expect(state.tokens).toHaveLength(4);
    const w = state.board.width;
    const h = state.board.height;
    const bySide = (s: number) => state.tokens.find((t) => t.side === s)!;
    expect(bySide(0).pos.y).toBe(h - 1); // bottom edge
    expect(bySide(1).pos.y).toBe(0); // top edge
    expect(bySide(2).pos.x).toBe(0); // left edge
    expect(bySide(3).pos.x).toBe(w - 1); // right edge
    expect(legalActions(state, state.activeSide, providers).length).toBeGreaterThan(0);
  });

  it('authored terrain scatters non-Field tiles but keeps deploy tiles passable + reproducible', () => {
    const flat = buildMatch('skirmish', [warrior(0), warrior(1)], providers, { seed: 1 });
    expect(flat.board.tiles.flat().every((t) => t.terrain === 'Field')).toBe(true);

    const authored = buildMatch('skirmish', [warrior(0), warrior(1)], providers, {
      seed: 1,
      terrain: 'authored',
    });
    const kinds = new Set(authored.board.tiles.flat().map((t) => t.terrain));
    expect(kinds.has('Forest')).toBe(true); // scattered cover
    // Every deployed unit stands on open Field (guaranteed passable).
    for (const t of authored.tokens) {
      expect(authored.board.tiles[t.pos.y][t.pos.x].terrain).toBe('Field');
    }
    // Deterministic for a given (mode, seed), and still playable.
    const again = buildMatch('skirmish', [warrior(0), warrior(1)], providers, {
      seed: 1,
      terrain: 'authored',
    });
    expect(again.board).toEqual(authored.board);
    expect(legalActions(authored, authored.activeSide, providers).length).toBeGreaterThan(0);
  });

  it('spreads multiple units across the deployment row', () => {
    const trio: ArmyRoster = {
      side: 0,
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    };
    const state = buildMatch('squadron', [trio, warrior(1)], providers, { seed: 2 }); // 60-pt budget fits 3×13
    const s0 = state.tokens.filter((t) => t.side === 0);
    expect(s0).toHaveLength(3);
    const xs = new Set(s0.map((t) => t.pos.x));
    expect(xs.size).toBe(3); // distinct columns, no stacking
    expect(s0.every((t) => t.pos.y === state.board.height - 1)).toBe(true);
  });
});
