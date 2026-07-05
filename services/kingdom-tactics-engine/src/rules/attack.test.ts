import { createGameDataProvider } from '../data/index.js';
import type { Board, Coord, MatchState, Tile, Unit } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import { legalTargets } from './targeting.js';
import { resolveDamage } from './damage.js';
import { applyAbility, applyAttack, type AbilitySpec } from './attack.js';
import { templateForMember } from './squadron.js';

const provider = createGameDataProvider();

/** RNG stub whose `int` returns a fixed value (controls maladiction landing deterministically). */
function fixedRng(intResult: number): ISeededRng {
  return {
    next: () => 0,
    int: () => intResult,
    pick: <T>(arr: readonly T[]): T => arr[0],
    state: () => 0,
    clone(): ISeededRng {
      return this;
    },
  };
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

function unit(instanceId: string, templateId: string, pos: Coord, side: number): Unit {
  return { kind: 'unit', instanceId, templateId, side, pos, hp: 999, statuses: [], hasMoved: false, hasActed: false };
}

function state(tokens: Unit[]): MatchState {
  return {
    modeId: 'skirmish',
    board: board(10, 10),
    armies: [],
    tokens,
    turn: 1,
    activeSide: 0,
    moon: { type: 'White', phase: 'HalfMoon' },
    rngState: 1,
    status: 'in-progress',
  };
}

describe('applyAttack (integration, real provider)', () => {
  it('a melee unit can target an adjacent enemy and applyAttack reduces its hp by the resolved amount', () => {
    const attacker = unit('a', 'Human:Warrior', { x: 5, y: 5 }, 0);
    const defender = unit('d', 'Human:Warrior', { x: 6, y: 5 }, 1);
    const s = state([attacker, defender]);

    expect(legalTargets(s, 'a', provider)).toContain('d');

    const expected = resolveDamage({
      attacker: templateForMember('Human:Warrior', provider),
      defender: templateForMember('Human:Warrior', provider),
      defenderTerrainKey: 'Field',
      moonPhase: 'HalfMoon',
      defenderStatusKeys: [],
      provider,
    }).amount;

    const next = applyAttack(s, 'a', 'd', provider);
    const hurt = next.tokens.find((t) => t.instanceId === 'd') as Unit;
    const acted = next.tokens.find((t) => t.instanceId === 'a') as Unit;
    expect(hurt.hp).toBe(999 - expected);
    expect(acted.hasActed).toBe(true);
    // Input state is untouched (pure).
    expect((s.tokens.find((t) => t.instanceId === 'd') as Unit).hp).toBe(999);
  });

  it('an out-of-range target is a no-op', () => {
    const s = state([
      unit('a', 'Human:Warrior', { x: 0, y: 0 }, 0),
      unit('d', 'Human:Warrior', { x: 9, y: 9 }, 1),
    ]);
    expect(applyAttack(s, 'a', 'd', provider)).toBe(s);
  });
});

describe('applyAbility (two-part: damage auto-hits, maladiction rolls save)', () => {
  const spell: AbilitySpec = {
    key: 'frostbolt',
    damage: true,
    maladiction: { status: { key: 'chilled', remaining: 2 }, saves: 0 },
  };

  it('applies damage AND appends the maladiction when the save lands', () => {
    const s = state([
      unit('mage', 'Human:Mage', { x: 5, y: 5 }, 0),
      unit('foe', 'Human:Warrior', { x: 6, y: 5 }, 1),
    ]);
    const next = applyAbility(s, 'mage', 'foe', spell, provider, fixedRng(0)); // roll 1 → lands
    const foe = next.tokens.find((t) => t.instanceId === 'foe') as Unit;
    expect(foe.hp).toBeLessThan(999); // damage auto-hit
    expect(foe.statuses.map((x) => x.key)).toContain('chilled');
  });

  it('still applies damage but NOT the maladiction when the save fails', () => {
    const s = state([
      unit('mage', 'Human:Mage', { x: 5, y: 5 }, 0),
      unit('foe', 'Human:Warrior', { x: 6, y: 5 }, 1),
    ]);
    const next = applyAbility(s, 'mage', 'foe', spell, provider, fixedRng(99)); // roll 100 → misses
    const foe = next.tokens.find((t) => t.instanceId === 'foe') as Unit;
    expect(foe.hp).toBeLessThan(999); // damage still auto-hits
    expect(foe.statuses.map((x) => x.key)).not.toContain('chilled');
  });
});
