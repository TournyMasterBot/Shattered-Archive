import type { HudWidgetContent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { getOrderQueue, removeOrder } from './crafting-helper-storage';
import {
  createCraftingHelperPlugin,
  tierForSkill,
  parseTierTableConfig,
  parseCraftTypesConfig,
  findCraftSkillLevel,
  matchCraftOutcome,
  matchSkillImproved,
  matchVaultFailure,
  buildHudContent,
  DEFAULT_CRAFT_TYPES_CONFIG,
  DEFAULT_TIER_TABLE_CONFIG,
  type CraftTierRow,
  parseQualitySpec,
  qualityMatchesSpec,
  matchItemCondition,
  parseQualityContainerMap,
  containerForQuality,
  ORDER_ITEM_RECIPES,
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
    expect(tierForSkill('tailoring', 500, rows)).toBeNull();
  });
});

describe('parseTierTableConfig', () => {
  it('parses the default table into 8 spellcrafting rows, each single-component at qty 1', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG).filter((r) => r.craftTypeId === 'spellcrafting');
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.components.length === 1 && r.components[0].qty === 1)).toBe(true);
  });

  it('parses the default table into 27 sharp-weapons and 27 blunt-weapons multi-component rows', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG);
    const sharp = rows.filter((r) => r.craftTypeId === 'sharp-weapons');
    const blunt = rows.filter((r) => r.craftTypeId === 'blunt-weapons');
    expect(sharp).toHaveLength(27);
    expect(blunt).toHaveLength(27);
    expect(sharp.every((r) => r.components.length === 3 && r.components.every((c) => c.qty === 2))).toBe(true);
    expect(blunt.every((r) => r.components.length === 3 && r.components.every((c) => c.qty === 2))).toBe(true);
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

  it('skips a row whose component list is empty or malformed', () => {
    expect(parseTierTableConfig('armor | 1 | iron shield | not-a-component-list')).toEqual([]);
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
    ]);
  });

  it('ignores malformed rows with too few fields', () => {
    expect(parseCraftTypesConfig('spellcrafting | Spellcrafting')).toEqual([]);
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

describe('matchVaultFailure', () => {
  it('matches the exact vault-failure string', () => {
    expect(matchVaultFailure('I see nothing like that in the vault.')).toBe(true);
  });

  it('is false otherwise', () => {
    expect(matchVaultFailure('You get 1 uncut diamond stone.')).toBe(false);
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

describe('matchItemCondition', () => {
  it('extracts the quality percentage', () => {
    expect(matchItemCondition('Condition: flawless (97%)')).toBe(97);
  });

  it('returns null for unrelated text', () => {
    expect(matchItemCondition('You were successful.')).toBeNull();
  });
});

describe('parseQualityContainerMap / containerForQuality', () => {
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

  it('routes a quality within a mapped range to its container', () => {
    const rows = parseQualityContainerMap('90-94 | common\n95-97 | uncommon');
    expect(containerForQuality(92, rows)).toBe('common');
    expect(containerForQuality(96, rows)).toBe('uncommon');
  });

  it('falls back to vault for an unmapped quality', () => {
    const rows = parseQualityContainerMap('90-94 | common');
    expect(containerForQuality(99, rows)).toBe('vault');
  });
});

describe('ORDER_ITEM_RECIPES', () => {
  it('includes the seeded spellcrafting and tailoring examples', () => {
    expect(ORDER_ITEM_RECIPES['diamond of pain']).toEqual({
      craftTypeId: 'spellcrafting',
      components: [
        { material: 'diamond gemstone', qty: 1 },
        { material: 'pain essence', qty: 1 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['bull elephant leather tunic']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'silksteel thread', qty: 4 },
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
    activeCraftType: 'spellcrafting',
    commandPacingDelayMs: 100,
    pullConfirmTimeoutMs: 200,
    scoreResponseTimeoutMs: 200,
    debug: false,
    hudSlot: 'hud.bottomStrip',
    ...overrides,
  };
}

const TAILORING_CRAFT_TYPES_CONFIG = `${DEFAULT_CRAFT_TYPES_CONFIG}\ntailoring | Tailoring | tailor | Tailor`;

describe('crafting-helper state machine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    // The order queue is a module-level singleton keyed by character (see
    // crafting-helper-storage.ts) — localStorage.clear() alone doesn't reset
    // its in-memory state between tests in this file (unlike
    // crafting-helper-storage.test.ts, this file uses a static top-level
    // import of the plugin factory, so it can't use jest.resetModules() per
    // test without also losing that binding). Drain leftovers explicitly so
    // each order-mode test starts from an empty queue for '__unknown__'.
    for (const o of getOrderQueue('__unknown__')) removeOrder('__unknown__', o.id);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the score → pull → craft happy path for a fresh character', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper start');
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
    plugin.onAlias!(mock.api, 'crafthelper start');
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
    plugin.onAlias!(mock.api, 'crafthelper start');
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
    plugin.onAlias!(mock.api, 'crafthelper start');
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
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull silksteel thread
    jest.advanceTimersByTime(200); // pull silksteel square
    // now crafting
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // put back thread
    jest.advanceTimersByTime(100); // put back square
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'silksteel thread' vault",
      "put 1 'silksteel square' vault",
    ]);

    jest.advanceTimersByTime(100); // then re-pull both, fresh
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'silksteel thread' vault",
      "put 1 'silksteel square' vault",
      "get 1 'silksteel thread' vault",
    ]);
  });

  it('a vault failure partway through a multi-component order pull leaves the order queued untouched', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const orderId = getOrderQueue('__unknown__')[0].id;
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull silksteel thread succeeds

    mock.feedLine('I see nothing like that in the vault.'); // fails on the SECOND component
    const sentSoFar = [...mock.sent];
    jest.advanceTimersByTime(5000);
    expect(mock.sent).toEqual(sentSoFar); // nothing further sent
    expect(mock.terminalWrites.some((w) => w.includes('silksteel square'))).toBe(true);

    const queue = getOrderQueue('__unknown__');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: orderId, quantityRemaining: 1, quantityTotal: 1 });
  });

  it('stops with an error on vault failure during a pull, sending no further commands', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');

    mock.feedLine('I see nothing like that in the vault.');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(5000);
    expect(mock.sent).toEqual(sentSoFar); // nothing further sent
    expect(mock.terminalWrites.some((w) => w.includes('uncut diamond stone'))).toBe(true);
  });

  it('waits indefinitely for a craft outcome — no timeout, since higher-tier crafts can take a while', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200); // now crafting
    const sentSoFar = [...mock.sent];

    mock.feedLine('The troll swings at you.'); // unrelated text, no outcome yet
    jest.advanceTimersByTime(60_000); // a long wait — must not error or send anything
    expect(mock.sent).toEqual(sentSoFar);

    // The outcome eventually arrives, however late, and the loop continues normally.
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("put 1 'diamond gemstone' vault");
  });

  it('stops with an error on start if the score line never arrives', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');

    jest.advanceTimersByTime(200); // scoreResponseTimeoutMs
    expect(mock.sent).toEqual(['score']); // no get ever sent
  });

  it('tier-switch timing: a mid-cycle skill-up does not change the in-flight trinket, only the next pull', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
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

  it('stop lets the in-flight put finish, then goes idle instead of pulling again', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper stop');
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

    plugin.onAlias!(mock.api, 'crafthelper stop');
    expect(mock.sent).toEqual([]);

    plugin.onAlias!(mock.api, 'crafthelper start');
    const afterFirstStart = [...mock.sent];
    plugin.onAlias!(mock.api, 'crafthelper start');
    expect(mock.sent).toEqual(afterFirstStart);
  });

  it('fails cleanly with no commands sent when activeCraftType is not in craftTypes', () => {
    const mock = createMockApi(defaultConfig({ activeCraftType: 'tailoring' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper start');
    expect(mock.sent).toEqual([]);
    expect(mock.terminalWrites.some((w) => w.includes('Unknown active craft type'))).toBe(true);
  });

  it('publishes a HUD widget and clears it on disable', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    const cleanup = plugin.onEnable!(mock.api) as () => void;

    plugin.onAlias!(mock.api, 'crafthelper start');
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
    const mock = createMockApi(defaultConfig({ activeCraftType: 'blunt-weapons' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper start');
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
    const mock = createMockApi(defaultConfig({ activeCraftType: 'sharp-weapons' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper start');
    // Skill 74 is exactly the threshold for "sharp bronze trinket" (the highest
    // bronze-tier row) — confirms the score line for Sharp doesn't collide with
    // the shared "Weaponsmith" substring in a Blunt score line.
    mock.feedLine('Craftskill: 74     Craft Rank: Apprentice Weaponsmith (Sharp)');
    jest.advanceTimersByTime(200); // bar
    jest.advanceTimersByTime(200); // board
    jest.advanceTimersByTime(200); // leather square
    expect(mock.sent[mock.sent.length - 1]).toBe("craft sharpweapon 'sharp bronze trinket'");
  });

  it('order add validates the item and quality spec before queueing', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond of pain' 97+");
    expect(mock.terminalWrites.some((w) => w.includes('Queued order'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);
    expect(getOrderQueue('__unknown__')[0]).toMatchObject({
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
    });

    plugin.onAlias!(mock.api, "crafthelper order add 3 'not a real item' 99");
    expect(mock.terminalWrites.some((w) => w.includes('Unknown order item'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1); // second add rejected, not queued

    plugin.onAlias!(mock.api, "crafthelper order add 3 'diamond of pain' not-a-spec");
    expect(mock.terminalWrites.some((w) => w.includes('Invalid quality spec'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);
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
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
    jest.advanceTimersByTime(200); // pullConfirmTimeoutMs
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault", "get 1 'silksteel square' vault"]);
    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual([
      "get 1 'silksteel thread' vault",
      "get 1 'silksteel square' vault",
      "craft tailor 'silksteel cloth helmet'",
    ]);
  });

  it('an in-spec item is stored in the holding container, decrements the order, and refills it', () => {
    const mock = createMockApi(defaultConfig({ orderHoldingContainer: 'orders' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull diamond gemstone
    jest.advanceTimersByTime(200); // pull pain essence
    // now crafting
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("lore 'diamond of pain'");

    mock.feedLine('Condition: flawless (98%)');
    expect(mock.sent).toContain("put 1 'diamond of pain' orders");
    expect(getOrderQueue('__unknown__')[0].quantityRemaining).toBe(1);

    jest.advanceTimersByTime(100); // commandPacingDelayMs — refill, same order
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault");
  });

  it('an off-spec item is routed via the quality-container map and does not count toward the order', () => {
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '90-94 | common' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: scuffed (92%)');
    expect(mock.sent).toContain("put 1 'diamond of pain' common");
    expect(getOrderQueue('__unknown__')[0].quantityRemaining).toBe(1); // unchanged — didn't count

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault"); // tries again
  });

  it('completing an order dequeues it and auto-advances to the next queued order', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');

    expect(getOrderQueue('__unknown__')).toHaveLength(1); // completed order removed
    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // next order started
  });

  it('a quality line that never arrives stops the plugin rather than guessing where to route the item', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(2000); // loreResponseTimeoutMs default
    expect(mock.sent).toEqual(sentSoFar); // no further `put`/`get` sent
    expect(mock.terminalWrites.some((w) => w.includes("verify quality"))).toBe(true);
  });

  it('order remove drops a queued order; removing the active order lets the in-flight attempt finish, then advances', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const firstOrderId = getOrderQueue('__unknown__')[0].id;

    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    // now crafting the active (first) order

    plugin.onAlias!(mock.api, `crafthelper order remove ${firstOrderId}`);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);

    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)'); // would have matched the removed order's spec, but it's gone
    expect(mock.sent).toContain("put 1 'diamond of pain' vault"); // no active order to route to -> default container

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // advanced to the remaining order
  });

  it('order status reports the active order and queue', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    mock.terminalWrites.length = 0;

    plugin.onAlias!(mock.api, 'crafthelper order status');
    expect(mock.terminalWrites.some((w) => w.includes('diamond of pain'))).toBe(true);
  });

  it('order stop lets the in-flight step finish, then goes idle', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
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
});
