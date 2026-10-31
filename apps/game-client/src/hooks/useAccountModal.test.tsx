// apps/game-client/src/hooks/useAccountModal.test.tsx
//
// The cloud Save / Load handlers: fetch-first confirm on Load, an empty cloud never
// wipes local data, a Save that would erase cloud data asks first, and a server that
// omits `count` (it answers `{}` for 0) is shown as 0 rather than "undefined".
import { act, renderHook } from '@testing-library/react';
import { useAccountModal } from './useAccountModal';

const mockCloud = {
  loadScripts: jest.fn(),
  loadPluginConfigs: jest.fn(),
  loadGlobalScripts: jest.fn(),
  loadAutolevelUserData: jest.fn(),
  saveScripts: jest.fn(),
  savePluginConfigs: jest.fn(),
  saveGlobalScripts: jest.fn(),
  saveAutolevelUserData: jest.fn(),
};
const mockLibrary = { saveLibraryToCloud: jest.fn(), loadLibraryFromCloud: jest.fn() };
const mockWritePlugins = jest.fn();
const mockImportAutolevel = jest.fn();
const mockExportAutolevel = jest.fn();
const mockLoadLocalScripts = jest.fn();

jest.mock('../features/auth/cloudSync', () => ({
  loadScripts: (...a: unknown[]) => mockCloud.loadScripts(...a),
  loadPluginConfigs: (...a: unknown[]) => mockCloud.loadPluginConfigs(...a),
  loadGlobalScripts: (...a: unknown[]) => mockCloud.loadGlobalScripts(...a),
  loadAutolevelUserData: (...a: unknown[]) => mockCloud.loadAutolevelUserData(...a),
  saveScripts: (...a: unknown[]) => mockCloud.saveScripts(...a),
  savePluginConfigs: (...a: unknown[]) => mockCloud.savePluginConfigs(...a),
  saveGlobalScripts: (...a: unknown[]) => mockCloud.saveGlobalScripts(...a),
  saveAutolevelUserData: (...a: unknown[]) => mockCloud.saveAutolevelUserData(...a),
}));
jest.mock('../features/library/librarySync', () => ({
  saveLibraryToCloud: (...a: unknown[]) => mockLibrary.saveLibraryToCloud(...a),
  loadLibraryFromCloud: (...a: unknown[]) => mockLibrary.loadLibraryFromCloud(...a),
}));
jest.mock('../features/autoleveling/autoleveling-user-data', () => ({
  exportAll: (...a: unknown[]) => mockExportAutolevel(...a),
  importRecords: (...a: unknown[]) => mockImportAutolevel(...a),
}));
jest.mock('../features/userScripts/runtimeSingleton', () => ({
  RuntimeSingleton: {
    Runtime: {
      loadScriptsFromStorage: (...a: unknown[]) => mockLoadLocalScripts(...a),
      getStorageKey: (id: string) => `shatteredArchive.userScripts.${id}`,
    },
  },
}));
jest.mock('./usePlugins', () => ({
  PLUGINS_STORAGE_KEY: 'plugins.installed',
  writeInstalledPlugins: (...a: unknown[]) => mockWritePlugins(...a),
}));
const VALID_TOKEN = { token: 't', expiresAt: '2999-01-01T00:00:00Z' };
const mockToken = { current: VALID_TOKEN as typeof VALID_TOKEN | null, expired: false };
const mockClearToken = jest.fn();
const mockStartLogin = jest.fn();
let mockTokenListener: ((t: typeof VALID_TOKEN | null) => void) | null = null;

jest.mock('../features/auth/authTokenStore', () => ({
  getToken: () => mockToken.current,
  clearToken: (...a: unknown[]) => mockClearToken(...a),
  isExpired: () => mockToken.expired,
  subscribeToToken: (fn: (t: typeof VALID_TOKEN | null) => void) => {
    mockTokenListener = fn;
    return () => {
      mockTokenListener = null;
    };
  },
}));
jest.mock('../features/auth/gameSso', () => ({ startLogin: (...a: unknown[]) => mockStartLogin(...a) }));

const ok = <T,>(data: T) => ({ kind: 'ok' as const, data });
const EMPTY = { javascript: '', lua: '', python: '', typescript: '' };
const SCRIPT = (id: string) => ({ id, kind: 'alias', name: id, alias: id, enabled: true, language: 'javascript', source: '' });
const SCRIPTS_KEY = 'shatteredArchive.userScripts.dsl-mud';

function setCloud(over: { scripts?: unknown; plugins?: unknown; globals?: unknown; autolevel?: unknown } = {}) {
  mockCloud.loadScripts.mockResolvedValue(over.scripts ?? ok([]));
  mockCloud.loadPluginConfigs.mockResolvedValue(over.plugins ?? ok([]));
  mockCloud.loadGlobalScripts.mockResolvedValue(over.globals ?? ok([]));
  mockCloud.loadAutolevelUserData.mockResolvedValue(over.autolevel ?? ok([]));
}

function mount() {
  return renderHook(() => useAccountModal({ isOpen: true, connectionId: 'dsl-mud', onClose: () => {} }));
}

let confirmSpy: jest.SpyInstance;
let timeoutSpy: jest.SpyInstance;

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  mockToken.current = VALID_TOKEN;
  mockToken.expired = false;
  mockTokenListener = null;
  mockLoadLocalScripts.mockReturnValue([]);
  mockLibrary.loadLibraryFromCloud.mockResolvedValue(ok({ parchment: 0, notes: 0, books: 0 }));
  mockLibrary.saveLibraryToCloud.mockResolvedValue(ok({ parchment: 0, notes: 0, books: 0 }));
  mockExportAutolevel.mockResolvedValue([]);
  mockImportAutolevel.mockResolvedValue(undefined);
  mockCloud.saveScripts.mockResolvedValue(ok({}));
  mockCloud.savePluginConfigs.mockResolvedValue(ok({}));
  mockCloud.saveGlobalScripts.mockResolvedValue(ok({}));
  mockCloud.saveAutolevelUserData.mockResolvedValue(ok({}));
  setCloud();
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  timeoutSpy = jest.spyOn(window, 'setTimeout').mockImplementation((() => 0) as never);
});

afterEach(() => jest.restoreAllMocks());

describe('handleLoadFromCloud', () => {
  it('leaves everything alone and says so when the cloud is empty', async () => {
    window.localStorage.setItem(SCRIPTS_KEY, JSON.stringify([SCRIPT('mine')]));
    mockLoadLocalScripts.mockReturnValue([SCRIPT('mine')]);
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(SCRIPTS_KEY)!)).toEqual([SCRIPT('mine')]);
    expect(mockWritePlugins).not.toHaveBeenCalled();
    expect(result.current.status?.kind).toBe('info');
    expect(result.current.status?.text).toContain('Nothing is saved to this account yet.');
    expect(result.current.status?.text).toContain('The 1 script on this connection was not touched.');
    expect(timeoutSpy).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('asks first with a warning that names the counts, and applies nothing when cancelled', async () => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a'), SCRIPT('b'), SCRIPT('c')]);
    setCloud({ scripts: ok([SCRIPT('x'), SCRIPT('y')]) });
    confirmSpy.mockReturnValue(false);
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    const prompt = String(confirmSpy.mock.calls[0][0]);
    expect(prompt).toContain('Replace data on this connection?');
    expect(prompt).toContain('3 scripts on this connection will be REPLACED by the 2 scripts saved in the cloud');
    expect(window.localStorage.getItem(SCRIPTS_KEY)).toBeNull();
    expect(mockLibrary.loadLibraryFromCloud).not.toHaveBeenCalled();
    expect(mockImportAutolevel).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'info', text: 'Load cancelled. Nothing on this connection was changed.' });
  });

  it('applies the cloud data once confirmed, reports counts, and schedules the reload', async () => {
    setCloud({
      scripts: ok([SCRIPT('x')]),
      plugins: ok([{ id: 'p1' }, { id: 'p2' }]),
      globals: ok([{ connectionId: 'default', sources: { ...EMPTY, lua: 'x = 1' } }]),
      autolevel: ok([{ key: 'k' }]),
    });
    mockLibrary.loadLibraryFromCloud.mockResolvedValue(ok({ parchment: 2, notes: 1, books: 0 }));
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(JSON.parse(window.localStorage.getItem(SCRIPTS_KEY)!)).toEqual([SCRIPT('x')]);
    expect(mockWritePlugins).toHaveBeenCalledWith([{ id: 'p1' }, { id: 'p2' }]);
    expect(JSON.parse(window.localStorage.getItem('shatteredArchive.userGlobalScripts.dsl-mud')!).sources.lua).toBe('x = 1');
    expect(mockImportAutolevel).toHaveBeenCalledWith([{ key: 'k' }]);
    expect(result.current.status).toEqual({
      kind: 'ok',
      text: 'Loaded 1 script, 2 plugin configs, 1 global-script set; merged 2 parchment / 1 note(s) / 0 book(s) and 1 auto-leveling record(s). Reloading to apply…',
    });
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  it('does not ask, and only fills in, when the device has nothing to lose', async () => {
    setCloud({ scripts: ok([SCRIPT('x')]) });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(String(confirmSpy.mock.calls[0][0])).toContain('Load from the cloud?');
    expect(String(confirmSpy.mock.calls[0][0])).not.toContain('REPLACED');
    expect(JSON.parse(window.localStorage.getItem(SCRIPTS_KEY)!)).toEqual([SCRIPT('x')]);
  });

  it('does not replace plugins when the cloud has none', async () => {
    setCloud({ scripts: ok([SCRIPT('x')]) });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(mockWritePlugins).not.toHaveBeenCalled();
  });

  it('merges a default-bucket cloud upload into the dsl-mud bucket', async () => {
    window.localStorage.setItem(
      'shatteredArchive.userGlobalScripts.dsl-mud',
      JSON.stringify({ schema: 'shatteredArchive.globalScripts.v1', sources: { ...EMPTY, javascript: 'local js' } }),
    );
    setCloud({ globals: ok([{ connectionId: 'default', sources: { ...EMPTY, javascript: 'cloud js' } }]) });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(String(confirmSpy.mock.calls[0][0])).toContain('Your global scripts (javascript) will be REPLACED by the cloud');
    expect(JSON.parse(window.localStorage.getItem('shatteredArchive.userGlobalScripts.dsl-mud')!).sources.javascript).toBe('cloud js');
  });

  it("names other servers' globals that would also be replaced", async () => {
    const custom = { schema: 'shatteredArchive.globalScripts.v1', sources: { ...EMPTY, lua: 'mine' } };
    window.localStorage.setItem('shatteredArchive.userGlobalScripts.mud.example.com:4000', JSON.stringify(custom));
    setCloud({ globals: ok([{ connectionId: 'mud.example.com:4000', sources: { ...EMPTY, lua: 'cloud' } }]) });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(String(confirmSpy.mock.calls[0][0])).toContain('Global scripts for other servers (mud.example.com:4000) will also be REPLACED.');
  });

  it.each([
    ['scripts', { scripts: { kind: 'error', message: 'boom' } }, 'Load failed (scripts): boom'],
    ['plugin configs', { plugins: { kind: 'error', message: 'boom' } }, 'Load failed (plugin configs): boom'],
    ['global scripts', { globals: { kind: 'error', message: 'boom' } }, 'Load failed (global scripts): boom'],
    ['auto-leveling data', { autolevel: { kind: 'error', message: 'boom' } }, 'Load failed (auto-leveling data): boom'],
  ])('stops, changing nothing, when fetching %s fails', async (_name, over, text) => {
    setCloud(over);
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(result.current.status).toEqual({ kind: 'err', text });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SCRIPTS_KEY)).toBeNull();
  });

  it('logs out and says so when the session has expired', async () => {
    setCloud({ scripts: { kind: 'unauthenticated' } });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.status?.text).toBe('Your session expired — please log in again.');
  });

  it('reports a library failure after the rest was applied, and does not schedule a reload', async () => {
    setCloud({ scripts: ok([SCRIPT('x')]) });
    mockLibrary.loadLibraryFromCloud.mockResolvedValue({ kind: 'error', message: 'idb down' });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(result.current.status).toEqual({
      kind: 'err',
      text: 'Scripts and plugins were loaded, but the library failed: idb down. Reload the page to apply what was loaded.',
    });
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it('logs out when the library load reports an expired session', async () => {
    setCloud({ scripts: ok([SCRIPT('x')]) });
    mockLibrary.loadLibraryFromCloud.mockResolvedValue({ kind: 'unauthenticated' });
    const { result } = mount();

    await act(() => result.current.handleLoadFromCloud());

    expect(result.current.isLoggedIn).toBe(false);
  });
});

describe('handleSaveToCloud', () => {
  it('asks before erasing a non-empty cloud copy with an empty local one, and uploads nothing when declined', async () => {
    setCloud({ scripts: ok([SCRIPT('a'), SCRIPT('b')]) });
    confirmSpy.mockReturnValue(false);
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(String(confirmSpy.mock.calls[0][0])).toContain('this connection has no scripts, so the 2 scripts in the cloud would be erased');
    expect(mockCloud.saveScripts).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'info', text: 'Save cancelled. Nothing in the cloud was changed.' });
  });

  it('uploads once the user accepts the erase', async () => {
    setCloud({ scripts: ok([SCRIPT('a')]) });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mockCloud.saveScripts).toHaveBeenCalledWith([]);
  });

  it('does not ask when nothing would be erased, and reports a missing count as 0', async () => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    mockCloud.saveScripts.mockResolvedValue(ok({ count: 1 }));
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result.current.status?.kind).toBe('ok');
    expect(result.current.status?.text).toContain('Saved 1 script(s), 0 plugin config(s), 0 global-script set(s)');
    expect(result.current.status?.text).toContain('and 0 auto-leveling record(s) to the cloud.');
    expect(result.current.status?.text).not.toContain('undefined');
  });

  it('uploads the dsl-mud bucket for globals saved under either id', async () => {
    window.localStorage.setItem(
      'shatteredArchive.userGlobalScripts.dsl-mud',
      JSON.stringify({ schema: 'shatteredArchive.globalScripts.v1', sources: { ...EMPTY, javascript: 'farm' } }),
    );
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(mockCloud.saveGlobalScripts).toHaveBeenCalledWith([
      { connectionId: 'dsl-mud', sources: { ...EMPTY, javascript: 'farm' } },
    ]);
  });

  it('stops, uploading nothing, when it cannot check what is already in the cloud', async () => {
    setCloud({ plugins: { kind: 'error', message: 'offline' } });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(result.current.status).toEqual({
      kind: 'err',
      text: 'Save stopped: could not check what is already in the cloud (offline).',
    });
    expect(mockCloud.saveScripts).not.toHaveBeenCalled();
  });

  it('logs out when the look-ahead finds an expired session', async () => {
    setCloud({ globals: { kind: 'unauthenticated' } });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(result.current.isLoggedIn).toBe(false);
    expect(mockCloud.saveScripts).not.toHaveBeenCalled();
  });

  it.each([
    ['scripts', 'saveScripts', 'Save failed (scripts): nope'],
    ['plugin configs', 'savePluginConfigs', 'Save failed (plugin configs): nope'],
    ['global scripts', 'saveGlobalScripts', 'Save failed (global scripts): nope'],
    ['auto-leveling data', 'saveAutolevelUserData', 'Save failed (auto-leveling data): nope'],
  ])('reports a failed upload of %s', async (_name, fn, text) => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    (mockCloud as Record<string, jest.Mock>)[fn].mockResolvedValue({ kind: 'error', message: 'nope' });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(result.current.status).toEqual({ kind: 'err', text });
  });

  it('reports a failed library upload', async () => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    mockLibrary.saveLibraryToCloud.mockResolvedValue({ kind: 'error', message: 'nope' });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(result.current.status).toEqual({ kind: 'err', text: 'Save failed (library): nope' });
  });

  it.each([['saveScripts'], ['savePluginConfigs'], ['saveGlobalScripts'], ['saveAutolevelUserData']])(
    'logs out when %s reports an expired session',
    async (fn) => {
      mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
      (mockCloud as Record<string, jest.Mock>)[fn].mockResolvedValue({ kind: 'unauthenticated' });
      const { result } = mount();

      await act(() => result.current.handleSaveToCloud());

      expect(result.current.isLoggedIn).toBe(false);
    },
  );

  it('logs out when the library upload reports an expired session', async () => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    mockLibrary.saveLibraryToCloud.mockResolvedValue({ kind: 'unauthenticated' });
    const { result } = mount();

    await act(() => result.current.handleSaveToCloud());

    expect(result.current.isLoggedIn).toBe(false);
  });
});

describe('signed-in state', () => {
  const open = (isOpen: boolean) =>
    renderHook(() => useAccountModal({ isOpen, connectionId: 'dsl-mud', onClose: () => {} }));

  it('is signed in on open when a valid token is stored', () => {
    const { result } = open(true);
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('is signed out on open when there is no token', () => {
    mockToken.current = null;
    expect(open(true).result.current.isLoggedIn).toBe(false);
  });

  it('is signed out on open when the stored token has expired', () => {
    mockToken.expired = true;
    expect(open(true).result.current.isLoggedIn).toBe(false);
  });

  it('does not read the token while the modal is closed', () => {
    expect(open(false).result.current.isLoggedIn).toBe(false);
  });

  it('flips to signed in the moment another window writes a token, and back when it is cleared', () => {
    mockToken.current = null;
    const { result } = open(true);
    expect(result.current.isLoggedIn).toBe(false);

    act(() => mockTokenListener?.(VALID_TOKEN));
    expect(result.current.isLoggedIn).toBe(true);

    act(() => mockTokenListener?.(null));
    expect(result.current.isLoggedIn).toBe(false);

    mockToken.expired = true;
    act(() => mockTokenListener?.(VALID_TOKEN));
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('stops listening for token changes when it unmounts', () => {
    const { unmount } = open(true);
    expect(mockTokenListener).not.toBeNull();
    unmount();
    expect(mockTokenListener).toBeNull();
  });
});

describe('handleLogin', () => {
  it('shows the waiting message while the sign-in window is open, then signs in', async () => {
    mockToken.current = null;
    let finish!: (o: { kind: 'success' }) => void;
    mockStartLogin.mockReturnValue(new Promise((r) => (finish = r)));
    const { result } = mount();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleLogin();
    });
    expect(result.current.loginPending).toBe(true);
    expect(result.current.status).toEqual({ kind: 'info', text: 'Waiting for the sign-in window…' });

    await act(async () => {
      finish({ kind: 'success' });
      await pending;
    });

    expect(result.current.loginPending).toBe(false);
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.status).toEqual({ kind: 'ok', text: 'Signed in.' });
  });

  it.each([
    ['blocked', 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again — your game connection is still open.'],
    ['cancelled', 'Sign-in was cancelled. Your game connection is unaffected.'],
    ['timeout', 'Sign-in timed out. Your game connection is unaffected — try again when ready.'],
  ])('explains a %s sign-in and stays signed out', async (kind, text) => {
    mockToken.current = null;
    mockStartLogin.mockResolvedValue({ kind });
    const { result } = mount();

    await act(() => result.current.handleLogin());

    expect(result.current.status).toEqual({ kind: 'err', text });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.loginPending).toBe(false);
  });
});

describe('installed plugins read for a Save', () => {
  const saveAndGetPlugins = async () => {
    mockLoadLocalScripts.mockReturnValue([SCRIPT('a')]);
    const { result } = mount();
    await act(() => result.current.handleSaveToCloud());
    return mockCloud.savePluginConfigs.mock.calls[0][0];
  };

  it('uploads the stored plugin records', async () => {
    window.localStorage.setItem('plugins.installed', JSON.stringify([{ id: 'p1' }]));
    expect(await saveAndGetPlugins()).toEqual([{ id: 'p1' }]);
  });

  it('treats corrupt stored plugins as none instead of failing the save', async () => {
    window.localStorage.setItem('plugins.installed', '{not json');
    expect(await saveAndGetPlugins()).toEqual([]);
  });

  it('treats a stored value that is not a list as none', async () => {
    window.localStorage.setItem('plugins.installed', JSON.stringify({ id: 'p1' }));
    expect(await saveAndGetPlugins()).toEqual([]);
  });
});

describe('handleLogout', () => {
  it('clears the stored token and signs out', () => {
    const { result } = mount();
    expect(result.current.isLoggedIn).toBe(true);

    act(() => result.current.handleLogout());

    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.status).toEqual({ kind: 'ok', text: 'Logged out.' });
  });
});
