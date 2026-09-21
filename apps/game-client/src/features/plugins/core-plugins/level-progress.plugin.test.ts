import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';
import { __resetForTests as resetLevelProgressStore } from '../../charData/levelProgressStore';
import { computeExpPerLevel, createLevelProgressPlugin, parseWorth } from './level-progress.plugin';

const STORAGE_KEY = 'shatteredarchive:exp-per-level:v1';
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
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ Tester: 13000 });
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

  it('never asks again once the character has a stored value — it just announces it', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ Tester: 13000 }));
    const t = start();

    login();
    charData(4444);
    charData(4300);

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
    expect(t.sendCommand).not.toHaveBeenCalled();
    expect(t.hasRawListener()).toBe(false);
  });

  it('picks up a stored value when enabled mid-session (login already happened)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ Tester: 13000 }));
    (window as any).__SA_EVENT_SNAPSHOTS__ = { 'game:character-login': { name: 'Tester', level: 49 } };

    const t = start();

    expect(t.announced).toEqual([{ name: 'Tester', expPerLevel: 13000 }]);
  });

  it('attempts at most one automatic fetch per session, even if it failed', () => {
    const t = start();
    login();
    charData(4444);
    jest.advanceTimersByTime(10_000); // no reply
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

    jest.advanceTimersByTime(10_000);

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

  it('Re-fetch before login does nothing but say why', () => {
    const t = start();
    t.actions.get('refetch')!();

    expect(t.sendCommand).not.toHaveBeenCalled();
    expect(t.hasRawListener()).toBe(false);
    expect(t.log).toHaveBeenCalledTimes(1);
  });

  it('refetches once if the stored value looks stale (tnl larger than a whole level)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ Tester: 13000 }));
    const t = start();
    login();

    charData(4444);
    expect(t.sendCommand).not.toHaveBeenCalled();

    charData(20000); // impossible with 13000 per level -> the stored value is wrong
    expect(t.sendCommand).toHaveBeenCalledTimes(1);

    charData(21000); // shares the once-per-session budget
    expect(t.sendCommand).toHaveBeenCalledTimes(1);
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

  it('declares one setting (auto-fetch, on by default) and the Re-fetch action', () => {
    const { plugin } = start();
    expect(plugin.configSchema!.defaults).toEqual({ autoFetch: true });
    expect(plugin.configSchema!.fields.map((f) => f.key)).toEqual(['autoFetch']);
    expect(plugin.configSchema!.actions!.map((a) => a.key)).toEqual(['refetch']);
  });
});
