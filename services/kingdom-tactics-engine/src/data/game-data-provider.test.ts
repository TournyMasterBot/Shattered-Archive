import { createGameDataProvider, createGameModeProvider } from './index.js';
import { CLASS_KITS } from './balance/class-kits.js';
import { CLASS_ATTRIBUTES } from './dsl/class-attributes.js';
import { RACE_MODIFIERS } from './balance/race-modifiers.js';
import { classPointCost, BASE_CLASS_POINTS } from './balance/unit-costs.js';
import { RACE_ATTRIBUTES } from './dsl/race-attributes.js';
import { aggregateSquadron } from '../rules/squadron.js';
import type { GameModeId, SquadronMember, VictoryCondition } from '../model/index.js';

const provider = createGameDataProvider();

describe('GameDataProvider.unitTemplate — single source of truth', () => {
  const t = provider.unitTemplate('Human', 'Warrior');
  const kit = CLASS_KITS.Warrior;
  const mod = RACE_MODIFIERS.Human;

  it('composes resolved stats from class kit + race modifier (imported constants)', () => {
    expect(t.maxHp).toBe(kit.baseHp + mod.hpDelta);
    expect(t.attackPower).toBe(kit.attackPower + mod.attackDelta);
    expect(t.defense).toBe(kit.defense + mod.defenseDelta);
    expect(t.move.range).toBe(kit.move.range + mod.moveRangeDelta);
    expect(t.movementClass).toBe(kit.movementClass);
  });

  it('pulls canonical stats straight from the distilled DSL attributes', () => {
    const human = RACE_ATTRIBUTES.find((r) => r.key === 'Human');
    expect(t.stats).toEqual(human?.baseStats);
  });

  it('prices a base class at the flat base points; a reclass costs more (tier from CP)', () => {
    // Warrior is a base class → flat base points.
    expect(t.isReclass).toBe(false);
    expect(t.cost).toBe(BASE_CLASS_POINTS);
    // Samurai is a reclass (BaseCpModifier 3) → strictly more than a base class.
    const samurai = provider.unitTemplate('Human', 'Samurai');
    expect(samurai.isReclass).toBe(true);
    expect(samurai.cost).toBeGreaterThan(BASE_CLASS_POINTS);
    expect(samurai.cost).toBe(classPointCost({ isReclass: true, baseCpModifier: 3 }));
  });

  it('resolves an absolute caster level: cap×factor + elf bonus', () => {
    // Human Warrior casts BELOW level (DSL CastsAtLevel=false, 0.5): round(51×0.5)=26, no elf.
    expect(t.castingLevel).toBe(26);
    // Human Mage casts at level → 51.
    expect(provider.unitTemplate('Human', 'Mage').castingLevel).toBe(51);
    // Shalonesti Elf Warrior: 26 + elf blood (+1) → 27. (Damage boosts are NOT casting affinity.)
    expect(provider.unitTemplate('ShalonestiElf', 'Warrior').castingLevel).toBe(27);
  });

  it('folds a race×class damage boost/gimp into attackPower (BoostedClasses)', () => {
    // ShalonestiElf superboosts Warrior (+20 in BoostedClasses) → +20% damage.
    const elf = provider.unitTemplate('ShalonestiElf', 'Warrior');
    expect(elf.damageBoostPct).toBe(20);
    // Human has no Warrior boost → 0% (attackPower is the raw composed value).
    expect(t.damageBoostPct).toBe(0);
  });

  it('grants dwarven Toughness as a KT-scaled defense bonus (DSL -25 AC ⇒ +1 defense ≈ 2.5%)', () => {
    const dwarf = provider.unitTemplate('MountainDwarf', 'Warrior');
    expect(dwarf.traits).toContain('toughness');
    // -25 DSL AC × (AC_DIVISOR 40 / 1000) = +1 KT defense over the same class on a non-toughness race.
    expect(dwarf.defense).toBe(
      CLASS_KITS.Warrior.defense + RACE_MODIFIERS.MountainDwarf.defenseDelta + 1,
    );
  });

  it('follows a reclass to its base kit and applies overrides', () => {
    const ds = provider.unitTemplate('Human', 'Dragonslayer');
    // Dragonslayer builds on Warrior with +4 hp / +3 atk (reclass-kits.ts).
    expect(ds.maxHp).toBe(CLASS_KITS.Warrior.baseHp + 4 + RACE_MODIFIERS.Human.hpDelta);
    expect(ds.attackPower).toBe(CLASS_KITS.Warrior.attackPower + 3 + RACE_MODIFIERS.Human.attackDelta);
    expect(ds.traits).toContain('dragonslayer');
  });

  it('derives a default kit for a class without a hand-authored one (every class playable)', () => {
    // Bard has no CLASS_KITS entry — it must still resolve via defaultClassKit,
    // not throw. Derived kit reflects the class group/armor from class-attributes.
    const bard = provider.unitTemplate('Human', 'Bard');
    expect(bard.maxHp).toBeGreaterThan(0);
    expect(bard.attackPower).toBeGreaterThan(0);
    expect(bard.defense).toBeGreaterThanOrEqual(1);
    expect(bard.classKey).toBe('Bard');
  });

  it('resolves a template for every mortal class (none throws)', () => {
    for (const c of CLASS_ATTRIBUTES) {
      expect(() => provider.unitTemplate('Human', c.key)).not.toThrow();
    }
  });
});

describe('squadron aggregation derives from member unit templates', () => {
  it('pools hp and strength from the same unitTemplate() source', () => {
    const members: SquadronMember[] = [{ templateId: 'Human:Warrior', count: 3 }];
    const stats = aggregateSquadron(members, provider);
    const t = provider.unitTemplate('Human', 'Warrior');
    expect(stats.size).toBe(3);
    expect(stats.maxHpPool).toBe(t.maxHp * 3);
    expect(stats.strength).toBe(t.attackPower * 3);
  });

  it('mixes multiple unit types', () => {
    const members: SquadronMember[] = [
      { templateId: 'Human:Warrior', count: 2 },
      { templateId: 'Human:Mage', count: 1 },
    ];
    const w = provider.unitTemplate('Human', 'Warrior');
    const m = provider.unitTemplate('Human', 'Mage');
    const stats = aggregateSquadron(members, provider);
    expect(stats.size).toBe(3);
    expect(stats.strength).toBe(w.attackPower * 2 + m.attackPower * 1);
  });
});

describe('GameModeProvider — mode config integrity', () => {
  const modeProvider = createGameModeProvider();
  const expectedIds: GameModeId[] = [
    'duel', 'duo', 'skirmish', 'squadron', 'battle', 'siege', 'ffa', 'objective', 'horde',
  ];
  const victories: VictoryCondition[] = ['rout', 'control-point', 'survive-waves', 'destroy-objective'];

  it('exposes all nine modes', () => {
    const ids = modeProvider.modes().map((m) => m.id).sort();
    expect(ids).toEqual([...expectedIds].sort());
  });

  it('every mode is internally valid', () => {
    for (const mode of modeProvider.modes()) {
      expect(mode.sides).toBeGreaterThanOrEqual(2);
      expect(mode.budget).toBeGreaterThan(0);
      expect(victories).toContain(mode.victory);
      expect(mode.board.width).toBeGreaterThan(0);
      expect(mode.board.height).toBeGreaterThan(0);
      expect(mode.terrainProfile.length).toBeGreaterThan(0);
      expect(modeProvider.mode(mode.id)).toBe(mode);
    }
  });

  it('Battle uses squadron tokens; Duel/Skirmish do not', () => {
    expect(modeProvider.mode('battle').usesSquadrons).toBe(true);
    expect(modeProvider.mode('duel').usesSquadrons).toBe(false);
    expect(modeProvider.mode('skirmish').usesSquadrons).toBe(false);
  });
});
