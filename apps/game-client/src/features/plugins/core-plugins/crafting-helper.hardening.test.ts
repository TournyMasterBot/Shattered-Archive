// apps/game-client/src/features/plugins/core-plugins/crafting-helper.hardening.test.ts
//
// Regression guards for the PR #160 deep review (.ai-code-review/20261017-1350-pr160-crafting-helper).
// Every test names the finding id it guards (SEC-1 ... COR-1). They double as proof-of-concept exploits:
// run against the PR head (8561e03) the ones for real defects FAIL; after the fixes they pass.
//
// Chat line shapes below are the REAL shapes found in the player-log corpus (C:\Projects\DSL\GameLogs):
//   Name says, "..."          Name grats '...'         Name OOC: '...'
//   Name OOC Kingdom: '...'   Name auctions: '...'     You OOC: '...'   (your own channel echo)
// Corpus facts these tests encode (poc/corpus-evidence-*.json):
//   - "Copyover recovery complete." and "I see nothing like that in the vault." are ALWAYS whole lines
//     (103 / 59 occurrences, 0 prompt-prefixed, 0 inside speech).
//   - "Your crafting skill has improved. (N)" appears 4 times, ALL inside player chat (666-815).
//   - "Condition: x (N%)" is whole-line 2114x, prefixed "Size: tiny   " 3200x, inside chat 1x; N is 25..100.
import { parseQualitySpec, matchSkillImproved, matchCraftOutcome, matchItemCondition } from './crafting-helper.plugin';
import { getOrderQueue, removeOrder, getTrackedSkillLevel } from './crafting-helper-storage';
import {
  SYS,
  SCORE_SPELL_948,
  boot,
  alias,
  statusOf,
  reachCrafting,
  reachOrderCrafting,
  freshModules,
  validOrder,
  ORDERS_KEY,
  type Harness,
} from './crafting-helper.test-harness';

// ── fixtures ────────────────────────────────────────────────────────────

const CHAT_FORMS: Record<string, (text: string) => string> = {
  say: (t) => `Xaltar says, "${t}"`,
  grats: (t) => `Xaltar grats '${t}'`,
  ooc: (t) => `Xaltar OOC: '${t}'`,
  oocKingdom: (t) => `Xaltar OOC Kingdom: 'yay ${t}'`,
  auctions: (t) => `Xaltar auctions: '${t}'`,
  ownEcho: (t) => `You OOC: '${t}'`,
};

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
});

// ── SEC-1 ───────────────────────────────────────────────────────────────

describe('SEC-1: player chat cannot drive the crafting state machine', () => {
  describe.each(Object.entries(CHAT_FORMS))('chat form: %s', (_name, chat) => {
    it.each(Object.keys(SYS) as Array<keyof typeof SYS>)('"%s" text inside chat is ignored while crafting', (key) => {
      const h = boot();
      reachCrafting(h);
      const before = [...h.mock.sent];

      h.mock.feedLine(chat(SYS[key]));
      jest.advanceTimersByTime(1000);

      expect(h.mock.sent).toEqual(before);
      expect(statusOf(h)).toContain('state=crafting');
    });
  });

  it('a vault-failure line inside chat does not stop a pull that is in flight', () => {
    const h = boot();
    alias(h, 'crafthelper improve spellcraft start');
    h.mock.feedLine(SCORE_SPELL_948); // get sent, waiting for a vault failure
    h.mock.feedLine(CHAT_FORMS.ooc(SYS.vaultFailure));
    jest.advanceTimersByTime(200);

    expect(h.mock.sent.at(-1)).toBe("craft spellcraft 'diamond gemstone'");
    expect(statusOf(h)).not.toContain('error_stopped');
  });

  it("a Condition line inside chat (real corpus shape) does not decide an order item's quality", () => {
    const h = boot();
    reachOrderCrafting(h);
    h.mock.feedLine(SYS.success);
    expect(h.mock.sent.at(-1)).toBe("lore 'diamond gem pain'");
    const before = h.mock.sent.length;

    // Real line from the corpus: a player pasted a lore result into clan chat.
    h.mock.feedLine("Xaltar OOC Clan: 'An adamantium pickaxe lies here.Condition: perfect (100%)'");
    jest.advanceTimersByTime(100);
    expect(h.mock.sent.slice(before)).toEqual([]);

    // The real lore output still resolves it (corpus shape: "Size: tiny   Condition: good (90%)").
    h.mock.feedLine('Size: tiny   Condition: good (90%)');
    expect(h.mock.sent.at(-1)).toBe("put 1 'diamond gem pain' vault");
  });

  it('still accepts the real whole-line lore shapes seen in the corpus', () => {
    expect(matchItemCondition('Condition: perfect (100%)')).toBe(100);
    expect(matchItemCondition('Size: tiny   Condition: excellent (95%)')).toBe(95);
    expect(matchItemCondition('  Condition: poor (25%)  ')).toBe(25);
  });

  it('rejects an impossible Condition percentage (the corpus never exceeds 100)', () => {
    expect(matchItemCondition('Condition: perfect (250%)')).toBeNull();
  });

  it('exact whole system lines still match; the same text inside speech does not', () => {
    for (const [, chat] of Object.entries(CHAT_FORMS)) {
      expect(matchCraftOutcome(chat(SYS.success))).toBeNull();
      expect(matchCraftOutcome(chat(SYS.destroyed))).toBeNull();
      expect(matchCraftOutcome(chat(SYS.noLoss))).toBeNull();
    }
    expect(matchCraftOutcome(SYS.success)).toBe('success');
    expect(matchCraftOutcome(`  ${SYS.destroyed}  `)).toBe('failed_destroyed');
    expect(matchCraftOutcome(SYS.noLoss)).toBe('failed_no_loss');
  });
});

// ── SEC-2 ───────────────────────────────────────────────────────────────

describe('SEC-2: skill-up lines are not trusted from chat, and cannot jump the tier', () => {
  // The four real corpus lines (names redacted).
  const REAL_CHAT_SKILLUPS = [
    "Xaltar grats 'Your crafting skill has improved. (700)'",
    "Xaltar OOC Kingdom: 'finally Your crafting skill has improved. (815)'",
    "Xaltar grats 'Your crafting skill has improved. (666) Uh oh'",
    "Xaltar OOC: 'yay Your crafting skill has improved. (722)'",
  ];

  it.each(REAL_CHAT_SKILLUPS)('%s does not change the tracked level', (line) => {
    const h = boot();
    reachCrafting(h);
    expect(getTrackedSkillLevel('testchar', 'spellcrafting')).toBe(948);

    h.mock.feedLine(line);

    expect(statusOf(h)).toContain('skill=948');
    expect(getTrackedSkillLevel('testchar', 'spellcrafting')).toBe(948);
  });

  it('matchSkillImproved only accepts the whole system line', () => {
    for (const line of REAL_CHAT_SKILLUPS) expect(matchSkillImproved(line)).toBeNull();
    expect(matchSkillImproved('Your crafting skill has improved. (949)')).toBe(949);
  });

  it('accepts the genuine +1 skill-up', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine('Your crafting skill has improved. (949)');
    expect(statusOf(h)).toContain('skill=949');
    expect(getTrackedSkillLevel('testchar', 'spellcrafting')).toBe(949);
  });

  it.each([
    ['a jump far beyond one skill-up', '(990)'],
    ['a value above the 1001 cap', '(1002)'],
    ['a regression', '(900)'],
  ])('ignores an exact-form line carrying %s', (_why, value) => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(`Your crafting skill has improved. ${value}`);
    expect(statusOf(h)).toContain('skill=948');
    expect(getTrackedSkillLevel('testchar', 'spellcrafting')).toBe(948);
  });
});

// ── SEC-3 ───────────────────────────────────────────────────────────────

describe('SEC-3: copyover recraft is whole-line only and bounded', () => {
  const craftCmd = "craft spellcraft 'diamond gemstone'";

  it('a real copyover line resends the craft exactly once', () => {
    const h = boot();
    reachCrafting(h);
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.copyover);

    expect(h.mock.sent.slice(before)).toEqual([craftCmd]);
  });

  it('a repeated copyover line within the same craft attempt does not resend again', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(SYS.copyover);
    const afterFirst = h.mock.sent.length;

    h.mock.feedLine(SYS.copyover);
    h.mock.feedLine(SYS.copyover);
    jest.advanceTimersByTime(1000);

    expect(h.mock.sent.length).toBe(afterFirst);
  });

  it('a new craft attempt gets its own recraft allowance', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(SYS.copyover);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100); // next attempt: craft sent again
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.copyover);

    expect(h.mock.sent.slice(before)).toEqual([craftCmd]);
  });

  it('a copyover line arriving during the pacing gap does not double-send', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(SYS.noLoss); // pacing timer pending, engine still "crafting"
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.copyover);
    jest.advanceTimersByTime(500);

    expect(h.mock.sent.slice(before)).toEqual([craftCmd]);
  });

  it('goes idle instead of re-crafting if a stop was already requested', () => {
    const h = boot();
    reachCrafting(h);
    alias(h, 'crafthelper improve stop');
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.copyover);
    jest.advanceTimersByTime(1000);

    expect(h.mock.sent.slice(before).filter((c) => c.startsWith('craft'))).toEqual([]);
    expect(statusOf(h)).toContain('state=idle');
  });
});

// ── SAF-1 ───────────────────────────────────────────────────────────────

describe('SAF-1: order input is bounded and auto-start is configurable', () => {
  it.each(['970+', '101', '150', '95-101', '101-120'])('parseQualitySpec rejects the unsatisfiable spec %s', (spec) => {
    expect(parseQualitySpec(spec)).toBeNull();
  });
  it.each(['100', '100+', '97+', '95-100', '0'])('parseQualitySpec still accepts %s', (spec) => {
    expect(parseQualitySpec(spec)).not.toBeNull();
  });

  it.each([['0'], ['501'], ['99999999999999999999']])('rejects order quantity %s', (qty) => {
    const h = boot();
    alias(h, `crafthelper order add ${qty} 'diamond gem pain' 97+`);
    expect(getOrderQueue('testchar')).toHaveLength(0);
    expect(h.mock.sent).toEqual([]);
    expect(h.mock.terminalWrites.at(-1)).toMatch(/quantity/i);
  });

  it('accepts the maximum quantity of 500', () => {
    const h = boot({ autoStartOnOrderAdd: false });
    alias(h, "crafthelper order add 500 'diamond gem pain' 97+");
    expect(getOrderQueue('testchar')[0].quantityTotal).toBe(500);
  });

  it('auto-starts an add on an empty queue by default (author-intended behavior preserved)', () => {
    const h = boot();
    alias(h, "crafthelper order add 1 'diamond gem pain' 97+");
    expect(h.mock.sent[0]).toBe("get 1 'diamond gemstone' vault");
  });

  it('autoStartOnOrderAdd=false queues the order without sending a single command', () => {
    const h = boot({ autoStartOnOrderAdd: false });
    alias(h, "crafthelper order add 1 'diamond gem pain' 97+");
    jest.advanceTimersByTime(5000);
    expect(getOrderQueue('testchar')).toHaveLength(1);
    expect(h.mock.sent).toEqual([]);
  });
});

// ── SAF-2 ───────────────────────────────────────────────────────────────

describe('SAF-2: the engine stops itself instead of looping forever', () => {
  it('stops after maxConsecutiveFailures failed crafts in a row', () => {
    const h = boot({ maxConsecutiveFailures: 3 });
    reachCrafting(h);
    for (let i = 0; i < 3; i++) {
      h.mock.feedLine(SYS.noLoss);
      jest.advanceTimersByTime(100);
    }
    const crafts = h.mock.sent.filter((c) => c.startsWith('craft')).length;
    jest.advanceTimersByTime(2000);

    expect(statusOf(h)).toContain('state=error_stopped');
    expect(h.mock.sent.filter((c) => c.startsWith('craft')).length).toBe(crafts);
    expect(h.mock.terminalWrites.join('\n')).toMatch(/in a row/);
  });

  it('a success resets the consecutive-failure counter', () => {
    const h = boot({ maxConsecutiveFailures: 3 });
    reachCrafting(h);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);
    h.mock.feedLine(SYS.success); // resets
    jest.advanceTimersByTime(100); // pacing → pull
    jest.advanceTimersByTime(200); // pull confirmed → craft
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);

    expect(statusOf(h)).not.toContain('error_stopped');
  });

  it('stops an order that keeps coming out off-spec once it exceeds maxAttemptsPerItem x quantity', () => {
    const h = boot({ maxAttemptsPerItem: 2, maxConsecutiveFailures: 1000 });
    reachOrderCrafting(h, '100'); // exact 100% only
    for (let attempt = 0; attempt < 2; attempt++) {
      h.mock.feedLine(SYS.success);
      h.mock.feedLine('Condition: poor (50%)'); // off spec → routed to vault, re-pull
      h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(200);
      jest.advanceTimersByTime(200);
    }
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: poor (50%)');
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
    jest.advanceTimersByTime(1000);

    expect(statusOf(h)).toContain('state=error_stopped');
    expect(h.mock.terminalWrites.join('\n')).toMatch(/too many attempts/i);
  });

  it('trips a command-rate limit instead of flooding the MUD', () => {
    const h = boot({ maxCommandsPerWindow: 20, maxConsecutiveFailures: 1000 });
    reachCrafting(h);
    for (let i = 0; i < 40; i++) {
      h.mock.feedLine(SYS.noLoss);
      jest.advanceTimersByTime(100);
    }
    expect(statusOf(h)).toContain('state=error_stopped');
    expect(h.mock.terminalWrites.join('\n')).toMatch(/rate limit/i);
    expect(h.mock.sent.length).toBeLessThanOrEqual(22);
  });
});

// ── TMR-1 ───────────────────────────────────────────────────────────────

describe('TMR-1: duplicate outcome lines cannot multiply commands or leak watchdogs', () => {
  const craftCmd = "craft spellcraft 'diamond gemstone'";

  it('two no-loss lines inside one pacing window resend the craft once', () => {
    const h = boot();
    reachCrafting(h);
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.noLoss);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100);

    expect(h.mock.sent.slice(before)).toEqual([craftCmd]);
  });

  it('a leaked craft watchdog cannot abort a healthy later cycle', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(SYS.noLoss);
    h.mock.feedLine(SYS.noLoss);
    jest.advanceTimersByTime(100); // craft re-sent
    h.mock.feedLine(SYS.success); // a real outcome for it
    jest.advanceTimersByTime(100); // put → pacing → next pull
    jest.advanceTimersByTime(200); // pull confirmed → next craft sent, fresh 180 s watchdog armed at ~t+400ms

    // Timeline: leaked watchdog armed at t=300 ms fires at t=180300; the legitimate one armed at t=600
    // fires at t=180600. Stop at t=180450 — between the two.
    jest.advanceTimersByTime(180_000 - 150);
    expect(statusOf(h)).toContain('state=crafting');
    expect(statusOf(h)).not.toContain('error_stopped');
  });

  it('an outcome line arriving during the destroyed put-back chain is ignored', () => {
    const h = boot();
    reachCrafting(h);
    h.mock.feedLine(SYS.destroyed); // put-back chain starts, still "crafting" on the old build
    const before = h.mock.sent.length;

    h.mock.feedLine(SYS.success);
    jest.advanceTimersByTime(100); // put back (1 component)
    jest.advanceTimersByTime(100); // fresh pull
    jest.advanceTimersByTime(200); // pull confirmed → craft

    expect(h.mock.sent.slice(before)).toEqual([
      "put 1 'uncut diamond stone' vault",
      "get 1 'uncut diamond stone' vault",
      craftCmd,
    ]);
  });

  it('a second Condition line inside the pacing window does not credit the order twice', () => {
    const h = boot();
    alias(h, "crafthelper order add 3 'diamond gem pain' 90+");
    jest.advanceTimersByTime(400);
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: flawless (98%)');
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
    h.mock.feedLine('Condition: flawless (98%)'); // duplicate inside the pacing window
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put

    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(2);
    expect(h.mock.sent.filter((c) => c.startsWith('put 1'))).toHaveLength(1);
  });
});

// ── LIF ─────────────────────────────────────────────────────────────────

describe('LIF-1: disabling mid-run resets the engine', () => {
  it('after disable → enable the engine is idle and can start again, and held materials are reported', () => {
    const h = boot();
    alias(h, 'crafthelper improve spellcraft start');
    h.mock.feedLine(SCORE_SPELL_948); // get sent: materialsHeld set
    const sentAtDisable = [...h.mock.sent];

    (h.cleanup as () => void)(); // host disable
    h.plugin.onEnable!(h.mock.api); // host re-enable reuses the same closure
    jest.advanceTimersByTime(300_000);

    expect(h.mock.sent).toEqual(sentAtDisable); // report only: nothing is sent on disable
    expect(h.mock.terminalWrites.join('\n')).toMatch(/still in your inventory/i);
    expect(h.mock.terminalWrites.join('\n')).toContain('uncut diamond stone');

    alias(h, 'crafthelper improve spellcraft start');
    expect(h.mock.terminalWrites.at(-1)).not.toContain('Already running');
    expect(h.mock.sent.at(-1)).toBe('score');
  });
});

describe('LIF-2: a closed connection abandons the run', () => {
  it('no command is sent after remote-server:close, even when the craft watchdog would have fired', () => {
    const h = boot();
    reachCrafting(h);
    const before = [...h.mock.sent];

    h.mock.emit('game:remote-server:close', {});
    jest.advanceTimersByTime(300_000);

    expect(h.mock.sent).toEqual(before);
    expect(statusOf(h)).toContain('state=idle');
  });
});

describe('LIF-3: a run is bound to the character that started it', () => {
  it('stops and writes nothing under another character name when the identity changes mid-run', () => {
    const h = boot();
    reachCrafting(h);
    (window as unknown as { __SA_IDENTITY__?: { characterName?: string } }).__SA_IDENTITY__ = {
      characterName: 'otherchar',
    };

    h.mock.feedLine('Your crafting skill has improved. (949)');
    jest.advanceTimersByTime(1000);

    expect(getTrackedSkillLevel('otherchar', 'spellcrafting')).toBeNull();
    expect(h.mock.terminalWrites.join('\n')).toMatch(/character changed/i);
    expect(statusOf(h)).toContain('state=idle');
  });

  it('a character-login event resets an armed run', () => {
    const h = boot();
    reachCrafting(h);
    const before = [...h.mock.sent];

    h.mock.emit('game:character-login', { name: 'Someone', level: 51 });
    jest.advanceTimersByTime(300_000);

    expect(h.mock.sent).toEqual(before);
    expect(statusOf(h)).toContain('state=idle');
  });
});

// ── DAT ─────────────────────────────────────────────────────────────────

describe('DAT-1: malformed stored entries are dropped on load instead of wedging order mode', () => {
  it.each([
    ['null', null],
    ['an empty object', {}],
    ['a number', 7],
    [
      'an order with no qualitySpec',
      { id: 'x', itemName: 'diamond gem pain', quantityRemaining: 1, quantityTotal: 1, createdAt: 1 },
    ],
    ['a non-numeric quantityRemaining', { ...validOrder('y'), quantityRemaining: 'abc' }],
    ['an unknown spec kind', { ...validOrder('z'), qualitySpec: { kind: 'bogus' } }],
    ['an inverted range', { ...validOrder('w'), qualitySpec: { kind: 'range', min: 99, max: 1 } }],
  ])('drops %s and keeps the valid orders around it', (_label, bad) => {
    window.localStorage.setItem(ORDERS_KEY('testchar'), JSON.stringify([bad, validOrder('good')]));
    const { storage } = freshModules();

    const queue = storage.getOrderQueue('testchar');

    expect(queue.map((o) => o.id)).toEqual(['good']);
  });

  it('a poisoned queue head no longer blocks removal of, or progress on, the valid orders', () => {
    window.localStorage.setItem(ORDERS_KEY('testchar'), JSON.stringify([null, validOrder('good')]));
    const { storage } = freshModules();
    expect(() => storage.removeOrder('testchar', 'good')).not.toThrow();
    expect(storage.getOrderQueue('testchar')).toEqual([]);
  });
});

describe('DAT-2: order progress is persisted immediately, and everything is flushed when the page hides', () => {
  it('addOrder / removeOrder / updateOrder are visible in localStorage without waiting for a timer', () => {
    const { storage } = freshModules();
    storage.addOrder('testchar', validOrder('a'));
    expect(JSON.parse(window.localStorage.getItem(ORDERS_KEY('testchar'))!)).toHaveLength(1);

    storage.updateOrder('testchar', 'a', { quantityRemaining: 1 });
    expect(JSON.parse(window.localStorage.getItem(ORDERS_KEY('testchar'))!)[0].quantityRemaining).toBe(1);

    storage.removeOrder('testchar', 'a');
    expect(JSON.parse(window.localStorage.getItem(ORDERS_KEY('testchar'))!)).toEqual([]);
  });

  it('a pending skill-level write is flushed on pagehide', () => {
    const { storage } = freshModules();
    storage.setTrackedSkillLevel('testchar', 'spellcrafting', 951);
    expect(window.localStorage.getItem('shatteredarchive.plugins.crafting-helper.skillLevels')).toBeNull();

    window.dispatchEvent(new Event('pagehide'));

    expect(window.localStorage.getItem('shatteredarchive.plugins.crafting-helper.skillLevels')).toContain('951');
  });
});

describe('DAT-4: copies returned by the store are deep', () => {
  it('mutating nested qualitySpec / materialsUsed on a returned order never reaches the store', () => {
    const { storage } = freshModules();
    storage.addOrder('testchar', validOrder('a', { materialsUsed: { stone: 1 } }));

    const first = storage.getOrderQueue('testchar')[0];
    (first.qualitySpec as { min: number }).min = 1;
    first.materialsUsed!.stone = 999;

    const again = storage.getOrderQueue('testchar')[0];
    expect((again.qualitySpec as { min: number }).min).toBe(90);
    expect(again.materialsUsed).toEqual({ stone: 1 });
  });

  it('mutating the object that was passed to addOrder afterwards does not change the store', () => {
    const { storage } = freshModules();
    const order = validOrder('a', { materialsUsed: { stone: 1 } });
    storage.addOrder('testchar', order);

    order.materialsUsed!.stone = 500;
    (order.qualitySpec as { min: number }).min = 1;

    const stored = storage.getOrderQueue('testchar')[0];
    expect(stored.materialsUsed).toEqual({ stone: 1 });
    expect((stored.qualitySpec as { min: number }).min).toBe(90);
  });
});

// ── CFG ─────────────────────────────────────────────────────────────────

describe('CFG-1: timing config is bounded', () => {
  it.each([
    ['0', 0],
    ['an empty string', ''],
    ['null', null],
    ['a value past the setTimeout limit', 3_000_000_000],
    ['NaN text', 'abc'],
    ['a negative value', -5],
  ])('craftResponseTimeoutMs = %s falls back to the 180 s default instead of firing immediately', (_label, value) => {
    const h = boot({ craftResponseTimeoutMs: value });
    reachCrafting(h);
    const before = h.mock.sent.length;

    jest.advanceTimersByTime(60_000);

    expect(statusOf(h)).toContain('state=crafting');
    expect(h.mock.sent.length).toBe(before);
  });

  it('commandPacingDelayMs = 0 falls back to the 150 ms default instead of removing all throttling', () => {
    const h = boot({ commandPacingDelayMs: 0 });
    reachCrafting(h);
    h.mock.feedLine(SYS.noLoss);
    const before = h.mock.sent.length;

    jest.advanceTimersByTime(100);
    expect(h.mock.sent.length).toBe(before); // 0 ms would have resent already
    jest.advanceTimersByTime(60);
    expect(h.mock.sent.length).toBe(before + 1);
  });
});

describe('CFG-2: config strings reaching a command are sanitized and quoted', () => {
  it('a multi-word, apostrophe-bearing order holding container is quoted and stripped', () => {
    const h = boot({ orderHoldingContainer: "Bob's  big pouch" });
    reachOrderCrafting(h);
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: flawless (98%)');
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
    expect(h.mock.sent.at(-1)).toBe("put 1 'diamond gem pain' 'Bobs big pouch'");
  });

  it('a quality-map container with a space is quoted; a single word stays bare (existing format)', () => {
    const h = boot({ qualityContainerMap: '90-100 | my chest' });
    reachOrderCrafting(h);
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: flawless (98%)');
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
    expect(h.mock.sent.at(-1)).toBe("put 1 'diamond gem pain' 'my chest'");
  });

  it('control characters in config never reach a command', () => {
    const h = boot({ orderHoldingContainer: 'vault\rquit' });
    reachOrderCrafting(h);
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: flawless (98%)');
    h.mock.feedLine('You put a thing in the mystic vault.'); // the server confirms the put
    for (const cmd of h.mock.sent) expect(cmd).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(h.mock.sent.at(-1)).toBe("put 1 'diamond gem pain' vaultquit");
  });
});

// ── COR-1 ───────────────────────────────────────────────────────────────

describe('COR-1: a late vault-failure line is not pinned on the wrong component', () => {
  const SHARP_962 = 'Craftskill: 962    Craft Rank: Master Weaponsmith (Sharp)';

  it('names every candidate and puts back everything sent when no success line was seen', () => {
    const h = boot();
    alias(h, 'crafthelper improve sharpweapon start');
    h.mock.feedLine(SHARP_962);
    jest.advanceTimersByTime(200); // first get assumed OK (no reply seen), second get sent
    expect(h.mock.sent.at(-1)).toBe("get 2 'ironwood board' vault");

    h.mock.feedLine(SYS.vaultFailure); // could be the late reply to the FIRST get
    jest.advanceTimersByTime(1000);

    const message = h.mock.terminalWrites.join('\n');
    expect(message).toContain('netherium bar');
    expect(message).toContain('ironwood board');
    expect(h.mock.sent).toContain("put 2 'netherium bar' vault");
    expect(h.mock.sent).toContain("put 2 'ironwood board' vault");
  });

  it('blames exactly the second component when the first pull was confirmed by its success line', () => {
    const h = boot();
    alias(h, 'crafthelper improve sharpweapon start');
    h.mock.feedLine(SHARP_962);
    h.mock.feedLine('You get a netherium bar from the mystic vault.'); // corpus shape of a successful pull
    jest.advanceTimersByTime(200); // second get sent
    h.mock.feedLine(SYS.vaultFailure);
    jest.advanceTimersByTime(1000);

    const errors = h.mock.terminalWrites.filter((w) => w.includes('Vault is out of'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ironwood board');
    expect(errors[0]).not.toContain('netherium bar');
    expect(h.mock.sent).toContain("put 2 'netherium bar' vault");
  });
});

// ── CFG-2b ──────────────────────────────────────────────────────────────

describe('CFG-2b: an order item is credited only after the server confirms the put', () => {
  const toLore = (h: Harness) => {
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: flawless (98%)');
  };

  it('does not credit the order before the put reply arrives', () => {
    const h = boot();
    reachOrderCrafting(h);
    toLore(h);
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);
    h.mock.feedLine(SYS.putOk);
    expect(getOrderQueue('testchar')).toHaveLength(0);
  });

  it('stops without crediting when the server says the item is not held', () => {
    const h = boot();
    reachOrderCrafting(h);
    toLore(h);
    h.mock.feedLine(SYS.putRefused);
    jest.advanceTimersByTime(60_000);
    expect(statusOf(h)).toContain('state=error_stopped');
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);
    expect(h.mock.terminalWrites.join('\n')).toMatch(/refused to store/);
  });

  it('stops without crediting when no reply arrives, and sends nothing more', () => {
    const h = boot();
    reachOrderCrafting(h);
    toLore(h);
    const before = h.mock.sent.length;
    jest.advanceTimersByTime(2000);
    expect(statusOf(h)).toContain('state=error_stopped');
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);
    expect(h.mock.terminalWrites.join('\n')).toMatch(/No confirmation/);
    jest.advanceTimersByTime(60_000);
    expect(h.mock.sent.length).toBe(before);
  });

  it('a put reply in chat does not count, and a late reply after the timeout is ignored', () => {
    const h = boot();
    reachOrderCrafting(h);
    toLore(h);
    h.mock.feedLine('Bob says, "You put a diamond gem pain in the mystic vault."');
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);
    jest.advanceTimersByTime(2000);
    h.mock.feedLine(SYS.putOk);
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(1);
  });

  it('a second put reply does not credit the next item', () => {
    const h = boot();
    alias(h, "crafthelper order add 3 'diamond gem pain' 90+");
    jest.advanceTimersByTime(400);
    toLore(h);
    h.mock.feedLine(SYS.putOk);
    h.mock.feedLine(SYS.putOk);
    expect(getOrderQueue('testchar')[0].quantityRemaining).toBe(2);
  });

  it('an off-spec item that the server refuses also stops the run', () => {
    const h = boot();
    reachOrderCrafting(h, '97+');
    h.mock.feedLine(SYS.success);
    h.mock.feedLine('Condition: poor (50%)');
    h.mock.feedLine(SYS.putRefused);
    expect(statusOf(h)).toContain('state=error_stopped');
  });
});
