import type { HudWidgetContent, PluginRuntimeApi } from '@shatteredarchive/types-client';
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
  it('parses the default table into 8 spellcrafting rows', () => {
    const rows = parseTierTableConfig(DEFAULT_TIER_TABLE_CONFIG);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.craftTypeId === 'spellcrafting')).toBe(true);
    expect(rows.every((r) => r.materialQty === 1)).toBe(true);
  });

  it('ignores blank lines and comments', () => {
    const rows = parseTierTableConfig('# comment\n\nspellcrafting | 1 | obsidian gemstone | uncut obsidian stone\n');
    expect(rows).toHaveLength(1);
  });

  it('parses an explicit qty when present', () => {
    const rows = parseTierTableConfig('armor | 1 | iron shield | iron ingot | 3');
    expect(rows[0].materialQty).toBe(3);
  });

  it('returns [] for non-string input', () => {
    expect(parseTierTableConfig(undefined)).toEqual([]);
    expect(parseTierTableConfig(42)).toEqual([]);
  });
});

describe('parseCraftTypesConfig', () => {
  it('parses the default craft-types row', () => {
    const rows = parseCraftTypesConfig(DEFAULT_CRAFT_TYPES_CONFIG);
    expect(rows).toEqual([{ id: 'spellcrafting', label: 'Spellcrafting', verb: 'spellcraft', keyword: 'Spellcrafter' }]);
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
  const base = { trackedSkillLevel: 948, activeTrinket: 'diamond gemstone', stopReason: null };

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

describe('crafting-helper state machine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
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

  it('"destroyed" triggers a fresh pull, not a re-craft', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100);

    const newCommands = mock.sent.slice(sentSoFar);
    expect(newCommands).toEqual(["get 1 'uncut diamond stone' vault"]);
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
    jest.advanceTimersByTime(100);
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
});
