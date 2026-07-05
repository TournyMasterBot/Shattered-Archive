import type { GameModeConfig, GameModeId, StatBlock, UnitTemplate } from '../model/index.js';

import { MORTAL_RACES, REMORT_RACES, type DslMortalRace, type DslRemortRace } from './dsl/races.js';
import { CLASSES, type DslClassId } from './dsl/classes.js';
import { MOON_TYPES, MOON_PHASES, type DslNamed } from './dsl/moons.js';
import { GODS, type DslGod } from './dsl/gods.js';
import { AFFILIATIONS, type DslAffiliation } from './dsl/affiliations.js';
import { TERRAINS, type DslTerrain } from './dsl/terrain.js';
import { RACE_ATTRIBUTES } from './dsl/race-attributes.js';
import { CLASS_ATTRIBUTES } from './dsl/class-attributes.js';

import { CLASS_KITS, type ClassKit } from './balance/class-kits.js';
import { RACE_MODIFIERS, DEFAULT_RACE_MODIFIER } from './balance/race-modifiers.js';
import { RECLASS_KITS } from './balance/reclass-kits.js';
import { MOON_EFFECTS, DEFAULT_MOON_EFFECT, type MoonModifier } from './balance/moon-effects.js';
import { TERRAIN_EFFECTS, DEFAULT_TERRAIN_EFFECT, type TerrainEffect } from './balance/terrain.js';
import { computeUnitCost } from './balance/unit-costs.js';
import { GAME_MODES, GAME_MODE_LIST } from './balance/modes.js';

const DEFAULT_STATS: StatBlock = { str: 10, int: 10, wis: 10, dex: 10, con: 10 };

/** Read access to all centralized game data. unitTemplate() is the single choke
 * point where distilled DSL data + authored balance compose into resolved units. */
export interface IGameDataProvider {
  races(): readonly DslMortalRace[];
  remortRaces(): readonly DslRemortRace[];
  classes(): readonly DslClassId[];
  moonTypes(): readonly DslNamed[];
  moonPhases(): readonly DslNamed[];
  gods(): readonly DslGod[];
  affiliations(): readonly DslAffiliation[];
  terrains(): readonly DslTerrain[];
  /** Fully resolve a (race × class) into a UnitTemplate. Throws if no class kit. */
  unitTemplate(raceKey: string, classKey: string): UnitTemplate;
  moonEffect(phaseKey: string): MoonModifier;
  terrainEffect(terrainKey: string): TerrainEffect;
}

export interface IGameModeProvider {
  modes(): readonly GameModeConfig[];
  mode(id: GameModeId): GameModeConfig;
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];

export class GameDataProvider implements IGameDataProvider {
  private readonly raceName = new Map<string, string>(MORTAL_RACES.map((r) => [r.key, r.name]));
  private readonly raceAttr = new Map<string, (typeof RACE_ATTRIBUTES)[number]>(
    RACE_ATTRIBUTES.map((r) => [r.key, r]),
  );
  private readonly classAttr = new Map<string, (typeof CLASS_ATTRIBUTES)[number]>(
    CLASS_ATTRIBUTES.map((c) => [c.key, c]),
  );
  private readonly className = new Map<string, string>(CLASSES.map((c) => [c.key, c.name]));

  races(): readonly DslMortalRace[] {
    return MORTAL_RACES;
  }
  remortRaces(): readonly DslRemortRace[] {
    return REMORT_RACES;
  }
  classes(): readonly DslClassId[] {
    return CLASSES;
  }
  moonTypes(): readonly DslNamed[] {
    return MOON_TYPES;
  }
  moonPhases(): readonly DslNamed[] {
    return MOON_PHASES;
  }
  gods(): readonly DslGod[] {
    return GODS;
  }
  affiliations(): readonly DslAffiliation[] {
    return AFFILIATIONS;
  }
  terrains(): readonly DslTerrain[] {
    return TERRAINS;
  }

  moonEffect(phaseKey: string): MoonModifier {
    return MOON_EFFECTS[phaseKey] ?? DEFAULT_MOON_EFFECT;
  }
  terrainEffect(terrainKey: string): TerrainEffect {
    return TERRAIN_EFFECTS[terrainKey] ?? DEFAULT_TERRAIN_EFFECT;
  }

  unitTemplate(raceKey: string, classKey: string): UnitTemplate {
    // Resolve the class kit (following a reclass to its base, then applying deltas).
    const reclass = RECLASS_KITS[classKey];
    const kitKey = reclass ? reclass.baseClassKey : classKey;
    const kit: ClassKit | undefined = CLASS_KITS[kitKey];
    if (!kit) {
      throw new Error(
        `unitTemplate: no class kit authored for "${classKey}"` +
          (reclass ? ` (base "${kitKey}")` : '') +
          '. Add it to data/balance/class-kits.ts.',
      );
    }

    const raceMod = RACE_MODIFIERS[raceKey] ?? DEFAULT_RACE_MODIFIER;
    const rAttr = this.raceAttr.get(raceKey);
    const cAttr = this.classAttr.get(classKey);

    const reHp = reclass?.hpDelta ?? 0;
    const reAtk = reclass?.attackDelta ?? 0;
    const reDef = reclass?.defenseDelta ?? 0;

    const maxHp = kit.baseHp + reHp + raceMod.hpDelta;
    const attackPower = kit.attackPower + reAtk + raceMod.attackDelta;
    const defense = kit.defense + reDef + raceMod.defenseDelta;
    const moveRange = kit.move.range + raceMod.moveRangeDelta;

    const traits = uniq([
      ...kit.traits,
      ...raceMod.traits,
      ...(reclass?.addTraits ?? []),
      ...(rAttr?.isLargeRace ? ['large'] : []),
    ]);

    return {
      id: `${raceKey}:${classKey}`,
      raceKey,
      classKey,
      name: `${this.raceName.get(raceKey) ?? raceKey} ${this.className.get(classKey) ?? classKey}`,
      maxHp,
      stats: rAttr?.baseStats ?? DEFAULT_STATS,
      move: { ...kit.move, range: moveRange },
      attack: kit.attack,
      attackPower,
      defense,
      movementClass: raceMod.movementClassOverride ?? kit.movementClass,
      damageType: kit.damageType,
      // Armor type is the distilled DSL class armor (sole armor-based defensive factor);
      // Cloth (0 mitigation) when a class declares none.
      armorType: cAttr?.armorType ?? 'Cloth',
      abilities: uniq((cAttr?.abilities ?? []).map((a) => a.key)),
      resistances: rAttr?.resistances ?? [],
      vulnerabilities: rAttr?.vulnerabilities ?? [],
      traits,
      cost: computeUnitCost({ maxHp, attackPower, defense, moveRange }),
    };
  }
}

export class GameModeProvider implements IGameModeProvider {
  modes(): readonly GameModeConfig[] {
    return GAME_MODE_LIST;
  }
  mode(id: GameModeId): GameModeConfig {
    return GAME_MODES[id];
  }
}

export const createGameDataProvider = (): IGameDataProvider => new GameDataProvider();
export const createGameModeProvider = (): IGameModeProvider => new GameModeProvider();

export type { MoonModifier } from './balance/moon-effects.js';
export type { TerrainEffect } from './balance/terrain.js';
