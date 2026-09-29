import { DispatchEvent } from '../event-emitter/event-dispatcher';
import {
  MAX_LEVEL,
  __resetForTests,
  computeLevelProgress,
  getLevelProgress,
  subscribeLevelProgress,
} from './levelProgressStore';

const login = (level: number) => DispatchEvent('game:character-login', { name: 'Tester', level });
const charData = (tnl: number) => DispatchEvent('game:char-data', { hp: 1, max_hp: 1, tnl });
const levelUp = () => DispatchEvent('event:level-up', { text: 'You raise a level!!' });

describe('computeLevelProgress', () => {
  it('is hidden without a known level or tnl', () => {
    expect(computeLevelProgress(null, 500, 1000).visible).toBe(false);
    expect(computeLevelProgress(42, null, 1000).visible).toBe(false);
  });

  it('is hidden at the max level no matter what tnl says', () => {
    expect(computeLevelProgress(MAX_LEVEL, 500, 1000).visible).toBe(false);
    expect(MAX_LEVEL).toBe(51);
  });

  it('fills as tnl drops relative to the span', () => {
    expect(computeLevelProgress(42, 1000, 1000).pct).toBe(0);
    expect(computeLevelProgress(42, 750, 1000).pct).toBe(25);
    expect(computeLevelProgress(42, 0, 1000).pct).toBe(100);
  });

  it('clamps to 0..100 and treats an unknown span as empty', () => {
    expect(computeLevelProgress(42, 2000, 1000).pct).toBe(0);
    expect(computeLevelProgress(42, -5, 1000).pct).toBe(100);
    expect(computeLevelProgress(42, 500, 0).pct).toBe(0);
  });
});

describe('levelProgressStore', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    __resetForTests();
    delete (window as any).__SA_EVENT_SNAPSHOTS__;
    unsubscribe = subscribeLevelProgress(() => {});
  });

  afterEach(() => {
    unsubscribe();
    __resetForTests();
  });

  it('is hidden before any GMCP data arrives', () => {
    expect(getLevelProgress().visible).toBe(false);
  });

  it('stays hidden until both level (login_data) and tnl (char_data) are known', () => {
    login(42);
    expect(getLevelProgress().visible).toBe(false);

    charData(1000);
    expect(getLevelProgress().visible).toBe(true);
  });

  it('starts empty and fills as tnl drops (span = highest tnl seen)', () => {
    login(42);
    charData(1000);
    expect(getLevelProgress().pct).toBe(0);

    charData(750);
    expect(getLevelProgress().pct).toBe(25);

    charData(0);
    expect(getLevelProgress().pct).toBe(100);
  });

  it('exposes level and tnl for the tooltip', () => {
    login(42);
    charData(1234);
    expect(getLevelProgress()).toMatchObject({ level: 42, tnl: 1234 });
  });

  it('ignores char_data packets that carry no numeric tnl', () => {
    login(42);
    charData(1000);
    charData(500);

    DispatchEvent('game:char-data', { hp: 1 });
    DispatchEvent('game:char-data', { tnl: 'lots' });

    expect(getLevelProgress()).toMatchObject({ tnl: 500, pct: 50 });
  });

  it('is hidden at level 51', () => {
    login(51);
    charData(1000);
    expect(getLevelProgress().visible).toBe(false);
  });

  it('bumps the level on a level-up and resets the span so the new bar starts empty', () => {
    login(42);
    charData(1000);
    charData(100);
    expect(getLevelProgress().pct).toBe(90);

    levelUp();
    expect(getLevelProgress()).toMatchObject({ level: 43, pct: 0, visible: true });

    charData(1200); // first packet of the new level defines the new span
    expect(getLevelProgress().pct).toBe(0);
    charData(600);
    expect(getLevelProgress().pct).toBe(50);
  });

  it('hides the bar when a level-up reaches the max level', () => {
    login(50);
    charData(1000);
    levelUp();
    expect(getLevelProgress()).toMatchObject({ level: 51, visible: false });
  });

  it('does not invent a level from a level-up when the level was never known', () => {
    charData(1000);
    levelUp();
    expect(getLevelProgress()).toMatchObject({ level: null, visible: false });
  });

  it('a fresh login resets everything (new character / reconnect)', () => {
    login(42);
    charData(1000);
    charData(500);

    login(10);
    expect(getLevelProgress()).toMatchObject({ level: 10, tnl: null, visible: false });

    charData(300);
    expect(getLevelProgress().pct).toBe(0); // span restarted from this packet, not the old 1000
  });

  it('does not reset progress when login_data is re-sent for the same character and level', () => {
    login(42);
    charData(1000);
    charData(500);

    login(42); // a re-send mid-session (or reconnect at the same level) must not zero the bar
    expect(getLevelProgress()).toMatchObject({ level: 42, tnl: 500, pct: 50 });
  });

  it('resyncs level and restarts the span if login_data reports a different level', () => {
    login(42);
    charData(1000);
    charData(500);

    login(44); // e.g. a level-up event was missed
    expect(getLevelProgress()).toMatchObject({ level: 44, tnl: null, visible: false });
  });

  it('seeds the level from the login snapshot when it subscribes late', () => {
    unsubscribe();
    __resetForTests();
    (window as any).__SA_EVENT_SNAPSHOTS__ = { 'game:character-login': { name: 'Tester', level: 30 } };

    unsubscribe = subscribeLevelProgress(() => {});
    charData(800);

    expect(getLevelProgress()).toMatchObject({ level: 30, visible: true });
  });

  it('keeps tracking with no subscribers, so a layout switch does not lose the high-water mark', () => {
    login(42);
    charData(1000);

    unsubscribe(); // e.g. the compact row unmounts during a live theme switch
    charData(250);
    unsubscribe = subscribeLevelProgress(() => {});

    expect(getLevelProgress()).toMatchObject({ tnl: 250, pct: 75 });
  });

  it('notifies subscribers only when the snapshot actually changes', () => {
    const listener = jest.fn();
    const off = subscribeLevelProgress(listener);

    login(42);
    charData(1000);
    const callsAfterSetup = listener.mock.calls.length;

    charData(1000); // identical packet (one arrives every prompt)
    expect(listener.mock.calls.length).toBe(callsAfterSetup);

    charData(900);
    expect(listener.mock.calls.length).toBe(callsAfterSetup + 1);

    off();
  });

  it('returns a stable snapshot reference between changes (useSyncExternalStore requirement)', () => {
    login(42);
    charData(1000);
    const a = getLevelProgress();
    charData(1000);
    expect(getLevelProgress()).toBe(a);
  });
});

describe('levelProgressStore — exact exp-per-level from the level-progress plugin', () => {
  const expPerLevel = (name: string | undefined, value: unknown) =>
    DispatchEvent('shatteredarchive:exp-per-level', { name, expPerLevel: value });

  let unsubscribe: () => void;

  beforeEach(() => {
    __resetForTests();
    delete (window as any).__SA_EVENT_SNAPSHOTS__;
    unsubscribe = subscribeLevelProgress(() => {});
  });

  afterEach(() => {
    unsubscribe();
    __resetForTests();
  });

  it('uses the exact span from the very first packet — a mid-level login no longer starts empty', () => {
    login(49);
    expPerLevel('Tester', 13000);
    charData(4444);

    expect(getLevelProgress().pct).toBeCloseTo(((13000 - 4444) / 13000) * 100, 5);
  });

  it('takes over from the high-water estimate when it arrives late', () => {
    login(49);
    charData(5000);
    expect(getLevelProgress().pct).toBe(0); // estimate: span = the first tnl seen

    expPerLevel('Tester', 13000);
    expect(getLevelProgress().pct).toBeCloseTo(((13000 - 5000) / 13000) * 100, 5);
  });

  it('is order independent: the value can arrive before login_data', () => {
    expPerLevel('Tester', 13000);
    login(49);
    charData(4444);

    expect(getLevelProgress().pct).toBeCloseTo(65.8153846, 4);
  });

  it('ignores a value for a different character', () => {
    login(49);
    expPerLevel('SomeoneElse', 13000);
    charData(5000);

    expect(getLevelProgress().pct).toBe(0); // still the high-water estimate
  });

  it('null clears the exact span and falls back to the estimate', () => {
    login(49);
    expPerLevel('Tester', 13000);
    charData(6500);
    expect(getLevelProgress().pct).toBe(50);

    expPerLevel('Tester', null);
    expect(getLevelProgress().pct).toBe(0); // span is now the highest tnl seen (6500)
  });

  it('rejects junk values instead of using them', () => {
    login(49);
    charData(5000);
    for (const junk of [0, -10, NaN, Infinity, 'lots', undefined]) expPerLevel('Tester', junk);

    expect(getLevelProgress().pct).toBe(0);
  });

  it('keeps the exact span across a level-up (the span is constant per level)', () => {
    login(49);
    expPerLevel('Tester', 13000);
    charData(100);
    levelUp();
    charData(12000);

    expect(getLevelProgress()).toMatchObject({ level: 50 });
    expect(getLevelProgress().pct).toBeCloseTo(((13000 - 12000) / 13000) * 100, 5);
  });

  it('a different character logging in does not inherit the previous exact span', () => {
    login(49);
    expPerLevel('Tester', 13000);

    DispatchEvent('game:character-login', { name: 'Other', level: 30 });
    charData(9000);

    expect(getLevelProgress().pct).toBe(0);
  });
});

describe('levelProgressStore — self-heal from shatteredarchive:score-sheet-exp when login is missed', () => {
  // Real numbers, GameLog-DSL_2026-09-26: a player quit "OldChar" and
  // logged into "NewChar" within the same connection while GMCP happened to
  // be disabled — login_data never fired for NewChar, ever, even after GMCP
  // was re-enabled later. Nothing but a later `sc`/`score` ever tells this
  // store a login happened at all.
  const scoreSheetExp = (characterName: string | undefined, level: number, xpToLevel: number) =>
    DispatchEvent('shatteredarchive:score-sheet-exp', { characterName, level, xp: 0, xpToLevel });

  let unsubscribe: () => void;

  beforeEach(() => {
    __resetForTests();
    delete (window as any).__SA_EVENT_SNAPSHOTS__;
    unsubscribe = subscribeLevelProgress(() => {});
  });

  afterEach(() => {
    unsubscribe();
    __resetForTests();
  });

  it('becomes visible from a score-sheet-exp reading alone — no login_data ever needed', () => {
    // Without this, `visible` would stay false forever (it requires a known
    // level, and level otherwise comes ONLY from game:character-login).
    scoreSheetExp('NewChar', 1, 1_000_000);

    expect(getLevelProgress()).toMatchObject({ visible: true, level: 1, tnl: 1_000_000 });
  });

  it('does not inherit a previous character\'s stale level/span when identity was never established', () => {
    // Simulates login_data having fired for an EARLIER character (OldChar)
    // before the switch — the store must not keep reporting that state once
    // a score sheet reveals a different character is now connected.
    login(51);
    charData(24872);
    expect(getLevelProgress()).toMatchObject({ level: 51 });

    scoreSheetExp('NewChar', 1, 1_000_000);

    expect(getLevelProgress()).toMatchObject({ level: 1, tnl: 1_000_000, pct: 0 });
  });

  it('a later level learned this way seeds the new span immediately, not just on the next char_data tick', () => {
    scoreSheetExp('NewChar', 1, 1_000_000);
    charData(500_000); // halfway through level 1

    scoreSheetExp('NewChar', 2, 2_000_000); // leveled up; the real new span is right here

    expect(getLevelProgress()).toMatchObject({ level: 2, tnl: 2_000_000, pct: 0 });
  });

  it('does nothing when the character and level both already match', () => {
    login(49);
    charData(5000);
    const before = getLevelProgress();

    scoreSheetExp('Tester', 49, 5000);

    expect(getLevelProgress()).toBe(before); // same object — publish() never re-ran
  });

  it('ignores a reading with no usable name or level', () => {
    scoreSheetExp(undefined, 1, 1_000_000);
    expect(getLevelProgress().visible).toBe(false);
  });
});
