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

// UserScriptRuntime mock
const clearMock = jest.fn();
const loadScriptsFromStorageMock = jest.fn();
const upsertScriptMock = jest.fn();
const getStorageKeyMock = jest.fn();
const setAliasSplitCharMock = jest.fn();

jest.mock('./userScriptRuntime', () => {
  return {
    // runtimeSingleton.ts imports this
    STORAGE_KEY_PREFIX_USERSCRIPTS: 'userscripts:',

    UserScriptRuntime: jest.fn().mockImplementation(() => {
      return {
        clear: clearMock,
        loadScriptsFromStorage: loadScriptsFromStorageMock,
        upsertScript: upsertScriptMock,
        getStorageKey: getStorageKeyMock,
        setAliasSplitChar: setAliasSplitCharMock,
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

    // deterministic localStorage behavior for the hydration short-circuit logic
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

  function emitListenEvent(name: string, payload: any) {
    for (const call of listenEventCalls) {
      if (call.name === name) {
        call.handler(payload);
      }
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

  test('constructor hydrates runtime with "default" and upserts loaded scripts', () => {
    const { RuntimeSingleton } = importSingleton();

    // trigger construction
    void RuntimeSingleton.Instance;

    // hydrateRuntime('default'):
    expect(getStorageKeyMock).toHaveBeenCalledWith('default');
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(1);
    expect(loadScriptsFromStorageMock).toHaveBeenCalledWith('default');

    // upsert both scripts that loadScriptsFromStorage returned
    expect(upsertScriptMock).toHaveBeenCalledTimes(2);
    expect(upsertScriptMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 's1' }));
    expect(upsertScriptMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 's2' }));
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

    // runtimeSingleton.ts maps `text` (not `userText`)
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

    // initial hydrate happened once already
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(1);

    emitListenEvent('shatteredarchive:connection-changed', { connectionId: 'abc123' });

    // hydrate again
    expect(clearMock).toHaveBeenCalledTimes(2);
    expect(loadScriptsFromStorageMock).toHaveBeenCalledTimes(2);
    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('abc123');
    expect(upsertScriptMock).toHaveBeenCalledTimes(4); // 2 more scripts upserted
  });

  test('connection-changed defaults connectionId to "default" if missing', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitListenEvent('shatteredarchive:connection-changed', {});

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('default');
  });

  test('userScripts-updated rehydrates scripts for connectionId', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    emitListenEvent('shatteredarchive:userScripts-updated', { connectionId: 'conn-9' });

    expect(loadScriptsFromStorageMock).toHaveBeenLastCalledWith('conn-9');
  });

  test('registers ListenEvent subscriptions using stable dedupe keys (HMR safe)', () => {
    const { RuntimeSingleton } = importSingleton();
    void RuntimeSingleton.Instance;

    // these include *all* ListenEvent calls from runtimeSingleton.ts (not just 2 anymore)
    const keys = listenEventCalls.map((c) => c.options?.key);

    expect(keys).toContain('runtimeSingleton::window::connection-changed');
    expect(keys).toContain('runtimeSingleton::window::userScripts-updated');

    // also present in runtimeSingleton.ts now
    expect(keys).toContain('runtimeSingleton::window::accessibility-updated');
    expect(keys).toContain('runtimeSingleton::chat::shatteredarchive:chat-line');
  });
});
