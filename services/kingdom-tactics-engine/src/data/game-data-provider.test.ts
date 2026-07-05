import { createGameDataProvider, createGameModeProvider } from './index.js';
import { CLASS_KITS } from './balance/class-kits.js';
import { RACE_MODIFIERS } from './balance/race-modifiers.js';
import { computeUnitCost } from './balance/unit-costs.js';
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

  it('derives cost from resolved power (so rebalancing stats re-prices the unit)', () => {
    expect(t.cost).toBe(
      computeUnitCost({
        maxHp: t.maxHp,
        attackPower: t.attackPower,
        defense: t.defense,
        moveRange: t.move.range,
      }),
    );
  });

  it('follows a reclass to its base kit and applies overrides', () => {
    const ds = provider.unitTemplate('Human', 'Dragonslayer');
    // Dragonslayer builds on Warrior with +4 hp / +3 atk (reclass-kits.ts).
    expect(ds.maxHp).toBe(CLASS_KITS.Warrior.baseHp + 4 + RACE_MODIFIERS.Human.hpDelta);
    expect(ds.attackPower).toBe(CLASS_KITS.Warrior.attackPower + 3 + RACE_MODIFIERS.Human.attackDelta);
    expect(ds.traits).toContain('dragonslayer');
  });

  it('throws clearly when no class kit is authored', () => {
    expect(() => provider.unitTemplate('Human', 'Bard')).toThrow(/no class kit/i);
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
