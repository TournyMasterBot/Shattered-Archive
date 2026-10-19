import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';
import { __resetForTests as resetLevelProgressStore } from '../../charData/levelProgressStore';
import { computeExpPerLevel, createLevelProgressPlugin, parseWorth } from './level-progress.plugin';

const STORAGE_KEY = 'shatteredarchive:exp-per-level:v2';
const RAW = 'shatteredarchive:raw-data';

// Verbatim `worth` output captured from a live character (prompt lines included —
// the game sends them in the same chunk).
const WORTH_OUTPUT = [
  '<957/957hp 261/261m 250/250mv 4444 tnl> |11:00pm| [WU] ',
  '> worth',
  '',
  'Your current worth: ',
  'Eggs (bank)  : 29',
  'Gold         : 1174',
  'Silver       : 49',
  'Quest Points : 1274',
  'Exp Total    : 645556',
  'Exp to Level : 4444',
  '',
  '<957/957hp 261/261m 250/250mv 4444 tnl> |11:00pm| [WU] ',
].join('\r\n');

// `level: null` means login_data carried no level at all (an undefined argument would
// just trigger the default).
const login = (name = 'Tester', level: number | null = 49) =>
  DispatchEvent('game:character-login', level === null ? { name } : { name, level });
const charData = (tnl: number) => DispatchEvent('game:char-data', { hp: 1, max_hp: 1, tnl });
const raw = (rawText: string) => DispatchEvent(RAW, { rawText });
// Mirrors world-time-and-identity.plugin.ts's setIdentitySnapshot payload shape —
// only the field this plugin reads matters for these tests.
const identityUpdated = (className: string) => DispatchEvent('shatteredarchive:identity-updated', { className });
// Mirrors world-time-and-identity.plugin.ts's scanForScoreSheetExp payload.
const scoreSheetExp = (characterName: string | null, level: number, xp: number, xpToLevel: number) =>
  DispatchEvent('shatteredarchive:score-sheet-exp', { characterName, level, xp, xpToLevel });

// Real capture, GameLog-DSL_2023-05-08-Mon.txt: TestChar's score sheet the day
// after a reclass to Ranger. computeExpPerLevel(25, 25153728, 846272) === 1_000_000.
const TEST_CHAR_LEVEL = 25;
const TEST_CHAR_XP = 25153728;
const TEST_CHAR_XP_TO_LEVEL = 846272;
const TEST_CHAR_EXP_PER_LEVEL = 1_000_000;

const seed = (name: string, expPerLevel: number, level: number, className: string | null = null) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ [name]: { expPerLevel, level, className } }));

/**
 * Fake host on top of the REAL event dispatcher (so the plugin and the real
 * levelProgressStore see the same events they do in the client). `onEvent`
 * mirrors the host's contract: one subscription per event name, disposable —
 * `active` lets tests assert exactly which listeners exist at any moment.
 */
function setup(config: Record<string, unknown> = {}) {
  const active = new Map<string, () => void>();
  const actions = new Map<string, () => void>();
  const cfg: Record<string, unknown> = { autoFetch: true, ...config };
  const sendCommand = jest.fn();
  const log = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'level-progress',
    sendCommand,
    log,
    error: jest.fn(),
    getConfig: () => ({ ...cfg }),
    registerAction: (key: string, handler: () => void) => actions.set(key, handler),
    onEvent: (name: string, handler: (payload: unknown) => void) => {
      active.get(name)?.();
      const dispose = ListenEvent<any>(name, handler, { key: `level-progress.test::${name}` });
      active.set(name, dispose);
      return () => {
        dispose();
        if (active.get(name) === dispose) active.delete(name);
      };
    },
  } as unknown as PluginRuntimeApi;

  const announced: Array<{ name: string; expPerLevel: number | null }> = [];
  const offAnnounced = ListenEvent<any>('shatteredarchive:exp-per-level', (p) => announced.push(p), {
    key: 'level-progress.test::announced',
  });

  const plugin = createLevelProgressPlugin();
  const cleanup = plugin.onEnable!(api) as () => void;

  return {
    plugin,
    cfg,
    sendCommand,
    log,
    announced,
    actions,
    cleanup,
    hasRawListener: () => active.has(RAW),
    listenerCount: () => active.size,
    dispose: () => {
      cleanup();
      offAnnounced();
    },
  };
}

describe('parseWorth', () => {
  it('reads total exp and exp-to-level from a real worth block', () => {
    expect(parseWorth(WORTH_OUTPUT)).toEqual({ expTotal: 645556, tnl: 4444 });
  });

  it('tolerates thousands separators', () => {
    expect(parseWorth('Exp Total    : 645,556\nExp to Level : 4,444')).toEqual({ expTotal: 645556, tnl: 4444 });
  });

  it('returns only what a partial chunk contains', () => {
    expect(parseWorth('Exp Total    : 645556')).toEqual({ expTotal: 645556 });
    expect(parseWorth('Exp to Level : 4444')).toEqual({ tnl: 4444 });
  });

  it('ignores unrelated text, including other worth lines', () => {
    expect(parseWorth('Gold         : 1174\nQuest Points : 1274\nYou hit the orc.')).toEqual({});
  });
});

describe('computeExpPerLevel', () => {
  it('derives the per-level amount: (exp total + exp to level) / (level + 1)', () => {
    // 645556 + 4444 = 650000 = 50 * 13000 — a clean number, as the linear model predicts.
    expect(computeExpPerLevel(49, 645556, 4444)).toBe(13000);
  });

  it('refuses a result that is not a whole number (the model does not fit this level/exp)', () => {
    expect(computeExpPerLevel(48, 645556, 4444)).toBeNull(); // 650000 / 49
  });

  it('refuses nonsense inputs', () => {
    expect(computeExpPerLevel(0, 645556, 4444)).toBeNull();
    expect(computeExpPerLevel(NaN, 645556, 4444)).toBeNull();
    expect(computeExpPerLevel(49, -1, 4444)).toBeNull();
    expect(computeExpPerLevel(49, 645556, 0)).toBeNull();
  });
});

describe('level-progress plugin', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    delete (window as any).__SA_EVENT_SNAPSHOTS__;
    delete (window as any).__SA_IDENTITY__;
    resetLevelProgressStore();
  });

  afterEach(() => {
    current?.dispose();
    current = null;
    resetLevelProgressStore();
    jest.useRealTimers();
  });

  const start = (config?: Record<string, unknown>) => (current = setup(config));

  it('has no text listener at all until it sends worth (no always-on matching)', () => {
    const t = start();
    expect(t.hasRawListener()).toBe(false);

    login();
    charData(4444);
    expect(t.hasRawListener()).toBe(true); // armed by the fetch it just sent
  });

  it('fetches once: sends worth, captures the reply, stores it, announces it, then drops the listener', () => {
    const t = start();
    login();
    charData(4444);

    expect(t.sendCommand).toHaveBeenCalledTimes(1);
    expect(t.sendCommand).toHaveBeenCalledWith('worth');

    raw(WORTH_OUTPUT);

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      Tester: { expPerLevel: 13000, level: 49, className: null },
    });
    expect(t.hasRawListener()).toBe(false);

    // Worth-looking text after the capture is ignored: nothing is listening.
    raw(WORTH_OUTPUT);
    expect(t.announced).toHaveLength(1);
  });

  it('captures a reply that arrives split across chunks, with ANSI color and commas', () => {
    const t = start();
    login();
    charData(4444);

    raw('\x1b[1;33mExp Total    : 645,556\x1b[0m\r\n');
    expect(t.hasRawListener()).toBe(true); // still waiting for the second half

    raw('Exp to Level : 4,444\r\n');
    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
    expect(t.hasRawListener()).toBe(false);
  });

  it('never asks again once the character has a trusted stored value — it just announces it', () => {
    seed('Tester', 13000, 49);
    const t = start();

    login();
    charData(4444);
    charData(4300);

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
    expect(t.sendCommand).not.toHaveBeenCalled();
    expect(t.hasRawListener()).toBe(false);
  });

  it('picks up a stored value when enabled mid-session (login already happened)', () => {
    seed('Tester', 13000, 49);
    (window as any).__SA_EVENT_SNAPSHOTS__ = { 'game:character-login': { name: 'Tester', level: 49 } };

    const t = start();

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
  });

  it('attempts at most one automatic fetch per session, even if it failed', () => {
    const t = start();
    login();
    charData(4444);
    jest.advanceTimersByTime(20_000); // no reply
    expect(t.sendCommand).toHaveBeenCalledTimes(1);

    charData(4400);
    charData(4300);
    expect(t.sendCommand).toHaveBeenCalledTimes(1);

    // A new session (connection closed, logged in again) gets its own attempt.
    DispatchEvent('game:remote-server:close', {});
    login();
    charData(4444);
    expect(t.sendCommand).toHaveBeenCalledTimes(2);
  });

  it('gives up quietly if worth never answers: listener removed, one log line, nothing stored', () => {
    const t = start();
    login();
    charData(4444);

    jest.advanceTimersByTime(20_000);

    expect(t.hasRawListener()).toBe(false);
    expect(t.log).toHaveBeenCalledTimes(1);
    expect(t.announced).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not store a value the model does not fit (non-whole-number result)', () => {
    const t = start();
    login('Tester', 48); // 650000 / 49 is not a whole number
    charData(4444);
    raw(WORTH_OUTPUT);

    expect(t.announced).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(t.hasRawListener()).toBe(false);
    expect(t.log).toHaveBeenCalledTimes(1);
  });

  it('does not fetch at max level, or before the level is known', () => {
    const t = start();

    login('Tester', 51);
    charData(4444);
    expect(t.sendCommand).not.toHaveBeenCalled();

    DispatchEvent('game:remote-server:close', {});
    login('Newbie', null); // a different character whose login_data carries no level
    charData(4444);
    expect(t.sendCommand).not.toHaveBeenCalled();

    login('Newbie', 49); // level arrives later
    charData(4444);
    expect(t.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('Check score sends `score` directly, regardless of identity/config state', () => {
    // This plugin can't detect whether World Time & Identity is enabled to
    // actually capture the reply — it just sends, unconditionally, same as
    // the source comment says.
    const t = start({ autoFetch: false });

    t.actions.get('check-score')!();

    expect(t.sendCommand).toHaveBeenCalledWith('score');
  });

  it('autoFetch off: never sends on its own, but the Re-fetch action still works', () => {
    const t = start({ autoFetch: false });
    login();
    charData(4444);
    expect(t.sendCommand).not.toHaveBeenCalled();

    t.actions.get('refetch')!();
    expect(t.sendCommand).toHaveBeenCalledWith('worth');
    raw(WORTH_OUTPUT);
    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
  });

  it('Re-fetch before login still fires worth — deliberately no upfront restriction', () => {
    // The user may be pressing this specifically to try to reconcile who
    // they are; blocking it with "log in first" is unhelpful right when
    // they're trying to fix that (see the source comment on this action).
    const t = start();
    t.actions.get('refetch')!();

    expect(t.sendCommand).toHaveBeenCalledWith('worth');
    expect(t.hasRawListener()).toBe(true);
  });

  it("a worth reply before identity is known can't be attributed, and says so rather than crashing or silently dropping it", () => {
    const t = start();
    t.actions.get('refetch')!();
    raw(WORTH_OUTPUT);

    expect(t.announced).toEqual([]);
    expect(t.log).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire while a stale-triggered refetch is already in flight', () => {
    seed('Tester', 13000, 49);
    const t = start();
    login();

    charData(4444);
    expect(t.sendCommand).not.toHaveBeenCalled();

    charData(20000); // impossible with 13000 per level -> distrusted, refetch sent
    expect(t.sendCommand).toHaveBeenCalledTimes(1);

    charData(21000); // still the SAME in-flight fetch (armed guard), not a new attempt
    expect(t.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('a resolved stale-triggered refetch can be followed by another once the NEW value is also contradicted', () => {
    // This is the actual fix: earlier this plugin capped auto-fetches to one
    // per session forever, so a real mid-session retrain (DSL allows retrain
    // live at a trainer, no relogin needed) after the first correction would
    // never get picked up.
    seed('Tester', 5000, 49);
    const t = start();
    login();

    charData(20000); // contradicts 5000 -> refetch #1
    expect(t.sendCommand).toHaveBeenCalledTimes(1);

    raw(WORTH_OUTPUT); // resolves to the real 13000
    expect(t.announced.at(-1)).toEqual({ name: 'Tester', expPerLevel: 13000 });

    charData(50000); // contradicts the NEW 13000 too -> refetch #2 is allowed
    expect(t.sendCommand).toHaveBeenCalledTimes(2);
  });

  it('drops a stored value and refetches when login reports a level below where it was confirmed', () => {
    seed('Tester', 13000, 50, 'Warrior');
    const t = start();

    login('Tester', 45); // below the level 50 it was confirmed at — retrain?
    charData(4444);

    expect(t.announced[0]).toEqual({ name: 'Tester', expPerLevel: null }); // distrusted before ever announcing 13000
    expect(t.sendCommand).toHaveBeenCalledTimes(1); // the one-shot budget was handed back
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining('level 45 is below the 50'));
  });

  it('keeps a stored value across login when the level is at or above where it was confirmed', () => {
    seed('Tester', 13000, 49, 'Warrior');
    const t = start();

    login('Tester', 49); // exactly the confirmed level
    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);

    DispatchEvent('game:remote-server:close', {});
    login('Tester', 51); // higher — ordinary continued play, not a retrain
    expect(t.announced.at(-1)).toEqual({ name: 'Tester', expPerLevel: 13000 });
    expect(t.sendCommand).not.toHaveBeenCalled();
  });

  it('drops a stored value and refetches when the score sheet reports a different class', () => {
    seed('Tester', 13000, 49, 'Warrior');
    const t = start();
    login('Tester', 49);
    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);

    identityUpdated('Cleric'); // reclass — no GMCP field for this, only the score-sheet scan

    expect(t.announced.at(-1)).toEqual({ name: 'Tester', expPerLevel: null });
    expect(t.sendCommand).toHaveBeenCalledTimes(1);
    expect(t.log).toHaveBeenCalledWith(expect.stringContaining('class is now Cleric, was Warrior'));
  });

  it('keeps a stored value when the score sheet reports the SAME class', () => {
    seed('Tester', 13000, 49, 'Warrior');
    const t = start();
    login('Tester', 49);

    identityUpdated('Warrior');

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
    expect(t.sendCommand).not.toHaveBeenCalled();
  });

  it("a new login clears the previous character's class before class is known again", () => {
    // Guards against comparing a freshly-logged-in character's stored class
    // against the PREVIOUS character's leftover className.
    seed('First', 13000, 49, 'Warrior');
    seed('Second', 13000, 49, 'Warrior');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        First: { expPerLevel: 13000, level: 49, className: 'Warrior' },
        Second: { expPerLevel: 13000, level: 49, className: 'Warrior' },
      }),
    );
    const t = start();

    login('First', 49);
    identityUpdated('Warrior'); // First is confirmed a Warrior, matches stored
    expect(t.sendCommand).not.toHaveBeenCalled();

    DispatchEvent('game:remote-server:close', {});
    login('Second', 49); // also stored as Warrior, but class isn't re-confirmed yet
    expect(t.announced.at(-1)).toEqual({ name: 'Second', expPerLevel: 13000 }); // no false positive
    expect(t.sendCommand).not.toHaveBeenCalled();
  });

  it('cleanup disarms the fetch, removes every listener, and reverts the gauge to its estimate', () => {
    const t = start();
    login();
    charData(4444);
    expect(t.hasRawListener()).toBe(true);
    t.announced.length = 0;

    t.cleanup();
    jest.advanceTimersByTime(60_000);

    expect(t.listenerCount()).toBe(0);
    expect(t.log).not.toHaveBeenCalled(); // the pending timeout was cancelled
    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: null }]);
  });

  it('a score-sheet-exp confirmation for the current character is stored and announced', () => {
    const t = start();
    login('Tester', TEST_CHAR_LEVEL);

    scoreSheetExp('Tester', TEST_CHAR_LEVEL, TEST_CHAR_XP, TEST_CHAR_XP_TO_LEVEL);

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: TEST_CHAR_EXP_PER_LEVEL }]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      Tester: { expPerLevel: TEST_CHAR_EXP_PER_LEVEL, level: TEST_CHAR_LEVEL, className: null },
    });
  });

  it('ignores a score-sheet-exp confirmation for a different character', () => {
    const t = start();
    login('Tester', TEST_CHAR_LEVEL);

    scoreSheetExp('SomeoneElse', TEST_CHAR_LEVEL, TEST_CHAR_XP, TEST_CHAR_XP_TO_LEVEL);

    expect(t.announced).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('self-heals from a missed login: adopts identity from a score-sheet-exp confirmation when none was ever established', () => {
    // Real numbers, GameLog-DSL_2026-09-26: NewChar, level 1, XP 1,000,000, XP
    // To Level 1,000,000 -> computeExpPerLevel(1, 1_000_000, 1_000_000) ===
    // 1_000_000. No login() call at all here — simulates game:character-login
    // never having fired for this character (GMCP was disabled during a
    // mid-session character switch, confirmed live in that same log).
    const t = start();

    scoreSheetExp('NewChar', 1, 1_000_000, 1_000_000);

    expect(t.announced).toEqual([{ name: 'NewChar', expPerLevel: 1_000_000 }]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      NewChar: { expPerLevel: 1_000_000, level: 1, className: null },
    });
  });

  it('once self-healed, a later confirmation for a genuinely different character is still rejected', () => {
    const t = start();
    scoreSheetExp('NewChar', 1, 1_000_000, 1_000_000);
    t.announced.length = 0;

    scoreSheetExp('SomeoneElse', TEST_CHAR_LEVEL, TEST_CHAR_XP, TEST_CHAR_XP_TO_LEVEL);

    expect(t.announced).toEqual([]);
  });

  it('a score-sheet-exp confirmation cancels an in-flight worth fetch, no timeout log follows', () => {
    const t = start();
    login('Tester', TEST_CHAR_LEVEL);
    charData(4444); // triggers the auto worth fetch (no stored value yet)
    expect(t.hasRawListener()).toBe(true);

    scoreSheetExp('Tester', TEST_CHAR_LEVEL, TEST_CHAR_XP, TEST_CHAR_XP_TO_LEVEL);

    expect(t.hasRawListener()).toBe(false);
    jest.advanceTimersByTime(20_000);
    expect(t.log).not.toHaveBeenCalled(); // the pending timeout was cancelled, not fired
    expect(t.announced.at(-1)).toEqual({ name: 'Tester', expPerLevel: TEST_CHAR_EXP_PER_LEVEL });
  });

  it('a score-sheet-exp confirmation replaces an already-trusted stored value outright', () => {
    // Not a staleness guess like tnl > stored — a full independent
    // re-derivation from the same command, so it always wins.
    seed('Tester', 500_000, 20, null);
    const t = start();
    login('Tester', TEST_CHAR_LEVEL); // level 25 >= stored level 20, stays trusted at first

    scoreSheetExp('Tester', TEST_CHAR_LEVEL, TEST_CHAR_XP, TEST_CHAR_XP_TO_LEVEL);

    expect(t.announced.at(-1)).toEqual({ name: 'Tester', expPerLevel: TEST_CHAR_EXP_PER_LEVEL });
  });

  it('does not store a score-sheet-exp confirmation that does not fit the model', () => {
    const t = start();
    login('Tester', 48); // 650000 / 49 is not a whole number, mirroring the worth test
    scoreSheetExp('Tester', 48, 645556, 4444);

    expect(t.announced).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(t.log).toHaveBeenCalledTimes(1);
  });

  it('declares one setting (auto-fetch, on by default) and both manual actions', () => {
    const { plugin } = start();
    expect(plugin.configSchema!.defaults).toEqual({ autoFetch: true });
    expect(plugin.configSchema!.fields.map((f) => f.key)).toEqual(['autoFetch']);
    expect(plugin.configSchema!.actions!.map((a) => a.key)).toEqual(['refetch', 'check-score']);
  });
});
