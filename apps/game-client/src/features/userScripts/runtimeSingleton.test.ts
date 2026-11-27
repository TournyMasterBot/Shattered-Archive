/**
 * apps/game-client/src/features/userScripts/runtimeSingleton.test.ts
 */

type RedispatchCall = {
  sourceEvent: string;
  destEvent: string;
  mapper: (detail: any) => any;
  options?: { key?: string };
};

type ListenEventCall = {
  name: string;
  handler: (payload: any) => void;
  options?: { key?: string };
};

type ListenDomEventCall = {
  name: string;
  handler: (ev: any) => void;
  options?: { key?: string };
};

const redispatchCalls: RedispatchCall[] = [];
const listenEventCalls: ListenEventCall[] = [];
const listenDomEventCalls: ListenDomEventCall[] = [];

// ---- Mocks ----

// accessibility store mock
jest.mock('../accessibility/accessibility-settings-store', () => {
  return {
    getAccessibilitySettings: () => ({
      commandSplitChar: ';',
    }),
  };
});

// chat store mock (prevents side effects and noisy imports)
jest.mock('../chat/chat-store', () => ({
  appendChatRaw: jest.fn(),
}));

// UserScriptRuntime mock fns
const clearMock = jest.fn();
const loadScriptsFromStorageMock = jest.fn();
const upsertScriptMock = jest.fn();
const getStorageKeyMock = jest.fn();
const setAliasSplitCharMock = jest.fn();
const setActiveConnectionIdMock = jest.fn();
const replaceAllScriptsMock = jest.fn();

const rebuildTriggerListenersMock = jest.fn();
const rebuildAliasIndexMock = jest.fn();
const rebuildTimersMock = jest.fn();
const tickTimersMock = jest.fn();
const setAfkModeMock = jest.fn();
const getAllScriptsMock = jest.fn((): unknown[] => []);

// the session gate is driven by hand here; its own rules are in sessionGate.test.ts
let sessionState = 'down';
const sessionListeners: Array<(change: { state: string; previous: string; dropped: number }) => void> = [];
const startSessionGateMock = jest.fn(() => () => {});

jest.mock('../connection/sessionGate', () => ({
  startSessionGate: () => startSessionGateMock(),
  getSessionState: () => sessionState,
  subscribeSession: (listener: (change: { state: string; previous: string; dropped: number }) => void) => {
    sessionListeners.push(listener);
    return () => {};
  },
}));

jest.mock('./userScriptRuntime', () => {
  return {
    STORAGE_KEY_PREFIX_USERSCRIPTS: 'userscripts:',
    UserScriptRuntime: jest.fn().mockImplementation(() => {
      return {
        clear: clearMock,
        loadScriptsFromStorage: loadScriptsFromStorageMock,
        replaceAllScripts: replaceAllScriptsMock,
        upsertScript: upsertScriptMock,
        getStorageKey: getStorageKeyMock,
        setAliasSplitChar: setAliasSplitCharMock,
        setActiveConnectionId: setActiveConnectionIdMock,

        rebuildTriggerListeners: rebuildTriggerListenersMock,
        rebuildAliasIndex: rebuildAliasIndexMock,
        rebuildTimers: rebuildTimersMock,
        tickTimers: tickTimersMock,
        setAfkMode: setAfkModeMock,
        getAllScripts: getAllScriptsMock,
      };
    }),
  };
});

jest.mock('./globalScriptsStore', () => ({
  getGlobalVarsSnapshot: jest.fn(),
}));

// event dispatcher mock
jest.mock('../event-emitter/event-dispatcher', () => {
  return {
    ListenRedispatchMap: jest.fn((sourceEvent: string, destEvent: string, mapper: any, options?: { key?: string }) => {
      redispatchCalls.push({ sourceEvent, destEvent, mapper, options });
      return () => {};
    }),

    ListenEvent: jest.fn((name: string, handler: (payload: any) => void, options?: { key?: string }) => {
      listenEventCalls.push({ name, handler, options });
      return () => {};
    }),

    ListenDomEvent: jest.fn((name: string, handler: (ev: any) => void, options?: { key?: string }) => {
      listenDomEventCalls.push({ name, handler, options });
      return () => {};
    }),

    // in case runtimeSingleton imports these too
    ListenRedispatch: jest.fn(() => () => {}),
    DispatchEvent: jest.fn(),
  };
});

describe('RuntimeSingleton', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // reset window globals that survive resetModules()
    delete (window as any).__SA_USERSCRIPTS_TIMER_TICK__;
    delete (window as any).__SA_RUNTIME__;

    // don't create real timers during unit tests
    jest.spyOn(window, 'setInterval').mockReturnValue(1 as any);

    redispatchCalls.length = 0;
    listenEventCalls.length = 0;
    listenDomEventCalls.length = 0;
    sessionListeners.length = 0;
    sessionState = 'down';
    getAllScriptsMock.mockReturnValue([]);

    loadScriptsFromStorageMock.mockReturnValue([
      { id: 's1', name: 'script1', code: 'echo 1' },
      { id: 's2', name: 'script2', code: 'echo 2' },
    ]);

    getStorageKeyMock.mockImplementation((connectionId?: string | null) => `userscripts:${connectionId ?? 'default'}`);

    jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => '');
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function importSingleton() {
    // must be imported AFTER resetModules so module-level state resets
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a synchronous fresh require is the point: jest.resetModules() above must take effect
    return require('./runtimeSingleton') as typeof import('./runtimeSingleton');
  }

  function emitWindowEvent(name: string, payload: any) {
    // Some code paths wire these via ListenEvent, others via ListenDomEvent.
    for (const call of listenEventCalls) {
      if (call.name === name) call.handler(payload);
    }
    for (const call of listenDomEventCalls) {
      if (call.name === name) call.handler({ detail: payload });
    }
  }

  test('Instance returns same singleton instance', () => {
    const { RuntimeSingleton } = importSingleton();

    const a = RuntimeSingleton.Instance;
    const b = RuntimeSingleton.Instance;

    expect(a).toBe(b);
  });

  test('Runtime returns same underlying runtime instance', () => {
    const { RuntimeSingleton } = importSingleton();

    const r1 = RuntimeSingleton.Runtime;
    const r2 = RuntimeSingleton.Runtime;

    expect(r1).toBe(r2);
  });

  test('constructor hydrates runtime with "dsl-mud" and replaces loaded scripts', () => {
    const { RuntimeSingleton } = importSingleton();

    // trigger construction
    void RuntimeSingleton.Instance;

    expect(getStorageKeyMock).toHaveBeenCalledWith('dsl-mud');
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(1);
    expect(loadScriptsFromStorageMock).toHaveBeenCalledWith('dsl-mud');

    expect(replaceAllScriptsMock).toHaveBeenCalledTimes(1);
    expect(replaceAllScriptsMock).toHaveBeenCalledWith([
      { id: 's1', name: 'script1', code: 'echo 1' },
      { id: 's2', name: 'script2', code: 'echo 2' },
    ]);
  });

  test('attaches redispatch mappings for RAW/GMCP/ERROR/CLOSE events with correct names', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    expect(redispatchCalls).toHaveLength(4);

    const names = redispatchCalls.map((c) => `${c.sourceEvent} -> ${c.destEvent}`);
    expect(names).toEqual([
      'game:remote-server:raw -> shatteredarchive:raw-data',
      'game:remote-server:gmcp -> shatteredarchive:gmcp-data',
      'game:remote-server:error -> shatteredarchive:server-error',
      'game:remote-server:close -> shatteredarchive:server-closed',
    ]);
  });

  test('RAW mapper outputs the expected ShatteredArchiveRawData shape', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    const rawCall = redispatchCalls.find((c) => c.sourceEvent === 'game:remote-server:raw');
    expect(rawCall).toBeTruthy();

    const mapped = rawCall!.mapper({
      type: 'raw',
      receivedTimestamp: 'x',
      payload: 'hello',
    });

    expect(mapped).toEqual({
      rawText: 'hello',
      text: 'hello',
      fromUserScript: false,
    });
  });

  test('GMCP mapper outputs the expected ShatteredArchiveGmcpData shape', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    const gmcpCall = redispatchCalls.find((c) => c.sourceEvent === 'game:remote-server:gmcp');
    expect(gmcpCall).toBeTruthy();

    const mapped = gmcpCall!.mapper({
      type: 'gmcp',
      receivedTimestamp: 'x',
      payload: 'room_data {...}',
    });

    expect(mapped).toEqual({
      rawText: 'room_data {...}',
      fromUserScript: false,
    });
  });

  test('ERROR mapper defaults message properly when missing', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    const errCall = redispatchCalls.find((c) => c.sourceEvent === 'game:remote-server:error');
    expect(errCall).toBeTruthy();

    const mapped = errCall!.mapper({
      type: 'error',
      payload: { receivedTimestamp: 'x' }, // no message
    });

    expect(mapped).toEqual({
      message: 'Unknown server error',
    });
  });

  test('CLOSE mapper includes the reason when provided', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    const closeCall = redispatchCalls.find((c) => c.sourceEvent === 'game:remote-server:close');
    expect(closeCall).toBeTruthy();

    const mapped = closeCall!.mapper({
      type: 'server-closed',
      payload: { receivedTimestamp: 'x', reason: 'Server reboot' },
    });

    expect(mapped).toEqual({
      reason: 'Server reboot',
    });
  });

  test('connection-changed rehydrates scripts for new connectionId', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    // initial hydrate
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(1);
    expect(replaceAllScriptsMock).toHaveBeenCalledTimes(1);

    emitWindowEvent('shatteredarchive:connection-changed', { connectionId: 'abc123' });

    // hydrate again
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(2);
    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('abc123');

    expect(replaceAllScriptsMock).toHaveBeenCalledTimes(2);
    expect(setActiveConnectionIdMock).toHaveBeenLastCalledWith('abc123');
  });

  test('connection-changed defaults connectionId to "dsl-mud" if missing', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitWindowEvent('shatteredarchive:connection-changed', {});

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('dsl-mud');
    expect(setActiveConnectionIdMock).toHaveBeenLastCalledWith('dsl-mud');
  });

  test('connection-changed with the legacy default id hydrates the dsl-mud bucket', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitWindowEvent('shatteredarchive:connection-changed', { connectionId: 'default' });

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('dsl-mud');
    expect(setActiveConnectionIdMock).toHaveBeenLastCalledWith('dsl-mud');
  });

  test('userScripts-updated with the legacy default id hydrates the dsl-mud bucket', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitWindowEvent('shatteredarchive:userScripts-updated', { connectionId: ' default ' });

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('dsl-mud');
  });

  test('named variables set under the legacy default id are the ones read as dsl-mud', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UserScriptRuntime } = require('./userScriptRuntime') as { UserScriptRuntime: jest.Mock };
    const options = UserScriptRuntime.mock.calls[0][0] as { getNamedVar: (name: string) => string | undefined };

    emitWindowEvent('shatteredarchive:named-var:set', { connectionId: 'default', name: 'target', value: 'weed' });

    expect(options.getNamedVar('target')).toBe('weed');

    emitWindowEvent('shatteredarchive:named-var:clear', { connectionId: 'default' });

    expect(options.getNamedVar('target')).toBeUndefined();
  });

  test('userScripts-updated rehydrates scripts for connectionId', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitWindowEvent('shatteredarchive:userScripts-updated', { connectionId: 'conn-9' });

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('conn-9');
    expect(replaceAllScriptsMock).toHaveBeenCalledTimes(2);
  });

  test('registers ListenEvent subscriptions using stable dedupe keys (HMR safe)', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    const keys = [...listenEventCalls.map((c) => c.options?.key), ...listenDomEventCalls.map((c) => c.options?.key)];

    expect(keys).toContain('runtimeSingleton::window::connection-changed');
    expect(keys).toContain('runtimeSingleton::window::userScripts-updated');

    expect(keys).toContain('runtimeSingleton::window::accessibility-updated');
    expect(keys).toContain('runtimeSingleton::chat::shatteredarchive:chat-line');
  });
  describe('a dropped and restored connection', () => {
    const timerScripts = [{ kind: 'timer', enabled: true }];

    function boot(scripts: unknown[] = timerScripts) {
      getAllScriptsMock.mockReturnValue(scripts);
      const { RuntimeSingleton } = importSingleton();
      void RuntimeSingleton.Instance;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DispatchEvent } = require('../event-emitter/event-dispatcher') as { DispatchEvent: jest.Mock };
      const lines = () =>
        DispatchEvent.mock.calls
          .filter(([name]) => name === 'shatteredarchive:write-terminal')
          .map(([, p]) => String(p.rawText).replace(/[[0-9;]*m/g, '').trim());
      return { lines };
    }

    function change(state: string, dropped = 0) {
      const previous = sessionState;
      sessionState = state;
      for (const listener of sessionListeners) listener({ state, previous, dropped });
    }

    test('starts the gate before it loads any script, so no trigger hears an open ahead of it', () => {
      boot();
      expect(startSessionGateMock).toHaveBeenCalledTimes(1);
      expect(startSessionGateMock.mock.invocationCallOrder[0]).toBeLessThan(replaceAllScriptsMock.mock.invocationCallOrder[0]);
    });

    test('ticks the timers only while the session is live', () => {
      boot();
      const tick = (window.setInterval as unknown as jest.Mock).mock.calls[0][0] as () => void;

      tick();
      sessionState = 'awaiting-login';
      tick();
      expect(tickTimersMock).not.toHaveBeenCalled();

      sessionState = 'live';
      tick();
      expect(tickTimersMock).toHaveBeenCalledTimes(1);
    });

    test('restarts every timer on going live, without a line on the first connection', () => {
      const { lines } = boot();
      rebuildTimersMock.mockClear();

      change('live');

      expect(rebuildTimersMock).toHaveBeenCalledTimes(1);
      expect(lines()).toEqual([]);
    });

    test('says that timers paused, wait for the login and resumed', () => {
      const { lines } = boot();
      change('live');

      change('down', 2);
      change('awaiting-login');
      change('live');
      change('down', 1);

      expect(lines()).toEqual([
        '[Timers] Disconnected — timers paused, 2 delayed commands cancelled',
        '[Timers] Connected — timers wait until your character is in the game',
        '[Timers] Timers resumed',
        '[Timers] Disconnected — timers paused, 1 delayed command cancelled',
      ]);
    });

    test('with no enabled timer, speaks only of cancelled delayed commands', () => {
      const { lines } = boot([{ kind: 'timer', enabled: false }, { kind: 'trigger', enabled: true }]);
      change('live');

      change('down');
      change('awaiting-login');
      change('live');
      expect(lines()).toEqual([]);

      change('down', 3);
      change('live');
      expect(lines()).toEqual(['[Timers] Disconnected — 3 delayed commands cancelled']);
    });

    test('answers for the timers of the session that dropped, whatever scripts are loaded at the reconnect', () => {
      // a custom server has its own scripts, swapped in just after the connection events
      const { lines } = boot();
      change('live');
      change('down');
      getAllScriptsMock.mockReturnValue([]);
      change('awaiting-login');
      change('live');

      expect(lines()).toEqual([
        '[Timers] Disconnected — timers paused',
        '[Timers] Connected — timers wait until your character is in the game',
        '[Timers] Timers resumed',
      ]);
    });

    test('says nothing at a reconnect when only the scripts loaded afterwards have timers', () => {
      const { lines } = boot([]);
      change('live');
      change('down');
      getAllScriptsMock.mockReturnValue(timerScripts);
      change('awaiting-login');
      change('live');

      expect(lines()).toEqual([]);
    });

    test('forgets the AFK state of the session that ended', () => {
      const { lines } = boot([]);
      emitWindowEvent('game:char-data', { is_afk: true });
      expect(setAfkModeMock).toHaveBeenLastCalledWith(true);

      change('down');
      expect(setAfkModeMock).toHaveBeenLastCalledWith(false);

      // the next session's AFK flag is news again, not a repeat of the old one
      emitWindowEvent('game:char-data', { is_afk: true });
      expect(setAfkModeMock).toHaveBeenLastCalledWith(true);
      expect(lines().filter((l) => l.includes('AFK detected'))).toHaveLength(2);

      emitWindowEvent('game:char-data', { is_afk: false });
      expect(setAfkModeMock).toHaveBeenLastCalledWith(false);
      expect(lines().at(-1)).toBe('[Timers] AFK cleared — timers resumed');
    });
  });
});
