// Module-level Maps (varsCache, varsRawCache, pendingVarsWrite) mean each
// test needs a fresh module instance.

function freshStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./globalScriptsStore') as typeof import('./globalScriptsStore');
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('global vars persistence', () => {
  it('coalesces a burst of setGlobalVar calls into one localStorage write', () => {
    const { setGlobalVar } = freshStore();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    for (let i = 0; i < 30; i++) setGlobalVar('conn-1', `key${i}`, i);
    expect(setItemSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    setItemSpy.mockRestore();
  });

  it('reads its own just-set value while the write is still pending (does not fall back to stale disk state)', () => {
    const { setGlobalVar, getGlobalVarsSnapshot } = freshStore();

    setGlobalVar('conn-1', 'mode', 'hunt');
    // No timer advance — the debounced disk write has NOT fired yet.
    expect(getGlobalVarsSnapshot('conn-1').mode).toBe('hunt');

    jest.advanceTimersByTime(500);
    expect(getGlobalVarsSnapshot('conn-1').mode).toBe('hunt');
  });

  it('keeps separate connections independently debounced', () => {
    const { setGlobalVar, getGlobalVarsSnapshot } = freshStore();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    setGlobalVar('conn-a', 'mode', 'a');
    setGlobalVar('conn-b', 'mode', 'b');
    jest.advanceTimersByTime(500);

    expect(setItemSpy).toHaveBeenCalledTimes(2);
    expect(getGlobalVarsSnapshot('conn-a').mode).toBe('a');
    expect(getGlobalVarsSnapshot('conn-b').mode).toBe('b');

    setItemSpy.mockRestore();
  });

  it('deleteGlobalVar also debounces and is reflected immediately in-memory', () => {
    const { setGlobalVar, deleteGlobalVar, getGlobalVarsSnapshot } = freshStore();
    setGlobalVar('conn-1', 'mode', 'hunt');
    jest.advanceTimersByTime(500);

    deleteGlobalVar('conn-1', 'mode');
    expect(getGlobalVarsSnapshot('conn-1').mode).toBeUndefined();

    jest.advanceTimersByTime(500);
    expect(getGlobalVarsSnapshot('conn-1').mode).toBeUndefined();
  });
});
