import type { IGameDataProvider } from '../data/index.js';
import type {
  AttackPattern,
  Board,
  Coord,
  MatchState,
  Tile,
  Unit,
  UnitTemplate,
} from '../model/index.js';
import { inAttackPattern, legalTargets, splashTargets } from './targeting.js';

// --- test doubles -----------------------------------------------------------

const BASE_TEMPLATE: UnitTemplate = {
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

/** Provider stub: targeting calls unitTemplate (for the attack pattern) + terrainEffect
 * (for LoS). `attack` sets the attacker's pattern; `blocking` marks blocksLoS terrains. */
function stubProvider(attack: AttackPattern, blocking: string[] = []): IGameDataProvider {
  return {
    unitTemplate: () => ({ ...BASE_TEMPLATE, attack }),
    terrainEffect: (key: string) => ({
      terrainKey: key,
      moveCost: 1,
      passable: { ground: true, flying: true, aquatic: true },
      cover: 0,
      blocksLoS: blocking.includes(key),
    }),
  } as unknown as IGameDataProvider;
}

function board(w: number, h: number, terrainAt?: (c: Coord) => string): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: terrainAt?.({ x, y }) ?? 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(instanceId: string, pos: Coord, side = 0, hp = 20): Unit {
  return { kind: 'unit', instanceId, templateId: 'Test:Unit', side, pos, hp, statuses: [], hasMoved: false, hasActed: false };
}

function state(b: Board, tokens: Unit[]): MatchState {
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

// --- inAttackPattern geometry ----------------------------------------------

describe('inAttackPattern', () => {
  const at = (kind: AttackPattern['kind'], range: number, minRange = 1): AttackPattern => ({
    kind,
    range,
    minRange,
    areaRadius: 0,
  });
  const O = { x: 5, y: 5 };

  it('melee range 1 hits the 8 adjacent tiles only', () => {
    expect(inAttackPattern(O, { x: 6, y: 5 }, at('melee', 1))).toBe(true);
    expect(inAttackPattern(O, { x: 6, y: 6 }, at('melee', 1))).toBe(true);
    expect(inAttackPattern(O, { x: 7, y: 5 }, at('melee', 1))).toBe(false);
  });

  it('orthogonal requires a shared row/column within range', () => {
    expect(inAttackPattern(O, { x: 5, y: 9 }, at('orthogonal', 4))).toBe(true); // 4 straight
    expect(inAttackPattern(O, { x: 6, y: 6 }, at('orthogonal', 4))).toBe(false); // diagonal
    expect(inAttackPattern(O, { x: 5, y: 10 }, at('orthogonal', 4))).toBe(false); // out of range
  });

  it('diagonal requires |dx|==|dy|', () => {
    expect(inAttackPattern(O, { x: 8, y: 8 }, at('diagonal', 4))).toBe(true);
    expect(inAttackPattern(O, { x: 8, y: 7 }, at('diagonal', 4))).toBe(false);
  });

  it('omni allows any of the 8 lines; minRange excludes closer tiles', () => {
    expect(inAttackPattern(O, { x: 7, y: 5 }, at('omni', 3, 2))).toBe(true);
    expect(inAttackPattern(O, { x: 6, y: 5 }, at('omni', 3, 2))).toBe(false); // inside minRange
    expect(inAttackPattern(O, { x: 6, y: 4 }, at('omni', 3, 1))).toBe(true); // diagonal 1
  });
});

// --- legalTargets -----------------------------------------------------------

describe('legalTargets', () => {
  it('melee attacker hits an adjacent enemy but not an ally', () => {
    const p = stubProvider({ kind: 'melee', range: 1, minRange: 1, areaRadius: 0 });
    const s = state(board(10, 10), [
      unit('me', { x: 5, y: 5 }, 0),
      unit('foe', { x: 6, y: 5 }, 1),
      unit('friend', { x: 4, y: 5 }, 0),
    ]);
    expect(legalTargets(s, 'me', p)).toEqual(['foe']);
  });

  it('excludes dead enemies', () => {
    const p = stubProvider({ kind: 'melee', range: 1, minRange: 1, areaRadius: 0 });
    const s = state(board(10, 10), [
      unit('me', { x: 5, y: 5 }, 0),
      unit('corpse', { x: 6, y: 5 }, 1, 0),
    ]);
    expect(legalTargets(s, 'me', p)).toEqual([]);
  });

  it('ranged attacker respects range and minRange', () => {
    const p = stubProvider({ kind: 'orthogonal', range: 4, minRange: 2, areaRadius: 0 });
    const s = state(board(12, 12), [
      unit('me', { x: 5, y: 5 }, 0),
      unit('tooClose', { x: 6, y: 5 }, 1), // dist 1 < minRange 2
      unit('inRange', { x: 8, y: 5 }, 1), // dist 3
      unit('tooFar', { x: 11, y: 5 }, 1), // dist 6 > range 4
    ]);
    expect(legalTargets(s, 'me', p)).toEqual(['inRange']);
  });

  it('line-of-sight blocks a ranged target behind blocking terrain', () => {
    const isWall = (c: Coord) => (c.x === 7 ? 'Forest' : 'Field');
    const p = stubProvider({ kind: 'orthogonal', range: 5, minRange: 1, areaRadius: 0 }, ['Forest']);
    const s = state(board(12, 12, isWall), [
      unit('me', { x: 5, y: 5 }, 0),
      unit('behindWall', { x: 9, y: 5 }, 1), // line passes through x=7 Forest
    ]);
    expect(legalTargets(s, 'me', p)).toEqual([]);
  });
});

// --- splashTargets ----------------------------------------------------------

describe('splashTargets', () => {
  it('returns all living tokens within Chebyshev radius, both sides', () => {
    const p = stubProvider({ kind: 'omni', range: 3, minRange: 1, areaRadius: 1 });
    const s = state(board(10, 10), [
      unit('center', { x: 5, y: 5 }, 1),
      unit('adjacentFoe', { x: 6, y: 6 }, 1),
      unit('adjacentFriend', { x: 4, y: 5 }, 0),
      unit('outside', { x: 8, y: 8 }, 1),
      unit('deadInside', { x: 5, y: 6 }, 1, 0),
    ]);
    const hit = new Set(splashTargets(s, { x: 5, y: 5 }, 1, p));
    expect(hit.has('center')).toBe(true);
    expect(hit.has('adjacentFoe')).toBe(true);
    expect(hit.has('adjacentFriend')).toBe(true);
    expect(hit.has('outside')).toBe(false);
    expect(hit.has('deadInside')).toBe(false);
  });
});
