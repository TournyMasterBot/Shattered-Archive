import type { IGameDataProvider } from '../data/index.js';
import type {
  Board,
  Coord,
  MatchState,
  MovePattern,
  MovementClass,
  Tile,
  Unit,
  UnitTemplate,
} from '../model/index.js';
import { legalMoves } from './movement.js';
import { coordKey } from './board.js';

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

/** Provider stub: movement only calls unitTemplate + terrainEffect. */
function stubProvider(
  move: MovePattern,
  opts: { movementClass?: MovementClass; terrain?: Record<string, { moveCost?: number; passable?: Partial<Record<MovementClass, boolean>> }> } = {},
): IGameDataProvider {
  return {
    unitTemplate: () => ({
      ...BASE_TEMPLATE,
      move,
      movementClass: opts.movementClass ?? 'ground',
    }),
    terrainEffect: (key: string) => {
      const o = opts.terrain?.[key] ?? {};
      return {
        terrainKey: key,
        moveCost: o.moveCost ?? 1,
        passable: { ground: true, flying: true, aquatic: true, ...(o.passable ?? {}) },
        cover: 0,
        blocksLoS: false,
      };
    },
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

function unit(instanceId: string, pos: Coord, side = 0): Unit {
  return {
    kind: 'unit',
    instanceId,
    templateId: 'Test:Unit',
    side,
    pos,
    hp: 20,
    statuses: [],
    hasMoved: false,
    hasActed: false,
  };
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

const keys = (cs: Coord[]): Set<string> => new Set(cs.map(coordKey));

// --- tests ------------------------------------------------------------------

describe('legalMoves geometry', () => {
  it('orthogonal range 3 covers the Manhattan disk (24 tiles) on open ground', () => {
    const p = stubProvider({ kind: 'orthogonal', range: 3, jumps: false });
    const moves = legalMoves(state(board(12, 12), [unit('u', { x: 6, y: 6 })]), 'u', p);
    expect(moves).toHaveLength(24);
    expect(keys(moves).has(coordKey({ x: 6, y: 9 }))).toBe(true); // 3 straight
    expect(keys(moves).has(coordKey({ x: 9, y: 9 }))).toBe(false); // diagonal not allowed
    expect(keys(moves).has(coordKey({ x: 6, y: 6 }))).toBe(false); // origin excluded
  });

  it('omni range 2 covers the Chebyshev disk (24 tiles)', () => {
    const p = stubProvider({ kind: 'omni', range: 2, jumps: false });
    const moves = legalMoves(state(board(12, 12), [unit('u', { x: 6, y: 6 })]), 'u', p);
    expect(moves).toHaveLength(24);
    expect(keys(moves).has(coordKey({ x: 8, y: 8 }))).toBe(true); // two diagonals
  });

  it('knight range 1 yields the 8 knight offsets', () => {
    const p = stubProvider({ kind: 'knight', range: 1, jumps: false });
    const moves = legalMoves(state(board(12, 12), [unit('u', { x: 6, y: 6 })]), 'u', p);
    expect(moves).toHaveLength(8);
    expect(keys(moves).has(coordKey({ x: 7, y: 8 }))).toBe(true);
  });
});

describe('legalMoves terrain + blockers', () => {
  it('terrain move cost limits reach (a Forest wall of cost 3 blocks a range-2 mover)', () => {
    const isForest = (c: Coord) => (c.x === 7 ? 'Forest' : 'Field');
    const p = stubProvider(
      { kind: 'orthogonal', range: 2, jumps: false },
      { terrain: { Forest: { moveCost: 3 } } },
    );
    const moves = legalMoves(state(board(12, 12, isForest), [unit('u', { x: 6, y: 6 })]), 'u', p);
    // Entering the Forest column at x=7 costs 3 (> range 2), so x>=7 is unreachable.
    expect([...keys(moves)].every((k) => Number(k.split(',')[0]) <= 6)).toBe(true);
  });

  it('an occupied tile blocks passage and is not a destination', () => {
    const p = stubProvider({ kind: 'orthogonal', range: 3, jumps: false });
    const s = state(board(12, 12), [unit('u', { x: 6, y: 6 }), unit('block', { x: 7, y: 6 })]);
    const moves = legalMoves(s, 'u', p);
    const kk = keys(moves);
    expect(kk.has(coordKey({ x: 7, y: 6 }))).toBe(false); // occupied
    expect(kk.has(coordKey({ x: 8, y: 6 }))).toBe(false); // path blocked at x=7
    expect(kk.has(coordKey({ x: 5, y: 6 }))).toBe(true); // other direction fine
  });

  it('jumps=true ignores an intermediate blocker', () => {
    const p = stubProvider({ kind: 'orthogonal', range: 3, jumps: true });
    const s = state(board(12, 12), [unit('u', { x: 6, y: 6 }), unit('block', { x: 7, y: 6 })]);
    const moves = legalMoves(s, 'u', p);
    expect(keys(moves).has(coordKey({ x: 8, y: 6 }))).toBe(true); // jumped over blocker
    expect(keys(moves).has(coordKey({ x: 7, y: 6 }))).toBe(false); // still can't land on it
  });

  it('impassable terrain for the movement class is excluded', () => {
    const isWater = (c: Coord) => (c.x >= 7 ? 'Water' : 'Field');
    const p = stubProvider(
      { kind: 'orthogonal', range: 3, jumps: false },
      { terrain: { Water: { passable: { ground: false } } } },
    );
    const moves = legalMoves(state(board(12, 12, isWater), [unit('u', { x: 6, y: 6 })]), 'u', p);
    expect([...keys(moves)].every((k) => Number(k.split(',')[0]) <= 6)).toBe(true);
  });
});
