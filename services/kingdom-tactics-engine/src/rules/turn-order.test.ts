import type { IGameDataProvider } from '../data/index.js';
import type { Board, Coord, MatchState, Squadron, Tile, Unit, UnitTemplate } from '../model/index.js';
import { nextActiveSide, turnOrder } from './turn-order.js';

// --- test doubles -----------------------------------------------------------

const BASE: UnitTemplate = {
  id: 'Test:Unit',
  raceKey: 'Test',
  classKey: 'Unit',
  name: 'Test Unit',
  maxHp: 20,
  stats: { str: 10, int: 10, wis: 10, dex: 10, con: 10 },
  move: { kind: 'orthogonal', range: 1, jumps: false },
  attack: { kind: 'melee', range: 1, minRange: 1, areaRadius: 0 },
  attackPower: 5,
  defense: 5,
  movementClass: 'ground',
  damageType: 'Slash',
  armorType: 'Cloth',
  abilities: [],
  resistances: [],
  vulnerabilities: [],
  traits: [],
  cost: 1,
};

/** Provider stub: turn-order calls unitTemplate(raceKey, classKey); dex keyed by id. */
function stubProvider(dexByTemplate: Record<string, number> = {}): IGameDataProvider {
  return {
    unitTemplate: (raceKey: string, classKey: string): UnitTemplate => {
      const id = `${raceKey}:${classKey}`;
      return { ...BASE, id, raceKey, classKey, stats: { ...BASE.stats, dex: dexByTemplate[id] ?? 10 } };
    },
  } as unknown as IGameDataProvider;
}

function board(w: number, h: number): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(instanceId: string, side: number, hp: number, templateId = 'Test:Unit'): Unit {
  return { kind: 'unit', instanceId, templateId, side, pos: { x: 0, y: 0 }, hp, statuses: [], hasMoved: false, hasActed: false };
}

function squadron(instanceId: string, side: number, hpPool: number, memberTemplateIds: string[]): Squadron {
  return {
    kind: 'squadron',
    instanceId,
    side,
    pos: { x: 0, y: 0 },
    members: memberTemplateIds.map((templateId) => ({ templateId, count: 1 })),
    hpPool,
    maxHpPool: hpPool,
    statuses: [],
    hasMoved: false,
    hasActed: false,
  };
}

function state(b: Board, tokens: (Unit | Squadron)[]): MatchState {
  return {
    modeId: 'skirmish',
    board: b,
    armies: [],
    tokens,
    turn: 1,
    activeSide: 0,
    moon: { type: 'White', phase: 'FullMoon' },
    rngState: 1,
    status: 'in-progress',
  };
}

// --- tests ------------------------------------------------------------------

describe('turnOrder', () => {
  const dex = { 'Human:Warrior': 10, 'Human:Rogue': 15, 'Human:Wizard': 5 };

  it('orders by initiative (highest dexterity first)', () => {
    const s = state(board(4, 4), [
      unit('u1', 0, 20, 'Human:Warrior'),
      unit('u2', 0, 20, 'Human:Rogue'),
      unit('u3', 0, 20, 'Human:Wizard'),
    ]);
    expect(turnOrder(s, stubProvider(dex))).toEqual(['u2', 'u1', 'u3']);
  });

  it('breaks ties stably by instanceId', () => {
    const tie = { 'Human:Warrior': 10, 'Human:Rogue': 10, 'Human:Wizard': 10 };
    const s = state(board(4, 4), [
      unit('u3', 0, 20, 'Human:Wizard'),
      unit('u1', 0, 20, 'Human:Warrior'),
      unit('u2', 0, 20, 'Human:Rogue'),
    ]);
    expect(turnOrder(s, stubProvider(tie))).toEqual(['u1', 'u2', 'u3']);
  });

  it('excludes dead tokens', () => {
    const s = state(board(4, 4), [
      unit('u1', 0, 20, 'Human:Warrior'),
      unit('u2', 0, 0, 'Human:Rogue'), // dead
      unit('u3', 0, 20, 'Human:Wizard'),
    ]);
    expect(turnOrder(s, stubProvider(dex))).toEqual(['u1', 'u3']);
  });

  it('uses a squadron’s fastest member for initiative', () => {
    const s = state(board(4, 4), [
      squadron('s1', 0, 20, ['Human:Warrior', 'Human:Rogue']), // fastest = Rogue (15)
      unit('u1', 0, 20, 'Human:Wizard'), // 5
    ]);
    expect(turnOrder(s, stubProvider(dex))).toEqual(['s1', 'u1']);
  });
});

describe('nextActiveSide', () => {
  it('cycles two sides', () => {
    const s = state(board(4, 4), [unit('u1', 0, 20), unit('u2', 1, 20)]);
    expect(nextActiveSide({ ...s, activeSide: 0 })).toBe(1);
    expect(nextActiveSide({ ...s, activeSide: 1 })).toBe(0);
  });

  it('cycles three sides in ascending order, wrapping', () => {
    const s = state(board(4, 4), [unit('u1', 0, 20), unit('u2', 2, 20), unit('u3', 1, 20)]);
    expect(nextActiveSide({ ...s, activeSide: 0 })).toBe(1);
    expect(nextActiveSide({ ...s, activeSide: 1 })).toBe(2);
    expect(nextActiveSide({ ...s, activeSide: 2 })).toBe(0);
  });

  it('returns 0 when no side has living tokens', () => {
    const s = state(board(4, 4), [unit('u1', 0, 0), unit('u2', 1, 0)]);
    expect(nextActiveSide(s)).toBe(0);
  });
});
