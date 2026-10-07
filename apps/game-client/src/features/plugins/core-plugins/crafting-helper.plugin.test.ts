import type { HudWidgetContent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { getOrderQueue, removeOrder, getCompletedOrders } from './crafting-helper-storage';
import {
  createCraftingHelperPlugin,
  tierForSkill,
  parseTierTableConfig,
  parseCraftTypesConfig,
  findCraftSkillLevel,
  matchCraftOutcome,
  matchSkillImproved,
  matchVaultFailure,
  matchCraftInterrupted,
  matchCopyoverRecovery,
  buildHudContent,
  DEFAULT_CRAFT_TYPES_CONFIG,
  DEFAULT_TIER_TABLE_CONFIG,
  parseQualitySpec,
  qualityMatchesSpec,
  matchItemCondition,
  parseQualityContainerMap,
  matchQualityContainer,
  formatQualitySpec,
  formatMaterialsUsed,
  slugifyItemName,
  qualitySpecToken,
  makeOrderId,
  ORDER_ITEM_RECIPES,
  ORDER_SET_RECIPES,
  getOrderItemRecipe,
  getOrderSetRecipe,
  sanitizeItemName,
} from './crafting-helper.plugin';

const SCORE_BLOCK = [
  'Speaking: Common      Login Pkill Delay: 0   Login Keep Delay: 0',
  'Religion: Kantilles -=- the God of Good Magicks -=-',
  'Craftskill: 1001    Craft Rank: Legendary Grand Master Tailor',
  'Craftskill: 948     Craft Rank: Grand Master Spellcrafter',
  'PKill: [ Win: 694         Giants: 0          BB Wins: 348                  ]',
].join('\n');

// ── Pure function tests ─────────────────────────────────────────────────

describe('tierForSkill', () => {
  const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG);

  it('picks the highest tier at or below a skill level', () => {
    expect(tierForSkill('spellcrafting', 1, rows)?.trinket).toBe('obsidian gemstone');
    expect(tierForSkill('spellcrafting', 120, rows)?.trinket).toBe('obsidian gemstone');
    expect(tierForSkill('spellcrafting', 121, rows)?.trinket).toBe('moonstone');
    expect(tierForSkill('spellcrafting', 1001, rows)?.trinket).toBe('diamond gemstone');
  });

  it('returns null below the lowest threshold', () => {
    expect(tierForSkill('spellcrafting', 0, rows)).toBeNull();
  });

  it('returns null for an unknown craft type', () => {
    expect(tierForSkill('jewelcrafting', 500, rows)).toBeNull();
  });

  it('regression: resolves a tier from a pre-multi-component saved config (bare material names, no ":qty")', () => {
    // Reproduces a live bug: a saved config from before the multi-component
    // tier-table format existed still has rows shaped like the old
    // single-material format. Every row used to be silently dropped
    // (component list came back empty), so no skill level matched any
    // tier — "Skill level 948 has no matching tier" at any level.
    const legacyRows = parseTierTableConfig(
      [
        'spellcrafting | 1   | obsidian gemstone | uncut obsidian stone',
        'spellcrafting | 841 | diamond gemstone  | uncut diamond stone',
      ].join('\n'),
    );
    expect(tierForSkill('spellcrafting', 948, legacyRows)).toEqual({
      craftTypeId: 'spellcrafting',
      skillThreshold: 841,
      trinket: 'diamond gemstone',
      components: [{ material: 'uncut diamond stone', qty: 1 }],
    });
  });
});

describe('parseTierTableConfig', () => {
  it('parses the default table into 8 spellcrafting rows, each single-component at qty 1', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG).filter((r) => r.craftTypeId === 'spellcrafting');
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.components.length === 1 && r.components[0].qty === 1)).toBe(true);
  });

  it('parses the default table into 27 rows each for sharp-weapons, blunt-weapons, and armor-crafting', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG);
    const sharp = rows.filter((r) => r.craftTypeId === 'sharp-weapons');
    const blunt = rows.filter((r) => r.craftTypeId === 'blunt-weapons');
    const armor = rows.filter((r) => r.craftTypeId === 'armor-crafting');
    expect(sharp).toHaveLength(27);
    expect(blunt).toHaveLength(27);
    expect(armor).toHaveLength(27);
    for (const group of [sharp, blunt, armor]) {
      expect(group.every((r) => r.components.length === 3 && r.components.every((c) => c.qty === 2))).toBe(true);
    }
  });

  it('parses the default table into 18 tailoring rows: 9 doll trinkets + 9 leather saddle trinkets', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG).filter((r) => r.craftTypeId === 'tailoring');
    expect(rows).toHaveLength(18);

    const doll = rows.filter((r) => r.trinket.endsWith('doll trinket'));
    const saddle = rows.filter((r) => r.trinket.endsWith('leather saddle trinket'));
    expect(doll).toHaveLength(9);
    expect(saddle).toHaveLength(9);
    expect(doll.every((r) => r.components.length === 2 && r.components.every((c) => c.qty === 3))).toBe(true);
    expect(saddle.every((r) => r.components.length === 3 && r.components.every((c) => c.qty === 2))).toBe(true);

    expect(tierForSkill('tailoring', 1, rows)?.trinket).toBe('woolen doll trinket');
    expect(tierForSkill('tailoring', 56, rows)?.trinket).toBe('deer leather saddle trinket');
    expect(tierForSkill('tailoring', 943, rows)).toEqual({
      craftTypeId: 'tailoring',
      skillThreshold: 943,
      trinket: 'elephant leather saddle trinket',
      components: [
        { material: 'wyvernskin cloth square', qty: 2 },
        { material: 'wyvernskin thread', qty: 2 },
        { material: 'elephant leather square', qty: 2 },
      ],
    });
    // The elephant leather saddle trinket is the last training trinket, all the way to the 1001 cap.
    expect(tierForSkill('tailoring', 1001, rows)?.trinket).toBe('elephant leather saddle trinket');
  });

  it('ignores blank lines and comments', () => {
    const rows = parseTierTableConfig('# comment\n\nspellcrafting | 1 | obsidian gemstone | uncut obsidian stone:1\n');
    expect(rows).toHaveLength(1);
  });

  it('parses a single-component row with an explicit qty', () => {
    const rows = parseTierTableConfig('armor | 1 | iron shield | iron ingot:3');
    expect(rows[0].components).toEqual([{ material: 'iron ingot', qty: 3 }]);
  });

  it('parses a multi-component row', () => {
    const rows = parseTierTableConfig('blunt-weapons | 1 | round bronze trinket | bronze bar:2, cedar board:2, deer leather square:2');
    expect(rows[0].components).toEqual([
      { material: 'bronze bar', qty: 2 },
      { material: 'cedar board', qty: 2 },
      { material: 'deer leather square', qty: 2 },
    ]);
  });

  it('accepts a legacy bare-material component (no ":qty") as qty 1 — backward compat with pre-multi-component saved configs', () => {
    const rows = parseTierTableConfig('armor | 1 | iron shield | iron ingot');
    expect(rows[0].components).toEqual([{ material: 'iron ingot', qty: 1 }]);
  });

  it('skips a row whose component field is blank', () => {
    expect(parseTierTableConfig('armor | 1 | iron shield |   ')).toEqual([]);
  });

  it('returns [] for non-string input', () => {
    expect(parseTierTableConfig(undefined)).toEqual([]);
    expect(parseTierTableConfig(42)).toEqual([]);
  });
});

describe('parseCraftTypesConfig', () => {
  it('parses the default craft-types rows', () => {
    const rows = parseCraftTypesConfig(DEFAULT_CRAFT_TYPES_CONFIG);
    expect(rows).toEqual([
      { id: 'spellcrafting', label: 'Spellcrafting', verb: 'spellcraft', keyword: 'Spellcrafter' },
      { id: 'sharp-weapons', label: 'Sharp Weapons', verb: 'sharpweapon', keyword: 'Weaponsmith (Sharp)' },
      { id: 'blunt-weapons', label: 'Blunt Weapons', verb: 'bluntweapon', keyword: 'Weaponsmith (Blunt)' },
      { id: 'armor-crafting', label: 'Armor Crafting', verb: 'armorcraft', keyword: 'Armorcrafter' },
      { id: 'tailoring', label: 'Tailoring', verb: 'tailor', keyword: 'Tailor' },
    ]);
  });

  it('ignores malformed rows with too few fields', () => {
    expect(parseCraftTypesConfig('spellcrafting | Spellcrafting')).toEqual([]);
  });
});

describe('sanitizeItemName', () => {
  it('strips single quotes so a config-sourced name cannot break the single-quoted command syntax', () => {
    expect(sanitizeItemName("ogre's tooth")).toBe('ogres tooth');
    expect(sanitizeItemName('plain name')).toBe('plain name');
  });
});

describe('parseComponentList / parseTierTableConfig sanitize names at parse time', () => {
  it('strips single quotes from a component material name', () => {
    const rows = parseTierTableConfig("spellcrafting | 1 | obsidian gemstone | ogre's tooth stone:1");
    expect(rows[0].components[0].material).toBe('ogres tooth stone');
  });

  it('strips single quotes from a trinket name', () => {
    const rows = parseTierTableConfig("spellcrafting | 1 | ogre's tooth gem | uncut obsidian stone:1");
    expect(rows[0].trinket).toBe('ogres tooth gem');
  });
});

describe('parseCraftTypesConfig sanitizes the craft verb (Review Focus #3)', () => {
  it('strips single quotes from the verb so it cannot break an unquoted command token', () => {
    const rows = parseCraftTypesConfig("spellcrafting | Spellcrafting | spell's craft | Spellcrafter");
    expect(rows[0].verb).toBe("spells craft");
  });
});

describe('findCraftSkillLevel', () => {
  it('finds the spellcrafting line by keyword', () => {
    expect(findCraftSkillLevel(SCORE_BLOCK, 'Spellcrafter')).toBe(948);
  });

  it('finds a different craft skill by a different keyword', () => {
    expect(findCraftSkillLevel(SCORE_BLOCK, 'Tailor')).toBe(1001);
  });

  it('is case-insensitive on the keyword', () => {
    expect(findCraftSkillLevel(SCORE_BLOCK, 'spellCRAFTER')).toBe(948);
  });

  it('returns null when no line matches', () => {
    expect(findCraftSkillLevel(SCORE_BLOCK, 'Armorsmith')).toBeNull();
  });
});

describe('matchCraftOutcome', () => {
  it('matches each exact outcome string', () => {
    expect(matchCraftOutcome('You were successful.')).toBe('success');
    expect(matchCraftOutcome('You failed and destroyed some materials in the process.')).toBe('failed_destroyed');
    expect(matchCraftOutcome('You failed but did not lose any materials.')).toBe('failed_no_loss');
  });

  it('returns null for unrelated text', () => {
    expect(matchCraftOutcome('The troll swings at you.')).toBeNull();
  });
});

describe('matchSkillImproved', () => {
  it('extracts the new level', () => {
    expect(matchSkillImproved('Your crafting skill has improved. (56)')).toBe(56);
  });

  it('returns null when absent', () => {
    expect(matchSkillImproved('You were successful.')).toBeNull();
  });
});

describe('matchCraftInterrupted', () => {
  it('matches the interrupt line', () => {
    expect(matchCraftInterrupted('You stop crafting.')).toBe(true);
    expect(matchCraftInterrupted('You were successful.')).toBe(false);
  });
});

describe('matchVaultFailure', () => {
  it('matches the exact vault-failure string', () => {
    expect(matchVaultFailure('I see nothing like that in the vault.')).toBe(true);
  });

  it('is false otherwise', () => {
    expect(matchVaultFailure('You get 1 uncut diamond stone.')).toBe(false);
  });
});

describe('matchCopyoverRecovery', () => {
  it('matches the copyover-recovery line', () => {
    expect(matchCopyoverRecovery('Copyover recovery complete.')).toBe(true);
    expect(matchCopyoverRecovery('You were successful.')).toBe(false);
  });
});

describe('buildHudContent', () => {
  const base = { trackedSkillLevel: 948, activeItemName: 'diamond gemstone', stopReason: null };

  it('returns null when never started', () => {
    expect(buildHudContent({ state: 'idle', everRun: false, ...base })).toBeNull();
  });

  it('returns a critical variant when stopped on error', () => {
    const content = buildHudContent({
      state: 'error_stopped',
      everRun: true,
      ...base,
      stopReason: 'Vault is out of "uncut diamond stone".',
    });
    expect(content?.variant).toBe('critical');
    expect(content?.value).toContain('Vault is out of');
  });

  it('returns "Stopped" after a clean stop', () => {
    expect(buildHudContent({ state: 'idle', everRun: true, ...base })?.value).toBe('Stopped');
  });

  it('shows level/trinket/phase while active', () => {
    const content = buildHudContent({ state: 'crafting', everRun: true, ...base });
    expect(content?.value).toBe('Lv 948 · diamond gemstone · crafting');
  });

  it('leads with the activity when given', () => {
    const content = buildHudContent({ state: 'crafting', everRun: true, ...base, activity: 'improving Spellcrafting' });
    expect(content?.value).toBe('improving Spellcrafting · Lv 948 · diamond gemstone · crafting');
  });

  it('omits the level when unknown', () => {
    const content = buildHudContent({
      state: 'crafting',
      everRun: true,
      ...base,
      trackedSkillLevel: null,
      activity: 'working on order order-abc',
    });
    expect(content?.value).toBe('working on order order-abc · diamond gemstone · crafting');
  });
});

describe('parseQualitySpec', () => {
  it('parses an "at least" spec', () => {
    expect(parseQualitySpec('97+')).toEqual({ kind: 'atLeast', min: 97 });
  });

  it('parses an exact spec', () => {
    expect(parseQualitySpec('99')).toEqual({ kind: 'exact', value: 99 });
  });

  it('parses a range spec', () => {
    expect(parseQualitySpec('95-98')).toEqual({ kind: 'range', min: 95, max: 98 });
  });

  it('rejects an inverted range', () => {
    expect(parseQualitySpec('98-95')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(parseQualitySpec('high quality')).toBeNull();
    expect(parseQualitySpec('')).toBeNull();
  });
});

describe('qualityMatchesSpec', () => {
  it('matches "at least" at and above the minimum', () => {
    const spec = { kind: 'atLeast' as const, min: 97 };
    expect(qualityMatchesSpec(97, spec)).toBe(true);
    expect(qualityMatchesSpec(100, spec)).toBe(true);
    expect(qualityMatchesSpec(96, spec)).toBe(false);
  });

  it('matches "exact" only at the value', () => {
    const spec = { kind: 'exact' as const, value: 99 };
    expect(qualityMatchesSpec(99, spec)).toBe(true);
    expect(qualityMatchesSpec(98, spec)).toBe(false);
    expect(qualityMatchesSpec(100, spec)).toBe(false);
  });

  it('matches "range" inclusive at both ends', () => {
    const spec = { kind: 'range' as const, min: 95, max: 98 };
    expect(qualityMatchesSpec(95, spec)).toBe(true);
    expect(qualityMatchesSpec(98, spec)).toBe(true);
    expect(qualityMatchesSpec(94, spec)).toBe(false);
    expect(qualityMatchesSpec(99, spec)).toBe(false);
  });
});

describe('formatQualitySpec', () => {
  it('formats each spec kind back to its typed syntax', () => {
    expect(formatQualitySpec({ kind: 'atLeast', min: 97 })).toBe('97+');
    expect(formatQualitySpec({ kind: 'exact', value: 99 })).toBe('99');
    expect(formatQualitySpec({ kind: 'range', min: 95, max: 98 })).toBe('95-98');
  });
});

describe('formatMaterialsUsed', () => {
  it('joins each material and its quantity', () => {
    expect(formatMaterialsUsed({ 'diamond gemstone': 2, 'essence of pain': 2 })).toBe(
      'diamond gemstone x2, essence of pain x2',
    );
  });

  it('reports "none recorded" for an empty tally', () => {
    expect(formatMaterialsUsed({})).toBe('none recorded');
  });
});

describe('slugifyItemName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyItemName('Diamond Gem Pain')).toBe('diamond-gem-pain');
  });

  it('strips characters that are not letters or digits', () => {
    expect(slugifyItemName("silksteel cloth helmet's edge")).toBe('silksteel-cloth-helmet-s-edge');
  });

  it('has no leading or trailing hyphens', () => {
    expect(slugifyItemName('  arcanium chainmail set  ')).toBe('arcanium-chainmail-set');
  });
});

describe('qualitySpecToken', () => {
  it('renders each spec kind as a word token, no symbols', () => {
    expect(qualitySpecToken({ kind: 'atLeast', min: 97 })).toBe('gte97');
    expect(qualitySpecToken({ kind: 'exact', value: 99 })).toBe('eq99');
    expect(qualitySpecToken({ kind: 'range', min: 95, max: 98 })).toBe('95to98');
  });
});

describe('makeOrderId', () => {
  it('builds a readable id from the item name and quality spec', () => {
    const id = makeOrderId('diamond gem pain', { kind: 'atLeast', min: 97 });
    expect(id).toMatch(/^diamond-gem-pain-gte97-[a-z0-9]{4}$/);
  });

  it('produces different ids for repeated calls (random suffix)', () => {
    const spec = { kind: 'exact' as const, value: 99 };
    const a = makeOrderId('diamond gem pain', spec);
    const b = makeOrderId('diamond gem pain', spec);
    expect(a).not.toBe(b);
  });
});

describe('matchItemCondition', () => {
  it('extracts the quality percentage', () => {
    expect(matchItemCondition('Condition: flawless (97%)')).toBe(97);
  });

  it('returns null for unrelated text', () => {
    expect(matchItemCondition('You were successful.')).toBeNull();
  });
});

describe('parseQualityContainerMap', () => {
  it('parses range rows and single-value rows', () => {
    const rows = parseQualityContainerMap('90-94 | common\n98 | rare');
    expect(rows).toEqual([
      { min: 90, max: 94, container: 'common' },
      { min: 98, max: 98, container: 'rare' },
    ]);
  });

  it('ignores blank lines and comments', () => {
    expect(parseQualityContainerMap('# comment\n\n90-94 | common')).toHaveLength(1);
  });

  it('returns [] for non-string input', () => {
    expect(parseQualityContainerMap(undefined)).toEqual([]);
  });

  it('drops a row where min > max instead of accepting a dead range (review 3.1)', () => {
    const rows = parseQualityContainerMap('98-95|rare-vault');
    expect(rows).toHaveLength(0);
  });
});

describe('matchQualityContainer', () => {
  it('returns the mapped container for a covered quality', () => {
    const rows = parseQualityContainerMap('98-100 | orb\n95-97 | vault');
    expect(matchQualityContainer(95, rows)).toBe('vault');
    expect(matchQualityContainer(100, rows)).toBe('orb');
  });

  it('returns null (not a default) for an unmapped quality', () => {
    const rows = parseQualityContainerMap('98-100 | orb');
    expect(matchQualityContainer(50, rows)).toBeNull();
  });
});

describe('ORDER_ITEM_RECIPES', () => {
  it('builds the diamond special gems, including the non-essence and multi-component ones', () => {
    expect(ORDER_ITEM_RECIPES['diamond gem pain']?.components).toEqual([
      { material: 'diamond gemstone', qty: 1 },
      { material: 'essence of pain', qty: 1 },
    ]);
    expect(ORDER_ITEM_RECIPES['diamond gem distortion']?.components).toEqual([
      { material: 'diamond gemstone', qty: 1 },
      { material: 'shard of distortion', qty: 1 },
    ]);
    expect(ORDER_ITEM_RECIPES['diamond gem leeching']?.components).toEqual([
      { material: 'diamond gemstone', qty: 1 },
      { material: 'essence of moons', qty: 1 },
      { material: 'ferrite crystal', qty: 1 },
    ]);
    expect(ORDER_ITEM_RECIPES['diamond gem the magi']?.components[1].material).toBe('essence of the magi');
    for (const s of ['confusion', 'venom', 'energy', 'execution', 'steel', 'blood', 'frost', 'flame', 'sight']) {
      expect(ORDER_ITEM_RECIPES[`diamond gem ${s}`]?.components[1].material).toBe(`essence of ${s}`);
    }
  });

  it('no longer has the old guessed "diamond of pain" recipe', () => {
    expect(ORDER_ITEM_RECIPES['diamond of pain']).toBeUndefined();
  });

  it('builds spellcrafting gems from a cut gemstone plus an essence', () => {
    expect(ORDER_ITEM_RECIPES['opal gem inertia']).toEqual({
      craftTypeId: 'spellcrafting',
      components: [
        { material: 'opal gemstone', qty: 1 },
        { material: 'essence of inertia', qty: 1 },
      ],
    });
    // "mind" is the item suffix, but the essence is "essence of the mind".
    expect(ORDER_ITEM_RECIPES['opal gem mind']?.components[1].material).toBe('essence of the mind');
    expect(ORDER_ITEM_RECIPES['diamond gem muscle']?.components[0].material).toBe('diamond gemstone');
  });

  it('builds moonstone gems from plain "moonstone" (no "gemstone" suffix)', () => {
    expect(ORDER_ITEM_RECIPES['moonstone gem growth']).toEqual({
      craftTypeId: 'spellcrafting',
      components: [
        { material: 'moonstone', qty: 1 },
        { material: 'essence of growth', qty: 1 },
      ],
    });
  });

  it('covers all 8 basic essences for all 8 gemstone tiers', () => {
    const tiers = ['obsidian', 'moonstone', 'opal', 'amethyst', 'emerald', 'sapphire', 'ruby', 'diamond'];
    const suffixes = ['inertia', 'life', 'moons', 'growth', 'age', 'mind', 'wind', 'muscle'];
    for (const tier of tiers) {
      for (const suffix of suffixes) {
        expect(ORDER_ITEM_RECIPES[`${tier} gem ${suffix}`]?.craftTypeId).toBe('spellcrafting');
      }
    }
  });

  it('builds a cloth tailoring item as "<material> cloth <slot>" using material thread + material cloth square', () => {
    expect(ORDER_ITEM_RECIPES['silk cloth helmet']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'silk thread', qty: 1 },
        { material: 'silk cloth square', qty: 1 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['silksteel cloth shirt']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'silksteel thread', qty: 4 },
        { material: 'silksteel cloth square', qty: 4 },
      ],
    });
  });

  it('builds a leather tailoring item as "<leather material> leather <slot>" using the same-tier cloth thread + leather material square', () => {
    expect(ORDER_ITEM_RECIPES['whale leather sleeves']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'seamist thread', qty: 2 },
        { material: 'whale leather square', qty: 2 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['bull moose leather leggings']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'gossamer thread', qty: 2 },
        { material: 'bull moose leather square', qty: 2 },
      ],
    });
  });

  it('covers all 10 tailoring tiers, both types, all 6 slots', () => {
    const clothMaterials = [
      'woolen', 'linen', 'brocade', 'silk', 'gossamer', 'sylvan', 'seamist', 'nightshade', 'wyvernskin', 'silksteel',
    ];
    const leatherMaterials = ['deer', 'cow', 'bull', 'moose', 'bull moose', 'bear', 'whale', 'shark', 'elephant', 'bull elephant'];
    const slots = ['helmet', 'gloves', 'boots', 'sleeves', 'leggings', 'shirt'];
    for (const material of clothMaterials) {
      for (const slot of slots) {
        expect(ORDER_ITEM_RECIPES[`${material} cloth ${slot}`]?.craftTypeId).toBe('tailoring');
      }
    }
    for (const material of leatherMaterials) {
      for (const slot of slots) {
        expect(ORDER_ITEM_RECIPES[`${material} leather ${slot}`]?.craftTypeId).toBe('tailoring');
      }
    }
  });

  it('includes all 3 arcanium armor sets, 6 slots each, at armor-crafting', () => {
    const sets = ['platemail', 'chainmail', 'studded leather'];
    const slots = ['helmet', 'boots', 'gloves', 'sleeves', 'tunic'];
    for (const set of sets) {
      for (const slot of slots) {
        expect(ORDER_ITEM_RECIPES[`arcanium ${set} ${slot}`]?.craftTypeId).toBe('armor-crafting');
      }
    }
    // Platemail/chainmail use "leggings" for the 2-leg-piece slot; studded leather uses "pants".
    expect(ORDER_ITEM_RECIPES['arcanium platemail leggings']).toBeDefined();
    expect(ORDER_ITEM_RECIPES['arcanium chainmail leggings']).toBeDefined();
    expect(ORDER_ITEM_RECIPES['arcanium studded leather pants']).toBeDefined();
  });

  it('scales arcanium armor components by slot quantity (1/2/4 bar+leather)', () => {
    expect(ORDER_ITEM_RECIPES['arcanium chainmail helmet']).toEqual({
      craftTypeId: 'armor-crafting',
      components: [
        { material: 'arcanium bar', qty: 1 },
        { material: 'bull elephant leather square', qty: 1 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['arcanium chainmail sleeves']).toEqual({
      craftTypeId: 'armor-crafting',
      components: [
        { material: 'arcanium bar', qty: 2 },
        { material: 'bull elephant leather square', qty: 2 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['arcanium studded leather tunic']).toEqual({
      craftTypeId: 'armor-crafting',
      components: [
        { material: 'arcanium bar', qty: 4 },
        { material: 'bull elephant leather square', qty: 4 },
      ],
    });
  });
});

// ── State-machine integration tests ──────────────────────────────────────

function createMockApi(config: Record<string, unknown>) {
  const sent: string[] = [];
  const terminalWrites: string[] = [];
  const hudWrites: Array<{ slotId: string; content: HudWidgetContent | null }> = [];
  let rawDataHandler: ((payload: unknown) => void) | null = null;

  const api: PluginRuntimeApi = {
    connectionId: 'test-conn',
    pluginId: 'crafting-helper',
    sendCommand: (cmd: string) => sent.push(cmd),
    log: () => {},
    error: () => {},
    onEvent: (eventName: string, handler: (payload: unknown) => void) => {
      if (eventName === 'shatteredarchive:raw-data') rawDataHandler = handler;
      return () => {
        if (eventName === 'shatteredarchive:raw-data') rawDataHandler = null;
      };
    },
    httpGetJson: async () => ({}),
    getConfig: () => config,
    setConfig: () => {},
    updateConfig: (patch: Record<string, unknown>) => Object.assign(config, patch),
    writeTerminal: (dslText: string) => terminalWrites.push(dslText),
    registerAction: () => {},
    registerOmitRules: () => {},
    setHudWidget: (slotId, content) => {
      hudWrites.push({ slotId, content });
    },
  };

  return {
    api,
    sent,
    terminalWrites,
    hudWrites,
    feedLine: (line: string) => rawDataHandler?.({ rawText: `${line}\r\n` }),
    feedRaw: (rawText: string) => rawDataHandler?.({ rawText }),
  };
}

function defaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    craftTypes: DEFAULT_CRAFT_TYPES_CONFIG,
    tierTable: DEFAULT_TIER_TABLE_CONFIG,
    commandPacingDelayMs: 100,
    pullConfirmTimeoutMs: 200,
    scoreResponseTimeoutMs: 200,
    debug: false,
    hudSlot: 'hud.bottomStrip',
    ...overrides,
  };
}

describe('getOrderItemRecipe / getOrderSetRecipe (prototype-pollution guard)', () => {
  it('returns undefined for every inherited Object.prototype property name, not just "constructor"', () => {
    for (const poison of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(getOrderItemRecipe(poison)).toBeUndefined();
      expect(getOrderSetRecipe(poison)).toBeUndefined();
    }
  });

  it('still returns real recipes for real names', () => {
    expect(getOrderItemRecipe('diamond gem pain')).toBeDefined();
    expect(getOrderSetRecipe('silksteel cloth set')).toBeDefined();
  });
});

describe('crafting-helper state machine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    (window as unknown as { __SA_IDENTITY__?: { characterName?: string } }).__SA_IDENTITY__ = {
      characterName: 'testchar',
    };
    // The order queue is a module-level singleton keyed by character (see
    // crafting-helper-storage.ts) — localStorage.clear() alone doesn't reset
    // its in-memory state between tests in this file (unlike
    // crafting-helper-storage.test.ts, this file uses a static top-level
    // import of the plugin factory, so it can't use jest.resetModules() per
    // test without also losing that binding). Drain leftovers explicitly so
    // each order-mode test starts from an empty queue for 'testchar'.
    for (const o of getOrderQueue('testchar')) removeOrder('testchar', o.id);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the manifest description terse and points to `crafthelper help` for the rest', () => {
    const { manifest } = createCraftingHelperPlugin();
    const description = manifest.description ?? '';
    expect(description.length).toBeLessThan(400); // terse, not a duplicate of the help text
    expect(description).toContain('crafthelper help');
    expect(description).not.toContain('crafthelper order add'); // no command syntax duplicated here
  });

  it('prints help text for the bare "crafthelper" command and for "crafthelper help"', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    expect(plugin.onAlias!(mock.api, 'crafthelper')).toBe(true);
    expect(plugin.onAlias!(mock.api, 'crafthelper help')).toBe(true);
    expect(mock.terminalWrites).toHaveLength(2);

    const help = mock.terminalWrites[0];
    expect(help).toContain('Crafting Helper');
    expect(help).toContain(plugin.manifest.version); // help header shows the current plugin version
    expect(help).toContain('crafthelper improve spellcraft start');
    expect(help).toContain('crafthelper improve stop');
    expect(help).toContain('crafthelper improve status');
    expect(help).toContain('crafthelper order add');
    expect(help).toContain('crafthelper order list');
    expect(help).toContain('crafthelper order remove');
    expect(help).toContain('crafthelper order start');
    expect(help).toContain('crafthelper order stop');
    expect(help).toContain('crafthelper order status');
    expect(mock.terminalWrites[1]).toBe(help); // "crafthelper help" and bare "crafthelper" match
  });

  it('"crh" works as a shorthand for "crafthelper" on every command', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    expect(plugin.onAlias!(mock.api, 'crh')).toBe(true);
    expect(plugin.onAlias!(mock.api, 'crafthelper')).toBe(true);
    expect(mock.terminalWrites[0]).toBe(mock.terminalWrites[1]); // identical help output either way

    expect(plugin.onAlias!(mock.api, "crh order add 1 'diamond gem pain' 97+")).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(1);

    // A bare "crh" mid-word must not be mistaken for the prefix.
    expect(plugin.onAlias!(mock.api, 'crhblah')).toBeUndefined();
  });

  it('rejects "order add 1 \'constructor\' 99+" as an unknown item instead of crashing on recipe.components', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    expect(plugin.onAlias!(mock.api, "crafthelper order add 1 'constructor' 99+")).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('Unknown order item');
  });

  it('every order-add example in the help text names a real recipe or set', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper');

    const itemNames = [...mock.terminalWrites[0].matchAll(/order add \d+ '([^']+)'/g)].map((m) => m[1]);
    expect(itemNames.length).toBeGreaterThan(0);
    for (const name of itemNames) {
      const lower = name.toLowerCase();
      expect(ORDER_ITEM_RECIPES[lower] ?? ORDER_SET_RECIPES[lower]).toBeDefined();
    }
  });

  it('runs the score → pull → craft happy path for a fresh character', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    expect(mock.sent).toEqual(['score']);

    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    // Skill 948 -> diamond gemstone tier.
    expect(mock.sent).toEqual(['score', "get 1 'uncut diamond stone' vault"]);

    jest.advanceTimersByTime(200); // pullConfirmTimeoutMs, no vault failure seen
    expect(mock.sent).toEqual(['score', "get 1 'uncut diamond stone' vault", "craft spellcraft 'diamond gemstone'"]);
  });

  it('full happy-path cycle: success -> put -> next pull', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("put 1 'diamond gemstone' vault");

    jest.advanceTimersByTime(100); // commandPacingDelayMs
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'uncut diamond stone' vault");
  });

  it('"no loss" re-crafts the same trinket without touching the vault', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed but did not lose any materials.');
    jest.advanceTimersByTime(100);

    const newCommands = mock.sent.slice(sentSoFar);
    expect(newCommands).toEqual(["craft spellcraft 'diamond gemstone'"]);
  });

  it('"destroyed" puts back the material before re-pulling, since the message is not reliable', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // commandPacingDelayMs — put-back
    expect(mock.sent.slice(sentSoFar)).toEqual(["put 1 'uncut diamond stone' vault"]);

    jest.advanceTimersByTime(100); // commandPacingDelayMs — then a fresh pull
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'uncut diamond stone' vault",
      "get 1 'uncut diamond stone' vault",
    ]);
  });

  it('"destroyed" on a multi-component order item puts back every component before re-pulling all of them', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull silksteel thread
    jest.advanceTimersByTime(200); // pull silksteel cloth square
    // now crafting
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // put back thread
    jest.advanceTimersByTime(100); // put back square
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'silksteel thread' vault",
      "put 1 'silksteel cloth square' vault",
    ]);

    jest.advanceTimersByTime(100); // then re-pull both, fresh
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'silksteel thread' vault",
      "put 1 'silksteel cloth square' vault",
      "get 1 'silksteel thread' vault",
    ]);
  });

  it('tallies materials used against the order on a successful craft', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200); // pull diamond gemstone
    jest.advanceTimersByTime(200); // pull essence of pain
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)'); // in spec, order not yet complete (1/2)

    expect(getOrderQueue('testchar')[0].materialsUsed).toEqual({
      'diamond gemstone': 1,
      'essence of pain': 1,
    });
  });

  it('assumes a full material loss on a "destroyed" outcome, independent of the put-back-and-repull it triggers', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    jest.advanceTimersByTime(200); // pull silksteel thread
    jest.advanceTimersByTime(200); // pull silksteel cloth square

    mock.feedLine('You failed and destroyed some materials in the process.');
    expect(getOrderQueue('testchar')[0].materialsUsed).toEqual({
      'silksteel thread': 1,
      'silksteel cloth square': 1,
    });
  });

  it('does not tally anything on a "no loss" outcome', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);

    mock.feedLine('You failed but did not lose any materials.');
    expect(getOrderQueue('testchar')[0].materialsUsed).toEqual({});
  });

  it('summarizes materials used and stores a lookup-able history record when an order completes', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    const orderId = getOrderQueue('testchar')[0].id;
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You failed and destroyed some materials in the process.'); // 1 lost attempt, tallied
    jest.advanceTimersByTime(100); // put back gemstone
    jest.advanceTimersByTime(100); // put back essence
    jest.advanceTimersByTime(100); // trigger re-pull cycle: "get" gemstone sent
    jest.advanceTimersByTime(200); // gemstone pull confirmed: "get" essence sent
    jest.advanceTimersByTime(200); // essence pull confirmed: craft sent
    mock.feedLine('You were successful.'); // then the successful attempt
    mock.feedLine('Condition: flawless (99%)'); // completes the order

    expect(
      mock.terminalWrites.some(
        (w) =>
          w.includes(`Order ${orderId} materials used:`) &&
          w.includes('diamond gemstone x2') &&
          w.includes('essence of pain x2'),
      ),
    ).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(0);

    // getCompletedOrders is a module-level singleton shared across every test
    // in this file (like the order queue above) — look up this test's record
    // by id rather than asserting on the whole list's length. Storage-level
    // isolation (including the empty-history case) is covered with a truly
    // fresh module instance in crafting-helper-storage.test.ts.
    const record = getCompletedOrders('testchar').find((r) => r.id === orderId);
    expect(record).toMatchObject({
      id: orderId,
      itemName: 'diamond gem pain',
      quantityTotal: 1,
      materialsUsed: { 'diamond gemstone': 2, 'essence of pain': 2 },
    });
  });

  it('"order history" lists completed orders, and "order history <id>" shows one in full', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    const orderId = getOrderQueue('testchar')[0].id;
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (99%)');

    plugin.onAlias!(mock.api, 'crafthelper order history');
    expect(
      mock.terminalWrites.some(
        (w) => w.includes(orderId) && w.includes('diamond gem pain') && w.includes('diamond gemstone x1'),
      ),
    ).toBe(true);

    plugin.onAlias!(mock.api, `crafthelper order history ${orderId}`);
    expect(mock.terminalWrites.some((w) => w.includes('Materials used:') && w.includes('essence of pain x1'))).toBe(
      true,
    );

    plugin.onAlias!(mock.api, 'crafthelper order history not-a-real-id');
    expect(mock.terminalWrites.some((w) => w.includes('No completed order with id "not-a-real-id"'))).toBe(true);
  });

  it('a vault failure partway through a multi-component order pull leaves the order queued untouched', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const orderId = getOrderQueue('testchar')[0].id;
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull silksteel thread succeeds

    mock.feedLine('I see nothing like that in the vault.'); // fails on the SECOND component
    const sentSoFar = [...mock.sent];
    jest.advanceTimersByTime(5000);
    // Only the already-pulled first component goes back; nothing further is pulled or crafted.
    expect(mock.sent).toEqual([...sentSoFar, "put 1 'silksteel thread' vault"]);
    expect(mock.terminalWrites.some((w) => w.includes('silksteel cloth square'))).toBe(true);

    const queue = getOrderQueue('testchar');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: orderId, quantityRemaining: 1, quantityTotal: 1 });
  });

  it('stops with an error on vault failure during a pull, sending no further commands', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');

    mock.feedLine('I see nothing like that in the vault.');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(5000);
    expect(mock.sent).toEqual(sentSoFar); // nothing further sent
    expect(mock.terminalWrites.some((w) => w.includes('uncut diamond stone'))).toBe(true);
  });

  it('regression: a vault failure that arrives after the pull timeout (already crafting) still stops with a restock message', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // pullConfirmTimeoutMs elapses -> craft sent
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'diamond gemstone'");

    mock.feedLine('I see nothing like that in the vault.'); // late failure for the get
    const sentSoFar = [...mock.sent];
    jest.advanceTimersByTime(5000);
    const expected = [...sentSoFar, "put 1 'uncut diamond stone' vault"]; // materials returned, no further get/craft
    expect(mock.sent).toEqual(expected);
    expect(mock.terminalWrites.some((w) => w.includes('restock needed'))).toBe(true);

    // And a stray outcome afterward must not resurrect the loop.
    mock.feedLine('You failed but did not lose any materials.');
    jest.advanceTimersByTime(5000);
    expect(mock.sent).toEqual(expected);
  });

  it('stops the trainer when crafting is interrupted, and can be restarted afterward', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'diamond gemstone'");

    mock.feedLine('You stop crafting.');
    const sentSoFar = [...mock.sent];
    jest.advanceTimersByTime(5000);
    expect(mock.sent).toEqual([...sentSoFar, "put 1 'uncut diamond stone' vault"]); // materials returned, nothing else
    expect(mock.terminalWrites.some((w) => w.includes('interrupted'))).toBe(true);
    // The resume hint names the actual mode/craft-type-specific command, not
    // a bare "crafthelper start" that doesn't exist.
    expect(mock.terminalWrites.some((w) => w.includes('crafthelper improve spellcraft start` to resume'))).toBe(true);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start'); // idle again, so start is accepted
    expect(mock.sent[mock.sent.length - 1]).toBe('score');
  });

  it('the interrupted-craft resume hint points at "order start" when order mode was running', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);

    mock.feedLine('You stop crafting.');
    expect(mock.terminalWrites.some((w) => w.includes('crafthelper order start` to resume'))).toBe(true);
  });

  it('recrafts the same item after a copyover interrupts the craft, with a fresh timeout window', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'diamond gemstone'");

    jest.advanceTimersByTime(400); // most of the way through the craft-response timeout
    mock.feedLine('Copyover recovery complete.');
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'diamond gemstone'"); // resent
    expect(mock.terminalWrites.some((w) => w.includes('Copyover') && w.includes('diamond gemstone'))).toBe(true);

    // The old timer window doesn't carry over — a fresh 500ms starts now.
    jest.advanceTimersByTime(400);
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).not.toContain('error_stopped'); // still waiting, not timed out yet

    jest.advanceTimersByTime(200);
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=error_stopped'); // now the fresh window has elapsed
  });

  it('goes cleanly idle on copyover recovery if a stop was already requested, without re-crafting', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    mock.feedLine('Copyover recovery complete.');

    expect(mock.sent.filter((c) => c.startsWith('craft ')).length).toBe(1); // no re-craft
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('stops cleanly with an error if no recognized outcome arrives within craftResponseTimeoutMs', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200); // pull-confirm timeout — assume the `get` succeeded
    mock.sent.length = 0;
    mock.terminalWrites.length = 0;

    jest.advanceTimersByTime(500);

    expect(mock.terminalWrites.join('\n')).toMatch(/craft/i);
    expect(mock.terminalWrites.join('\n')).toContain('500ms');
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=error_stopped');
  });

  it('does not fire the craft-response timeout once a recognized outcome line arrives first', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.feedLine('You were successful.');
    jest.advanceTimersByTime(500); // if the craft timer weren't cleared, this would also fire it

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).not.toContain('error_stopped');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while waiting on the craft-response timeout', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('reports "already running" with the current mode and its exact stop command', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    plugin.onAlias!(mock.api, 'crafthelper improve tailor start');
    expect(
      mock.terminalWrites.some((w) => w.includes('Already running in improve mode') && w.includes('crafthelper improve stop')),
    ).toBe(true);

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter'); // finish the in-flight step cleanly

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+"); // auto-starts (idle, empty queue)
    plugin.onAlias!(mock.api, 'crafthelper order start');
    expect(
      mock.terminalWrites.some((w) => w.includes('Already running in order mode') && w.includes('crafthelper order stop')),
    ).toBe(true);
  });

  it('returns pulled materials to the vault when a requested stop takes effect after a no-loss failure', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent, material in hand

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    mock.feedLine('You failed but did not lose any materials.');
    jest.advanceTimersByTime(5000);

    expect(mock.sent[mock.sent.length - 1]).toBe("put 1 'uncut diamond stone' vault");
    expect(mock.sent.filter((c) => c.startsWith('craft ')).length).toBe(1); // no re-craft
  });

  it('a requested stop still returns all the materials when the craft that was in flight comes back destroyed', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem leeching' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // gemstone pulled
    jest.advanceTimersByTime(200); // essence pulled
    jest.advanceTimersByTime(200); // ferrite crystal pulled -> craft sent
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'diamond gem leeching'");

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(5000);

    expect(mock.sent.filter((c) => c.startsWith('put '))).toEqual([
      "put 1 'diamond gemstone' vault",
      "put 1 'essence of moons' vault",
      "put 1 'ferrite crystal' vault",
    ]);
    expect(mock.sent.filter((c) => c.startsWith('get ')).length).toBe(3); // no re-pull
    expect(mock.terminalWrites.some((w) => w.includes('Stopped'))).toBe(true);
  });

  it('does not send any put on stop when nothing is held (e.g. stopped between cycles)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    mock.feedLine('You were successful.'); // consumed; trinket stored, then stop at next checkpoint
    jest.advanceTimersByTime(5000);

    expect(mock.sent.filter((c) => c.startsWith('put '))).toEqual(["put 1 'diamond gemstone' vault"]);
  });

  it('refuses to start again while materials are still being returned', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    mock.feedLine('You stop crafting.'); // release timer now pending

    const before = mock.sent.length;
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    expect(mock.sent.length).toBe(before); // no `score`
    expect(mock.terminalWrites.some((w) => w.includes('Still returning materials'))).toBe(true);
  });

  it('waits for a craft outcome up to the configured timeout, ignoring unrelated text', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 120_000 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // now crafting
    const sentSoFar = [...mock.sent];

    mock.feedLine('The troll swings at you.'); // unrelated text, no outcome yet
    jest.advanceTimersByTime(60_000); // a long wait — must not error or send anything
    expect(mock.sent).toEqual(sentSoFar);

    // The outcome eventually arrives, and the loop continues normally.
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("put 1 'diamond gemstone' vault");
  });

  it('stops with an error on start if the score line never arrives', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');

    jest.advanceTimersByTime(200); // scoreResponseTimeoutMs
    expect(mock.sent).toEqual(['score']); // no get ever sent
  });

  it('tier-switch timing: a mid-cycle skill-up does not change the in-flight trinket, only the next pull', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 120     Craft Rank: Journeyman Spellcrafter');
    jest.advanceTimersByTime(200);
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'obsidian gemstone'");

    // Skill crosses into the moonstone tier (121) on a "no loss" result —
    // the immediate re-craft must still use the old trinket.
    mock.feedRaw('Your crafting skill has improved. (121)\r\nYou failed but did not lose any materials.\r\n');
    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("craft spellcraft 'obsidian gemstone'");

    // Only once that material cycle actually ends (a fresh pull) does the new tier apply.
    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // put-back
    jest.advanceTimersByTime(100); // then pull
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'uncut moonstone' vault");
  });

  it('fulfills a spellcrafting gem order: gemstone, essence, then craft by the gem name', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'opal gem mind' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual([
      "get 1 'opal gemstone' vault",
      "get 1 'essence of the mind' vault",
      "craft spellcraft 'opal gem mind'",
    ]);
  });

  it('HUD says "improving <craft>" in improve mode', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    expect(mock.hudWrites[mock.hudWrites.length - 1].content?.value).toBe(
      'improving Spellcrafting · Lv 948 · diamond gemstone · crafting',
    );
  });

  it('HUD says "working on order <id>" in order mode, without a stale skill level', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const orderId = getOrderQueue('testchar')[0].id;
    plugin.onAlias!(mock.api, 'crafthelper order start');
    expect(mock.hudWrites[mock.hudWrites.length - 1].content?.value).toBe(
      `working on order ${orderId} · silksteel cloth helmet · pulling components`,
    );
  });

  it('regression: a skill-up line right after the success line (state already storing_trinket) updates the HUD', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // craft sent

    mock.feedLine('You were successful.');
    mock.feedLine('Your crafting skill has improved. (949)'); // no timers advanced: still storing_trinket

    expect(mock.hudWrites[mock.hudWrites.length - 1].content?.value).toContain('Lv 949');
    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'uncut diamond stone' vault"); // loop unaffected
  });

  it('regression: a skill-up line arriving after state has already advanced past "crafting" still updates the HUD', () => {
    // Live bug: "Your crafting skill has improved. (949)" arrived in a
    // payload after `success` had already advanced state to a fresh
    // pulling_components cycle. That state's scanner only checked for
    // vault-failure text, so the skill-up was silently dropped and the
    // HUD stayed on the old level even though tracking should have moved.
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // pull confirm -> craft sent

    mock.feedLine('You were successful.');
    jest.advanceTimersByTime(100); // put, then a fresh pull cycle begins
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'uncut diamond stone' vault");

    // The skill-up notice lands late, in its own payload, while we're now
    // sitting in pulling_components for the next cycle.
    mock.feedLine('Your crafting skill has improved. (949)');

    expect(mock.hudWrites[mock.hudWrites.length - 1].content?.value).toContain('Lv 949');
  });

  it('stop lets the in-flight put finish, then goes idle instead of pulling again', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("put 1 'diamond gemstone' vault"); // in-flight step still completes

    const sentSoFar = [...mock.sent];
    jest.advanceTimersByTime(100);
    expect(mock.sent).toEqual(sentSoFar); // no further `get` issued
  });

  it('start-while-running and stop-while-idle are no-ops', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    expect(mock.sent).toEqual([]);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    const afterFirstStart = [...mock.sent];
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    expect(mock.sent).toEqual(afterFirstStart);
  });

  it('fails cleanly with no commands sent for an unknown craft type token, listing the valid ones (likely a typo)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve jewelcrafting start');
    expect(mock.sent).toEqual([]);
    expect(
      mock.terminalWrites.some(
        (w) =>
          w.includes('Unknown craft type "jewelcrafting"') &&
          w.includes('"spellcrafting" (spellcraft)') &&
          w.includes('"tailoring" (tailor)'),
      ),
    ).toBe(true);
  });

  it('names the craft type when a skill level has no matching tier', () => {
    const mock = createMockApi(defaultConfig({ tierTable: '' })); // no tiers at all configured
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');

    expect(mock.sent).toEqual(['score']); // no get/craft ever sent
    expect(
      mock.terminalWrites.some(
        (w) => w.includes('Skill level 948 has no matching tier') && w.includes('"Spellcrafting"') && w.includes('Tier table config'),
      ),
    ).toBe(true);
  });

  it('resolves a craft type by its verb as well as its config id', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start'); // verb, not id
    expect(mock.sent).toEqual(['score']);
  });

  it('publishes a HUD widget and clears it on disable', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    const cleanup = plugin.onEnable!(mock.api) as () => void;

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    expect(mock.hudWrites[mock.hudWrites.length - 1].content?.value).toContain('checking score');

    cleanup();
    expect(mock.hudWrites[mock.hudWrites.length - 1].content).toBeNull();
  });

  it('ignores unmatched command input via onAlias', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    expect(plugin.onAlias!(mock.api, 'look')).toBeUndefined();
  });

  it('blunt weapons (shipped default): pulls all 3 components at the lowest tier before crafting', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve blunt-weapons start');
    mock.feedLine('Craftskill: 1     Craft Rank: Novice Weaponsmith (Blunt)');
    expect(mock.sent).toEqual(['score', "get 2 'bronze bar' vault"]);

    jest.advanceTimersByTime(200);
    expect(mock.sent).toContain("get 2 'cedar board' vault");
    jest.advanceTimersByTime(200);
    expect(mock.sent).toContain("get 2 'deer leather square' vault");
    jest.advanceTimersByTime(200);
    expect(mock.sent[mock.sent.length - 1]).toBe("craft bluntweapon 'round bronze trinket'");
  });

  it('sharp weapons (shipped default): escalates to the next material tier at its threshold', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve sharp-weapons start');
    // Skill 74 is exactly the threshold for "sharp bronze trinket" (the highest
    // bronze-tier row) — confirms the score line for Sharp doesn't collide with
    // the shared "Weaponsmith" substring in a Blunt score line.
    mock.feedLine('Craftskill: 74     Craft Rank: Apprentice Weaponsmith (Sharp)');
    jest.advanceTimersByTime(200); // bar
    jest.advanceTimersByTime(200); // board
    jest.advanceTimersByTime(200); // leather square
    expect(mock.sent[mock.sent.length - 1]).toBe("craft sharpweapon 'sharp bronze trinket'");
  });

  it('armor crafting (shipped default): pulls all 3 components at the top tier before crafting', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve armor-crafting start');
    mock.feedLine('Craftskill: 1001    Craft Rank: Legendary Grand Master Armorcrafter');
    expect(mock.sent).toEqual(['score', "get 2 'netherium bar' vault"]);

    jest.advanceTimersByTime(200);
    expect(mock.sent).toContain("get 2 'ironwood board' vault");
    jest.advanceTimersByTime(200);
    expect(mock.sent).toContain("get 2 'elephant leather square' vault");
    jest.advanceTimersByTime(200);
    expect(mock.sent[mock.sent.length - 1]).toBe("craft armorcraft 'netherium plate trinket'");
  });

  it('order add validates the item and quality spec before queueing', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond gem pain' 97+");
    expect(mock.terminalWrites.some((w) => w.includes('Queued order'))).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(1);
    expect(getOrderQueue('testchar')[0]).toMatchObject({
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
    });

    plugin.onAlias!(mock.api, "crafthelper order add 3 'not a real item' 99");
    expect(mock.terminalWrites.some((w) => w.includes('Unknown order item'))).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(1); // second add rejected, not queued

    plugin.onAlias!(mock.api, "crafthelper order add 3 'diamond gem pain' not-a-spec");
    expect(mock.terminalWrites.some((w) => w.includes('Invalid quality spec'))).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(1);
  });

  it('lists the valid craft types when an order item needs one that is not configured', () => {
    const tailoringLessCraftTypes = DEFAULT_CRAFT_TYPES_CONFIG.split('\n')
      .filter((line) => !line.includes('tailoring'))
      .join('\n');
    const mock = createMockApi(defaultConfig({ craftTypes: tailoringLessCraftTypes }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    expect(
      mock.terminalWrites.some(
        (w) =>
          w.includes('Craft type "tailoring"') &&
          w.includes("isn't configured") &&
          w.includes('"spellcrafting" (spellcraft)'),
      ),
    ).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(0);
  });

  it('adding the first order while idle starts fulfillment automatically, no explicit "order start" needed', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    // No "crafthelper order start" call — the add itself should have kicked
    // off the pull cycle for the queued order's first component.
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
    expect(mock.terminalWrites.some((w) => w.includes('Starting order fulfillment'))).toBe(true);
  });

  it('adding a second order while one is already active just queues it, without restarting', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 90+");
    // Still mid pull-cycle on the first order — no second "score"/pull burst,
    // and no "Already running" noise since the second add never asked to start.
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
    expect(getOrderQueue('testchar')).toHaveLength(2);
  });

  it('adding an order while improving a skill does not auto-start order fulfillment', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    const sentBeforeAdd = [...mock.sent];

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 90+");
    // Queued, but not started — improve mode is still running.
    expect(mock.sent).toEqual(sentBeforeAdd);
    expect(getOrderQueue('testchar')).toHaveLength(1);
  });

  it('order start with an empty queue is a no-op', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper order start');
    expect(mock.sent).toEqual([]);
    expect(mock.terminalWrites.some((w) => w.includes('No orders queued'))).toBe(true);
  });

  it('order mode pulls every named component, in order, before crafting', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
    jest.advanceTimersByTime(200); // pullConfirmTimeoutMs
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault", "get 1 'silksteel cloth square' vault"]);
    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual([
      "get 1 'silksteel thread' vault",
      "get 1 'silksteel cloth square' vault",
      "craft tailor 'silksteel cloth helmet'",
    ]);
  });

  it('order mode fulfills an arcanium armor order using the shipped armor-crafting craft type', () => {
    const mock = createMockApi(defaultConfig()); // armor-crafting is a shipped default craftTypes row
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'arcanium chainmail sleeves' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    expect(mock.sent).toEqual(["get 2 'arcanium bar' vault"]);
    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual(["get 2 'arcanium bar' vault", "get 2 'bull elephant leather square' vault"]);
    jest.advanceTimersByTime(200);
    expect(mock.sent[mock.sent.length - 1]).toBe("craft armorcraft 'arcanium chainmail sleeves'");
  });

  it('order add expands a tailoring cloth "set" into one queued order per slot', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'silksteel cloth set' 95+");

    const queue = getOrderQueue('testchar');
    expect(queue).toHaveLength(6);
    expect(new Set(queue.map((o) => o.itemName))).toEqual(
      new Set([
        'silksteel cloth helmet',
        'silksteel cloth gloves',
        'silksteel cloth boots',
        'silksteel cloth sleeves',
        'silksteel cloth leggings',
        'silksteel cloth shirt',
      ]),
    );
    expect(queue.every((o) => o.quantityRemaining === 2 && o.quantityTotal === 2)).toBe(true);
    expect(queue.every((o) => o.qualitySpec.kind === 'atLeast' && o.qualitySpec.min === 95)).toBe(true);
    expect(mock.terminalWrites.some((w) => w.includes('Queued set "silksteel cloth set"'))).toBe(true);
    // Auto-starts too, same as a single-item add.
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
  });

  it('order add expands an armor-crafting set ("arcanium chainmail set") into one order per slot', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'arcanium chainmail set' 97+");

    const queue = getOrderQueue('testchar');
    expect(queue).toHaveLength(6);
    expect(new Set(queue.map((o) => o.itemName))).toEqual(
      new Set([
        'arcanium chainmail boots',
        'arcanium chainmail leggings',
        'arcanium chainmail gloves',
        'arcanium chainmail sleeves',
        'arcanium chainmail tunic',
        'arcanium chainmail helmet',
      ]),
    );
  });

  it('order add requires the trailing "set" word for an armor set — the bare set name is an unknown item', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'arcanium platemail' 97+");
    expect(mock.terminalWrites.some((w) => w.includes('Unknown order item'))).toBe(true);
    expect(getOrderQueue('testchar')).toHaveLength(0);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'arcanium platemail set' 97+");
    expect(getOrderQueue('testchar')).toHaveLength(6);
  });

  it('defaults the order holding container to vault when unconfigured', () => {
    const mock = createMockApi(defaultConfig()); // no orderHoldingContainer override
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');

    expect(mock.sent).toContain("put 1 'diamond gem pain' vault");
  });

  it('an in-spec item is stored in the holding container, decrements the order, and refills it', () => {
    const mock = createMockApi(defaultConfig({ orderHoldingContainer: 'orders' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull diamond gemstone
    jest.advanceTimersByTime(200); // pull essence of pain
    // now crafting
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("lore 'diamond gem pain'");

    mock.feedLine('Condition: flawless (98%)');
    expect(mock.sent).toContain("put 1 'diamond gem pain' orders");
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);

    jest.advanceTimersByTime(100); // commandPacingDelayMs — refill, same order
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault");
  });

  it('an off-spec item is routed via the quality-container map and does not count toward the order', () => {
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '90-94 | common' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: scuffed (92%)');
    expect(mock.sent).toContain("put 1 'diamond gem pain' common");
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1); // unchanged — didn't count

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault"); // tries again
  });

  it('a mapped quality wins over the order holding container even when the item is in-spec, and still counts toward the order', () => {
    // Live report: order spec "90+" and a quality map with 95-97 -> vault,
    // 98-100 -> orb. A 95% item satisfied the order (in spec) and went
    // straight to the order holding container, never consulting the map —
    // the map was fixed to always win for a quality it covers, while order
    // credit still depends only on satisfying the spec, not the container.
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '98-100 | orb\n95-97 | vault' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull silksteel thread
    jest.advanceTimersByTime(200); // pull silksteel cloth square
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: excellent (95%)'); // satisfies 90+ AND falls in the 95-97 map row
    expect(mock.sent).toContain("put 1 'silksteel cloth helmet' vault"); // mapped container wins, not "orders"
    expect(mock.sent).not.toContain("put 1 'silksteel cloth helmet' orders");
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1); // still counted toward the order

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // same order continues
  });

  it('an unmapped in-spec quality still goes to the order holding container', () => {
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '98-100 | orb\n95-97 | vault' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: good (92%)'); // in spec, not covered by either map row
    expect(mock.sent).toContain("put 1 'diamond gem pain' orders");
  });

  it('completing an order dequeues it and auto-advances to the next queued order', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');

    expect(getOrderQueue('testchar')).toHaveLength(1); // completed order removed
    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // next order started
  });

  it('writes a progress line after each order item completes, and a completion line when the order finishes', () => {
    const mock = createMockApi(defaultConfig({ orderHoldingContainer: 'orders' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: flawless (98%)');
    expect(
      mock.terminalWrites.some(
        (w) => w.includes('"diamond gem pain" @ 98% (in spec)') && w.includes('1/2 done') && w.includes('1 remaining'),
      ),
    ).toBe(true);

    jest.advanceTimersByTime(100); // refill, same order
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (99%)');
    expect(mock.terminalWrites.some((w) => w.includes('Order') && w.includes('complete') && w.includes('2/2 done'))).toBe(true);
  });

  it('writes a progress line for an off-spec item too, noting it did not count toward the order', () => {
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '90-94 | common' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: scuffed (92%)');
    expect(
      mock.terminalWrites.some((w) => w.includes('off spec for order') && w.includes('needs 97+') && w.includes('0/1')),
    ).toBe(true);
  });

  it('a quality line that never arrives stops the plugin rather than guessing where to route the item', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(2000); // loreResponseTimeoutMs default
    // The made item goes to the vault rather than staying in inventory; nothing else is sent.
    expect(mock.sent).toEqual([...sentSoFar, "put 1 'diamond gem pain' vault"]);
    expect(mock.terminalWrites.some((w) => w.includes("verify quality"))).toBe(true);
  });

  it('order remove drops a queued order; removing the active order lets the in-flight attempt finish, then advances', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const firstOrderId = getOrderQueue('testchar')[0].id;

    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    // now crafting the active (first) order

    plugin.onAlias!(mock.api, `crafthelper order remove ${firstOrderId}`);
    expect(getOrderQueue('testchar')).toHaveLength(1);

    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)'); // would have matched the removed order's spec, but it's gone
    expect(mock.sent).toContain("put 1 'diamond gem pain' vault"); // no active order to route to -> default container

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // advanced to the remaining order
  });

  it('order status reports the active order and queue', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    mock.terminalWrites.length = 0;

    plugin.onAlias!(mock.api, 'crafthelper order status');
    expect(mock.terminalWrites.some((w) => w.includes('diamond gem pain'))).toBe(true);
  });

  it('order stop lets the in-flight step finish, then goes idle', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual(sentSoFar); // no further get/craft issued
  });

  it('refuses to start improve mode when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start')).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('refuses to start order mode when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, 'crafthelper order start')).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
  });

  it('refuses to queue an order when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+")).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
    expect(getOrderQueue('__unknown__')).toHaveLength(0);
  });

  it('clears activeOrder on stop so order status reports none instead of a stale order (review 3.4)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    // Let the in-flight step finish so stopRequested is actually honored.
    jest.advanceTimersByTime(5000);

    expect(plugin.onAlias!(mock.api, 'crafthelper order status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('activeOrder=none');
  });

  it('only tags the truly in-flight order as [active], not whatever is now at queue[0] (review 3.5)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'opal gem inertia' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start'); // starts fulfilling the first order

    // Default test identity is 'testchar' — read from that bucket.
    const queueBeforeRemove = getOrderQueue('testchar');
    expect(queueBeforeRemove).toHaveLength(2);
    const activeId = queueBeforeRemove[0].id;
    const otherId = queueBeforeRemove[1].id;

    // Positive case: while the order genuinely in flight, it's the one
    // tagged [active] — not just "whatever is at queue[0]".
    mock.terminalWrites.length = 0;
    plugin.onAlias!(mock.api, 'crafthelper order list');
    const activeLineBeforeRemove = mock.terminalWrites.find((w) => w.includes(`${activeId}:`));
    const otherLineBeforeRemove = mock.terminalWrites.find((w) => w.includes(`${otherId}:`));
    expect(activeLineBeforeRemove).toContain('[active]');
    expect(otherLineBeforeRemove).not.toContain('[active]');

    plugin.onAlias!(mock.api, `crafthelper order remove ${activeId}`); // splices it out while still in-flight

    mock.terminalWrites.length = 0;
    plugin.onAlias!(mock.api, 'crafthelper order list');
    expect(mock.terminalWrites.join('\n')).not.toContain('[active]'); // the real active order is gone from storage; the surviving order (now at queue[0]) is not it
  });

  it('does not let a late interrupted/vault-failure line in the same payload discard an already-detected success (review 3.2)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.sent.length = 0;
    mock.feedRaw('You were successful.\r\nYou stop crafting.\r\n');

    // A real success must still result in a `put`, not an error_stopped.
    expect(mock.sent.some((c) => c.startsWith('put'))).toBe(true);
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).not.toContain('error_stopped');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while awaiting a score-rank line (review 3.3)', () => {
    const mock = createMockApi(defaultConfig({ scoreResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while awaiting a quality (lore) line (review 3.3)', () => {
    const mock = createMockApi(defaultConfig({ loreResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull-confirm, both components
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.'); // -> checking_quality

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper order status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });
});
