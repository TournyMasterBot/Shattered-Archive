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

        // optional methods runtimeSingleton tries to call (optional chaining in prod code)
        rebuildTriggerListeners: jest.fn(),
        rebuildAliasIndex: jest.fn(),
      };
    }),
  };
});

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
  };
});

describe('RuntimeSingleton', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    redispatchCalls.length = 0;
    listenEventCalls.length = 0;
    listenDomEventCalls.length = 0;

    // default scripts for hydration
    loadScriptsFromStorageMock.mockReturnValue([
      { id: 's1', name: 'script1', code: 'echo 1' },
      { id: 's2', name: 'script2', code: 'echo 2' },
    ]);

    // hydrateRuntime() calls getStorageKey(connectionId) + localStorage.getItem(key)
    getStorageKeyMock.mockImplementation((connectionId?: string | null) => `userscripts:${connectionId ?? 'default'}`);

    // deterministic localStorage behavior for hydration short-circuit logic
    jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => '');

    // silence noisy logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function importSingleton() {
    // must be imported AFTER resetModules so module-level state resets
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  test('constructor hydrates runtime with "default" and replaces loaded scripts', () => {
    const { RuntimeSingleton } = importSingleton();

    // trigger construction
    void RuntimeSingleton.Instance;

    expect(getStorageKeyMock).toHaveBeenCalledWith('default');
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(1);
    expect(loadScriptsFromStorageMock).toHaveBeenCalledWith('default');

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

  test('connection-changed defaults connectionId to "default" if missing', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitWindowEvent('shatteredarchive:connection-changed', {});

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('default');
    expect(setActiveConnectionIdMock).toHaveBeenLastCalledWith('default');
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
});
