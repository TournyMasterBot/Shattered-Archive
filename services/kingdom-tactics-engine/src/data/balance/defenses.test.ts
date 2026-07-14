import type { UnitTemplate } from '../../model/index.js';
import type { ISeededRng } from '../../rng/index.js';
import { avoidChance, blockChance, dodgeChance, rollAvoidance } from './defenses.js';

function tpl(over: Partial<UnitTemplate>): UnitTemplate {
  return {
    id: 'x',
    raceKey: 'Human',
    classKey: 'Warrior',
    name: 'x',
    maxHp: 30,
    stats: { str: 10, int: 10, wis: 10, dex: 10, con: 10 },
    move: { kind: 'orthogonal', range: 1, jumps: false },
    attack: { kind: 'melee', range: 1, minRange: 1, areaRadius: 0 },
    attackPower: 10,
    defense: 0,
    movementClass: 'ground',
    damageType: 'Slash',
    armorType: 'Cloth',
    abilities: [],
    resistances: [],
    vulnerabilities: [],
    traits: [],
    cost: 10,
    ...over,
  };
}

/** RNG stub whose `next` returns a fixed value (controls avoidance rolls deterministically). */
function nextRng(v: number): ISeededRng {
  return {
    next: () => v,
    int: () => 0,
    pick: <T>(arr: readonly T[]): T => arr[0],
    state: () => 0,
    clone(): ISeededRng {
      return this;
    },
  };
}

describe('defense chances', () => {
  it('dodge rises with dexterity', () => {
    expect(dodgeChance(tpl({ stats: { str: 10, int: 10, wis: 10, dex: 20, con: 10 } }))).toBeGreaterThan(
      dodgeChance(tpl({ stats: { str: 10, int: 10, wis: 10, dex: 10, con: 10 } })),
    );
  });

  it('block rises with heavier armor', () => {
    expect(blockChance(tpl({ armorType: 'Plate' }))).toBeGreaterThan(blockChance(tpl({ armorType: 'Cloth' })));
  });

  it('combined avoid rises with both dex and armor, and is capped', () => {
    const nimbleArmored = avoidChance(
      tpl({ armorType: 'Plate', stats: { str: 10, int: 10, wis: 10, dex: 30, con: 10 } }),
    );
    const clumsyCloth = avoidChance(tpl({ armorType: 'Cloth', stats: { str: 10, int: 10, wis: 10, dex: 4, con: 10 } }));
    expect(nimbleArmored).toBeGreaterThan(clumsyCloth);
    expect(nimbleArmored).toBeLessThanOrEqual(0.75);
  });
});

describe('rollAvoidance (seeded, deterministic)', () => {
  it('avoids when the roll falls under a defense chance', () => {
    // next()=0 → beats parry (0.05) even with 0 dodge/block.
    expect(rollAvoidance(tpl({ armorType: 'Cloth' }), nextRng(0))).toBe(true);
  });

  it('does not avoid when every roll is above all chances', () => {
    expect(rollAvoidance(tpl({ armorType: 'Plate' }), nextRng(0.99))).toBe(false);
  });

  it('a positive avoidMod (defensive stance) raises the dodge and can flip a miss into an avoid', () => {
    const t = tpl({ armorType: 'Cloth', stats: { str: 10, int: 10, wis: 10, dex: 10, con: 10 } });
    // dex-baseline dodge ≈ 0.05; a roll of 0.10 normally fails dodge and (0.10) fails parry/block.
    expect(rollAvoidance(t, nextRng(0.1))).toBe(false);
    // +0.10 stance lift pushes the dodge chance above 0.10, so the same roll now avoids.
    expect(rollAvoidance(t, nextRng(0.1), 0.1)).toBe(true);
  });

  it('a negative avoidMod (offensive/exposed) can drop dodge to zero', () => {
    const t = tpl({ armorType: 'Cloth', stats: { str: 10, int: 10, wis: 10, dex: 30, con: 10 } });
    // High dex → strong dodge; a roll of 0.2 would normally avoid…
    expect(rollAvoidance(t, nextRng(0.2))).toBe(true);
    // …but a big negative mod clamps dodge to 0 (and 0.2 > parry/block), so it lands.
    expect(rollAvoidance(t, nextRng(0.2), -1)).toBe(false);
  });
});
