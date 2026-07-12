import { createGameDataProvider, type StanceKey } from '../data/index.js';
import type { Board, Coord, MatchState, Tile, Unit } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import { applyAttack } from './attack.js';
import { defaultCombatHooks } from './default-combat-hooks.js';
import { dodgeChance } from '../data/balance/defenses.js';

const provider = createGameDataProvider();

function board(w: number, h: number): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(
  instanceId: string,
  side: number,
  pos: Coord,
  templateId: string,
  stance?: StanceKey,
): Unit {
  return {
    kind: 'unit',
    instanceId,
    templateId,
    side,
    pos,
    hp: 999,
    statuses: [],
    hasMoved: false,
    hasActed: false,
    ...(stance ? { stance } : {}),
  };
}

function duel(
  attackerStance?: StanceKey,
  defenderStance?: StanceKey,
  defenderTemplateId = 'Human:Warrior',
): MatchState {
  return {
    modeId: 'skirmish',
    board: board(10, 10),
    armies: [],
    tokens: [
      unit('a', 0, { x: 5, y: 5 }, 'Human:Warrior', attackerStance),
      unit('d', 1, { x: 6, y: 5 }, defenderTemplateId, defenderStance),
    ],
    turn: 1,
    activeSide: 0,
    moon: { gameHour: 0, sky: { Black: 'HalfMoon', Red: 'HalfMoon', White: 'HalfMoon' } },
    rngState: 1,
    status: 'in-progress',
  };
}

const hpOfD = (s: MatchState): number => {
  const d = s.tokens.find((t) => t.instanceId === 'd') as Unit;
  return d.hp;
};

/** Deterministic (no-hooks) damage dealt to the defender for the given stances. A Cloth-armored
 *  Mage defender keeps mitigation low so a ±10% stance shift moves the rounded integer. */
function damageDealt(attackerStance?: StanceKey, defenderStance?: StanceKey): number {
  const s0 = duel(attackerStance, defenderStance, 'Human:Mage');
  const s1 = applyAttack(s0, 'a', 'd', provider);
  return hpOfD(s0) - hpOfD(s1);
}

describe('stance damage (deterministic no-hooks path — works in local play)', () => {
  const baseline = damageDealt();

  it('normal vs normal is unchanged from the stanceless baseline', () => {
    // A plain no-stance duel equals a normal/normal one (normal is a true no-op).
    expect(baseline).toBeGreaterThan(0);
    expect(damageDealt('normal', 'normal')).toBe(baseline);
  });

  it('an offensive attacker deals more; a defensive attacker deals less', () => {
    expect(damageDealt('offensive', 'normal')).toBeGreaterThan(baseline);
    expect(damageDealt('defensive', 'normal')).toBeLessThan(baseline);
  });

  it('a defensive defender takes less; an offensive defender takes more', () => {
    expect(damageDealt('normal', 'defensive')).toBeLessThan(baseline);
    expect(damageDealt('normal', 'offensive')).toBeGreaterThan(baseline);
  });

  it('Brewmaster Drunken Monkey deals much less damage', () => {
    expect(damageDealt('drunken-monkey', 'normal')).toBeLessThan(baseline);
  });
});

/** RNG stub returning a fixed value, to control the avoidance roll. */
function nextRng(v: number): ISeededRng {
  return { next: () => v, int: () => 0, pick: <T>(a: readonly T[]): T => a[0], state: () => 0, clone(): ISeededRng { return this; } };
}

describe('stance avoidance (hooked path — online play)', () => {
  it('a defensive defender avoids a hit that a normal defender would take', () => {
    // Use a Cloth-armored Mage defender (block 0, parry 0.05) so the dodge roll is decisive, and
    // pick a roll just above its dodge chance: a normal defender is hit, defensive (+0.10) avoids.
    const mage = provider.unitTemplate('Human', 'Mage');
    const roll = dodgeChance(mage) + 0.05; // in (dodge, dodge+0.10]; above parry too
    const normalHit = applyAttack(duel('normal', 'normal', 'Human:Mage'), 'a', 'd', provider, nextRng(roll), defaultCombatHooks);
    expect(hpOfD(normalHit)).toBeLessThan(999);
    const defended = applyAttack(duel('normal', 'defensive', 'Human:Mage'), 'a', 'd', provider, nextRng(roll), defaultCombatHooks);
    expect(hpOfD(defended)).toBe(999);
  });
});
