import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';

// Module-level singleton state (peopleDb's `db` Map) means each test needs a
// fresh module instance — jest.resetModules() + re-require, matching
// peopleDb.test.ts's own convention. Re-requiring people.plugin pulls in a
// fresh peopleDb too, since it imports from it at module load time.
function freshPeoplePlugin() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require('./people.plugin') as typeof import('./people.plugin');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('./peopleDb') as typeof import('./peopleDb');
  return { ...plugin, ...db };
}

const RAW = 'shatteredarchive:raw-data';
const raw = (rawText: string) => DispatchEvent(RAW, { rawText });

// Real captures, GameLog-DSL_2026-09-24 (server.log-2026-09-24.jsonl, the
// `who` reply following the player's own `who` input at 13:37:20) — each
// player arrived as its OWN separate raw-data event, not one batched chunk,
// which is exactly why the arm window can't disarm on the first match.
const CLAN_LINE = '\x1b[0m[49  Yinn  Cru] [ \x1b[0;31mBloodlust\x1b[0m ] Vyraek Atazra \x1b[0m \x1b[0m\r\n';
const KINGDOM_LINE = "\x1b[0m[25  Yinn  Shu] \x1b[1;36m(\x1b[0;36mAR\x1b[1;36m)\x1b[0m Vyar Dra'vex \x1b[0m\r\n";
const ORDINARY_LINE = 'You swing your sword at the orc.\n';

function setup() {
  const { createPeoplePlugin, getPerson } = freshPeoplePlugin();
  const active = new Map<string, () => void>();
  const writeTerminal = jest.fn();
  const log = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'people',
    log,
    error: jest.fn(),
    writeTerminal,
    getConfig: () => ({ debug: false }),
    onEvent: (name: string, handler: (payload: unknown) => void) => {
      active.get(name)?.();
      const dispose = ListenEvent<any>(name, handler, { key: `people.test::${name}` });
      active.set(name, dispose);
      return () => {
        dispose();
        if (active.get(name) === dispose) active.delete(name);
      };
    },
  } as unknown as PluginRuntimeApi;

  const plugin = createPeoplePlugin();
  const cleanup = plugin.onEnable!(api) as () => void;

  return {
    plugin,
    api,
    getPerson,
    writeTerminal,
    log,
    arm: (input: string) => plugin.onAlias!(api, input),
    listenerCount: () => active.size,
    dispose: () => cleanup(),
  };
}

describe('people plugin — who-family arming', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    current?.dispose();
    current = null;
    jest.useRealTimers();
  });

  const start = () => (current = setup());

  it('does not scan a who-list line without a prior who-family input', () => {
    const t = start();
    raw(CLAN_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it.each(['who', 'whoc', 'whoc shad', 'whok', 'whok ve', 'whocraft', 'whocraft armor', 'whois', 'whois tib', 'whoisd', 'whoisic', 'whoic', 'whos', 'whosi', 'whov', 'whoami'])(
    'arms on %j',
    (input) => {
      const t = start();
      t.arm(input);
      raw(CLAN_LINE);

      expect(t.getPerson('Vyraek')).not.toBeNull();
    },
  );

  it.each(['look', 'north', 'score', 'sc', 'worth', 'somewho'])('does NOT arm on unrelated input %j', (input) => {
    const t = start();
    t.arm(input);
    raw(CLAN_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('never consumes a who-family command — the real command must still reach the server', () => {
    const t = start();
    expect(t.arm('who')).not.toBe(true);
    expect(t.arm('whoc shad')).not.toBe(true);
  });

  it('captures multiple separate raw-data events within one armed window, no re-arming needed', () => {
    // The real reply is many single-line events, not one batched chunk.
    const t = start();
    t.arm('who');
    raw(CLAN_LINE);
    raw(KINGDOM_LINE);

    expect(t.getPerson('Vyraek')).not.toBeNull();
    expect(t.getPerson('Vyar')).not.toBeNull();
  });

  it('does not disarm after the first match — unlike the score-sheet scan, a who reply spans many chunks', () => {
    const t = start();
    t.arm('who');
    raw(CLAN_LINE); // first chunk matches and would disarm a score-style one-shot
    raw(KINGDOM_LINE); // still captured because the window is still open

    expect(t.getPerson('Vyar')).not.toBeNull();
  });

  it('expires after the arm window: a who-list line arriving late is not scanned', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(5_000);

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('a later who-family input re-arms after expiry', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(5_000);
    t.arm('whoc');

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).not.toBeNull();
  });

  it('a fresh who input while already armed restarts the window rather than shortening it', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(4_000);
    t.arm('who'); // restarts the 5s window
    jest.advanceTimersByTime(4_000); // 8s since the first arm, but only 4s since the restart

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).not.toBeNull();
  });

  it('ignores ordinary game output even while armed', () => {
    const t = start();
    t.arm('who');
    raw(ORDINARY_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('cleanup disarms and removes the listener — a pending window does not scan after disable', () => {
    const t = start();
    t.arm('who');
    expect(t.listenerCount()).toBe(1);

    t.dispose();
    current = null; // already disposed, don't double-dispose in afterEach
    jest.advanceTimersByTime(10_000);

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).toBeNull();
    expect(t.listenerCount()).toBe(0);
  });

  it('existing command-bar behavior (show info) still works alongside arming', () => {
    const t = start();
    t.arm('who');
    raw(CLAN_LINE);

    t.arm('show info vyraek');
    expect(t.writeTerminal).toHaveBeenCalledWith(expect.stringContaining('Vyraek'));
  });
});
