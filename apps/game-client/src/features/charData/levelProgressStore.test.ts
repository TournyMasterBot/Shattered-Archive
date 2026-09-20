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
