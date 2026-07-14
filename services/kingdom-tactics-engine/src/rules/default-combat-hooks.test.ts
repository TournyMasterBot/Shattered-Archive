import { createGameDataProvider, STANCES, type StanceModifier } from '../data/index.js';
import type { Board, Coord, MatchState, Tile, Unit } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import type { CombatContext } from './combat-hooks.js';
import { defaultCombatHooks } from './default-combat-hooks.js';
import { templateForMember } from './squadron.js';

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

function unit(instanceId: string, templateId: string, pos: Coord, side: number, statuses: Unit['statuses'] = []): Unit {
  return { kind: 'unit', instanceId, templateId, side, pos, hp: 999, statuses, hasMoved: false, hasActed: false };
}

function state(tokens: Unit[]): MatchState {
  return {
    modeId: 'skirmish',
    board: board(10, 10),
    armies: [],
    tokens,
    turn: 1,
    activeSide: 0,
    moon: { gameHour: 0, sky: { Black: 'HalfMoon', Red: 'HalfMoon', White: 'HalfMoon' } },
    rngState: 1,
    status: 'in-progress',
  };
}

function nextRng(v: number): ISeededRng {
  return { next: () => v, int: () => 0, pick: <T>(a: readonly T[]): T => a[0], state: () => 0, clone(): ISeededRng { return this; } };
}

/** Build a CombatContext for a Warrior(attacker)→defender hit with a chosen defender template + statuses. */
function ctx(opts: {
  defenderTemplateId: string;
  damageType: string;
  defenderStatusKeys?: readonly string[];
  isSpell?: boolean;
  rng?: ISeededRng;
  attackerStance?: StanceModifier;
  defenderStance?: StanceModifier;
}): CombatContext {
  const keys = opts.defenderStatusKeys ?? [];
  const s = state([
    unit('a', 'Human:Warrior', { x: 5, y: 5 }, 0),
    unit('d', opts.defenderTemplateId, { x: 6, y: 5 }, 1, keys.map((k) => ({ key: k, remaining: -1 }))),
  ]);
  return {
    state: s,
    attacker: templateForMember('Human:Warrior', provider),
    defender: templateForMember(opts.defenderTemplateId, provider),
    attackerId: 'a',
    defenderId: 'd',
    damageType: opts.damageType,
    isSpell: opts.isSpell ?? false,
    defenderStatusKeys: keys,
    attackerStance: opts.attackerStance ?? STANCES.normal,
    defenderStance: opts.defenderStance ?? STANCES.normal,
    provider,
    rng: opts.rng ?? nextRng(0.99),
  };
}

describe('defaultCombatHooks.onDefend (typed shields)', () => {
  it('a magic shield negates a magic hit to 0', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Flame', defenderStatusKeys: ['shield-magic'] });
    expect(defaultCombatHooks.onDefend!(50, c)).toBe(0);
  });

  it('a magic shield does NOT affect a physical hit', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Slash', defenderStatusKeys: ['shield-magic'] });
    expect(defaultCombatHooks.onDefend!(50, c)).toBe(50);
  });

  it('an elemental ward reduces its matching element (fire → half)', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Flame', defenderStatusKeys: ['ward-fire'] });
    expect(defaultCombatHooks.onDefend!(50, c)).toBe(25);
  });

  it('no shields leaves the incoming amount unchanged', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Slash' });
    expect(defaultCombatHooks.onDefend!(50, c)).toBe(50);
  });
});

describe('defaultCombatHooks.onHit (thorns)', () => {
  it('a thorns defender damages the attacker, routed through resolveDamage', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Slash', defenderStatusKeys: ['thorns'] });
    const next = defaultCombatHooks.onHit!(30, c);
    const atk = next.tokens.find((t) => t.instanceId === 'a') as Unit;
    expect(atk.hp).toBeLessThan(999); // thorns reflected damage
  });

  it('no reactive aura leaves state unchanged (same ref)', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Slash' });
    expect(defaultCombatHooks.onHit!(30, c)).toBe(c.state);
  });
});

describe('defaultCombatHooks.onAvoid (spell gating)', () => {
  it('a spell without magic-evasion never avoids', () => {
    const c = ctx({ defenderTemplateId: 'Human:Warrior', damageType: 'Flame', isSpell: true, rng: nextRng(0) });
    expect(defaultCombatHooks.onAvoid!(c)).toBe(false);
  });

  it('a spell WITH magic-evasion can avoid on a low roll', () => {
    const c = ctx({
      defenderTemplateId: 'Human:Warrior',
      damageType: 'Flame',
      defenderStatusKeys: ['magic-evasion'],
      isSpell: true,
      rng: nextRng(0),
    });
    expect(defaultCombatHooks.onAvoid!(c)).toBe(true);
  });
});
