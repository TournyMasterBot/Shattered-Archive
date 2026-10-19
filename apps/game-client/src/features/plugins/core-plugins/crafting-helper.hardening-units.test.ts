// apps/game-client/src/features/plugins/core-plugins/crafting-helper.hardening-units.test.ts
//
// Guards for the helpers and limits the PR #160 review fixes introduced (see
// crafting-helper.hardening.test.ts for the behavioural proof-of-concept suite and
// .ai-code-review/20261017-1350-pr160-crafting-helper for the findings). These symbols are new,
// so there is no PR-head run to compare against; each test pins one observable contract.
import {
  matchItemCondition,
  matchPullSuccess,
  matchPutSuccess,
  matchPutFailure,
  isPlausibleSkillUp,
  sanitizeCommandArg,
  sanitizeItemName,
  containerArg,
  numIn,
  tableFingerprint,
  resolveTableConfig,
  LEGACY_DEFAULT_TABLE_FINGERPRINTS,
  parseTierTableConfig,
  parseCraftTypesConfig,
  parseQualityContainerMap,
  DEFAULT_TIER_TABLE_CONFIG,
  DEFAULT_CRAFT_TYPES_CONFIG,
} from './crafting-helper.plugin';
import { getOrderQueue, removeOrder, MAX_QUEUED_ORDERS, type StoredCraftOrder } from './crafting-helper-storage';
import {
  SYS,
  boot,
  alias,
  statusOf,
  reachCrafting,
  reachOrderCrafting,
  freshModules,
  validOrder,
  ORDERS_KEY,
} from './crafting-helper.test-harness';

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  (window as unknown as { __SA_IDENTITY__?: { characterName?: string } }).__SA_IDENTITY__ = {
    characterName: 'testchar',
  };
  for (const o of getOrderQueue('testchar')) removeOrder('testchar', o.id);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('SEC-1/2: matcher units', () => {
  it('matchPullSuccess accepts the real corpus line and nothing that is not a vault pull', () => {
    expect(matchPullSuccess('You get a silksteel cloth helmet from the mystic vault.')).toBe(true);
    expect(matchPullSuccess('Xaltar says, "You get a gem from the vault."')).toBe(false);
    expect(matchPullSuccess('You get a gem from the ground.')).toBe(false);
  });

  it('matchPutSuccess / matchPutFailure accept only the whole server lines (corpus shapes)', () => {
    expect(matchPutSuccess("You put a traveler's diary in the mystic vault.")).toBe(true);
    expect(matchPutSuccess('You put a tattered, old quill in the mystic vault.')).toBe(true);
    expect(matchPutSuccess('Bob says, "You put a gem in the vault."')).toBe(false);
    expect(matchPutSuccess("Bob OOC: 'You put a gem in the vault.'")).toBe(false);
    expect(matchPutSuccess('You put a gem')).toBe(false);
    expect(matchPutFailure('You do not have that item.')).toBe(true);
    expect(matchPutFailure('Bob says, "You do not have that item."')).toBe(false);
    expect(matchPutFailure('>> You do not have that item.')).toBe(false);
  });

  it.each([
    [949, 948, true],
    [953, 948, true],
    [954, 948, false], // +6: beyond a single skill-up
    [948, 948, false], // no change
    [900, 948, false], // regression
    [1001, 1000, true],
    [1002, 1001, false], // over the cap
    [0, null, false],
    [5, null, true], // nothing tracked yet (order mode starts with none): any in-range value
    [1.5, 1, false],
    [NaN, 10, false],
  ])('isPlausibleSkillUp(%s, tracked %s) = %s', (level, tracked, expected) => {
    expect(isPlausibleSkillUp(level as number, tracked as number | null)).toBe(expected);
  });

  it('matchItemCondition rejects speech around the Condition text even when it ends the line', () => {
    expect(matchItemCondition("Xaltar OOC Clan: 'An adamantium pickaxe lies here.Condition: poor (30%)'")).toBeNull();
    expect(matchItemCondition('Weight: 4  Condition: poor (30%)')).toBeNull(); // only "Size: <word>" may precede it
    expect(matchItemCondition('Size: tiny   Condition: poor (30%) trailing')).toBeNull();
  });
});

describe('CFG-2: command-argument sanitizing', () => {
  it('sanitizeCommandArg strips apostrophes and every control character and collapses whitespace', () => {
    expect(sanitizeCommandArg("ogre's  tooth")).toBe('ogres tooth');
    expect(sanitizeCommandArg('vault\rquit')).toBe('vaultquit');
    expect(sanitizeCommandArg('a\nb\tc\x00d\x7fe')).toBe('abcde');
    expect(sanitizeCommandArg('  padded   words  ')).toBe('padded words');
    expect(sanitizeItemName("bob's\r\nbar")).toBe('bobsbar');
  });

  it('containerArg leaves a one-word container bare (existing wire format) and quotes a multi-word one', () => {
    expect(containerArg('vault')).toBe('vault');
    expect(containerArg('my chest')).toBe("'my chest'");
  });

  it('config parsers never emit a control character, whatever the saved text contains', () => {
    const clean = (s: string) => !/[\x00-\x1f\x7f']/.test(s);
    const tiers = parseTierTableConfig("spellcrafting | 1 | gem\rquit | stone\r:1, ogre's tooth:2");
    expect(tiers).toHaveLength(1);
    expect(clean(tiers[0].trinket)).toBe(true);
    for (const c of tiers[0].components) expect(clean(c.material)).toBe(true);

    const types = parseCraftTypesConfig('id | La\rbel | ver\rb | key\rword');
    expect(types).toHaveLength(1);
    for (const v of [types[0].label, types[0].verb, types[0].keyword]) expect(clean(v)).toBe(true);

    expect(parseQualityContainerMap("90-100 | Bob's\r pouch")).toEqual([
      { min: 90, max: 100, container: 'Bobs pouch' },
    ]);
  });

  it('a container that sanitizes to nothing is dropped from the quality map', () => {
    expect(parseQualityContainerMap("90-100 | '\r'")).toEqual([]);
  });
});

describe('CFG-1: numIn', () => {
  it.each([
    [150, 150, 50, 5000, 150],
    [100, 150, 50, 5000, 100],
    [50, 150, 50, 5000, 50], // inclusive bounds
    [5000, 150, 50, 5000, 5000],
    [49, 150, 50, 5000, 150],
    [5001, 150, 50, 5000, 150],
    ['300', 150, 50, 5000, 300], // the config modal can hand back numeric strings
    [123.9, 150, 50, 5000, 123],
    ['', 150, 50, 5000, 150],
    ['   ', 150, 50, 5000, 150],
    [null, 150, 50, 5000, 150],
    [undefined, 150, 50, 5000, 150],
    [true, 150, 50, 5000, 150],
    [Infinity, 150, 50, 5000, 150],
    [-1, 150, 50, 5000, 150],
    ['abc', 150, 50, 5000, 150],
  ])('numIn(%p, fallback %p, [%p..%p]) = %p', (value, fallback, min, max, expected) => {
    expect(numIn(value, fallback, min, max)).toBe(expected);
  });
});

describe('CFG-3: a saved copy of a shipped default recipe table does not freeze it', () => {
  const DEFAULT = DEFAULT_TIER_TABLE_CONFIG;

  it('tableFingerprint ignores comments, blank lines and whitespace but sees real edits', () => {
    const base = 'a | 1 | gem | stone:1\nb | 2 | gem2 | stone2:1';
    expect(tableFingerprint('# comment\n\n  a  |  1 | gem |   stone:1  \n\nb | 2 | gem2 | stone2:1\n')).toBe(
      tableFingerprint(base),
    );
    expect(tableFingerprint('a | 1 | gem | stone:2\nb | 2 | gem2 | stone2:1')).not.toBe(tableFingerprint(base));
  });

  it('a saved table equal to the current default resolves to the code default', () => {
    expect(resolveTableConfig(`# saved by the modal\n${DEFAULT}\n`, DEFAULT, [])).toBe(DEFAULT);
  });

  it('a saved table equal to a known older default is upgraded to the current default', () => {
    const OLD = 'spellcrafting | 1 | old gem | old stone:1';
    const NEW = 'spellcrafting | 1 | new gem | new stone:1';
    expect(resolveTableConfig(OLD, NEW, [tableFingerprint(OLD)])).toBe(NEW);
  });

  it('a table the player really edited is kept, and so is anything that is not a string', () => {
    const edited = `${DEFAULT}\nspellcrafting | 1000 | custom gem | custom stone:9`;
    expect(resolveTableConfig(edited, DEFAULT, [])).toBe(edited);
    expect(resolveTableConfig(undefined, DEFAULT, [])).toBeUndefined();
  });

  it('ships no legacy fingerprints yet (so today a saved default behaves exactly like the default)', () => {
    expect(LEGACY_DEFAULT_TABLE_FINGERPRINTS.tierTable).toEqual([]);
    expect(LEGACY_DEFAULT_TABLE_FINGERPRINTS.craftTypes).toEqual([]);
  });

  it('the engine reads a whitespace-reformatted saved default the same as the default', () => {
    const reformatted = `# comment\n${DEFAULT.split('\n')
      .map((l) => `  ${l.replace(/\|/g, ' |  ')}  `)
      .join('\n\n')}`;
    const h = boot({ tierTable: reformatted, craftTypes: DEFAULT_CRAFT_TYPES_CONFIG });
    reachCrafting(h);
    expect(h.mock.sent.at(-1)).toBe("craft spellcraft 'diamond gemstone'");
  });
});

describe('DAT-3: the order queue is capped', () => {
  const orderN = (n: number): StoredCraftOrder => validOrder(`o-${n}`);

  it('addOrder refuses the order after MAX_QUEUED_ORDERS instead of dropping an older one', () => {
    const { storage } = freshModules();
    for (let i = 0; i < MAX_QUEUED_ORDERS; i++) expect(storage.addOrder('testchar', orderN(i))).toBe(true);

    expect(storage.addOrder('testchar', orderN(9999))).toBe(false);

    const queue = storage.getOrderQueue('testchar');
    expect(queue).toHaveLength(MAX_QUEUED_ORDERS);
    expect(queue[0].id).toBe('o-0');
    expect(storage.countOrders('testchar')).toBe(MAX_QUEUED_ORDERS);
  });

  it('an oversized stored queue loads capped, keeping the head (the order that runs next)', () => {
    const stored = Array.from({ length: MAX_QUEUED_ORDERS + 50 }, (_, i) => orderN(i));
    window.localStorage.setItem(ORDERS_KEY('testchar'), JSON.stringify(stored));
    const { storage } = freshModules();

    const queue = storage.getOrderQueue('testchar');

    expect(queue).toHaveLength(MAX_QUEUED_ORDERS);
    expect(queue[0].id).toBe('o-0');
  });

  it('order add reports a full queue and queues nothing, including nothing of a set', () => {
    const { storage, plugin, harness } = freshModules();
    for (let i = 0; i < MAX_QUEUED_ORDERS - 2; i++) storage.addOrder('testchar', orderN(i));
    const mock = harness.createMockApi(harness.defaultConfig({ autoStartOnOrderAdd: false }));
    const p = plugin.createCraftingHelperPlugin();
    p.onEnable!(mock.api);

    // A cloth set fans out to more than 2 orders, so it must be refused whole.
    p.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth set' 90+");

    expect(storage.countOrders('testchar')).toBe(MAX_QUEUED_ORDERS - 2);
    expect(mock.terminalWrites.at(-1)).toMatch(/queue is full/i);
  });
});

describe('DAT-1/2: storage failure and data-loss reporting', () => {
  it('the player is told when saved orders were unreadable and dropped', () => {
    window.localStorage.setItem(ORDERS_KEY('testchar'), JSON.stringify([null, validOrder('good'), { id: 'x' }]));
    const { plugin, harness } = freshModules();
    const mock = harness.createMockApi(harness.defaultConfig({ autoStartOnOrderAdd: false }));
    const p = plugin.createCraftingHelperPlugin();
    p.onEnable!(mock.api);

    p.onAlias!(mock.api, 'crafthelper order list');

    expect(mock.terminalWrites.join('\n')).toMatch(/Ignored 2 saved order\(s\)/);
    mock.terminalWrites.length = 0;
    p.onAlias!(mock.api, 'crafthelper order list');
    expect(mock.terminalWrites.join('\n')).not.toMatch(/Ignored/); // reported once, not on every list
  });

  it('a failed localStorage write is reported to the player once, not swallowed', () => {
    const { storage, plugin, harness } = freshModules();
    const mock = harness.createMockApi(harness.defaultConfig());
    const p = plugin.createCraftingHelperPlugin();
    p.onEnable!(mock.api);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    storage.addOrder('testchar', validOrder('a'));
    storage.addOrder('testchar', validOrder('b'));

    expect(mock.terminalWrites.filter((w) => /could not save crafting progress/i.test(w))).toHaveLength(1);
  });

  it('a skill entry saved without updatedAt loads with a numeric one (no NaN eviction order)', () => {
    window.localStorage.setItem(
      'shatteredarchive.plugins.crafting-helper.skillLevels',
      JSON.stringify({ 'testchar::spellcrafting': { level: 77 } }),
    );
    const { storage } = freshModules();
    expect(storage.getTrackedSkillLevel('testchar', 'spellcrafting')).toBe(77);
  });

  it('the pending skill-level write is also flushed when the tab becomes hidden', () => {
    const { storage } = freshModules();
    storage.setTrackedSkillLevel('testchar', 'spellcrafting', 960);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(window.localStorage.getItem('shatteredarchive.plugins.crafting-helper.skillLevels')).toContain('960');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
});

describe('SAF-2: rate-limit recovery and the no-loss attempt budget', () => {
  it('a tripped rate limit stays tripped: nothing is re-armed, and a stop + restart works again', () => {
    const h = boot({ maxCommandsPerWindow: 20, maxConsecutiveFailures: 1000 });
    reachCrafting(h);
    for (let i = 0; i < 40; i++) {
      h.mock.feedLine(SYS.noLoss);
      jest.advanceTimersByTime(100);
    }
    expect(statusOf(h)).toContain('state=error_stopped');
    const sentAtTrip = h.mock.sent.length;
    jest.advanceTimersByTime(300_000);
    expect(h.mock.sent.length).toBe(sentAtTrip);

    alias(h, 'crafthelper improve stop'); // from error_stopped: back to idle with a clean window
    jest.advanceTimersByTime(60_000);
    alias(h, 'crafthelper improve spellcraft start');
    expect(h.mock.sent.at(-1)).toBe('score');
  });

  it('the attempt budget also stops an order that keeps failing with no material loss', () => {
    const h = boot({ maxAttemptsPerItem: 2, maxConsecutiveFailures: 1000 });
    reachOrderCrafting(h);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);
    expect(statusOf(h)).toContain('state=error_stopped');
    expect(h.mock.terminalWrites.join('\n')).toMatch(/too many attempts/i);
  });

  it('debug logging traces each command the plugin sends; off by default', () => {
    const quiet = boot();
    alias(quiet, 'crafthelper improve spellcraft start');
    expect(quiet.mock.logs).toEqual([]);

    const loud = boot({ debug: true });
    alias(loud, 'crafthelper improve spellcraft start');
    expect(loud.mock.logs.map((l) => l[0])).toContain('send: score');
  });
});

describe('TMR-1/LIF: interrupts and disable around the put-back chain', () => {
  it('"You stop crafting." arriving during the destroyed put-back chain does not strand the components', () => {
    const h = boot();
    alias(h, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    jest.advanceTimersByTime(400); // both components pulled → crafting
    h.mock.feedLine(SYS.destroyed); // put-back chain for 2 components
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.interrupted);
    jest.advanceTimersByTime(100);
    jest.advanceTimersByTime(100);

    expect(h.mock.sent.slice(before, before + 2)).toEqual([
      "put 1 'silksteel thread' vault",
      "put 1 'silksteel cloth square' vault",
    ]);
  });

  it('disabling an idle plugin is silent and leaves it ready to run', () => {
    const h = boot();
    (h.cleanup as () => void)();
    expect(h.mock.terminalWrites).toEqual([]);
    h.plugin.onEnable!(h.mock.api);
    alias(h, 'crafthelper improve spellcraft start');
    expect(h.mock.sent).toEqual(['score']);
  });

  it('remote-server:close while idle changes nothing', () => {
    const h = boot();
    h.mock.emit('game:remote-server:close', {});
    expect(h.mock.terminalWrites).toEqual([]);
  });

  it('enable subscribes to exactly the events it needs and unsubscribes on disable', () => {
    const h = boot();
    const events = ['shatteredarchive:raw-data', 'game:remote-server:close', 'game:character-login'];
    for (const name of events) expect(h.mock.listenerCount(name)).toBe(1);
    (h.cleanup as () => void)();
    for (const name of events) expect(h.mock.listenerCount(name)).toBe(0);
  });
});
