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

describe('global scripts share one bucket for the legacy default id and dsl-mud', () => {
  it('shows a script saved while disconnected (default) when read as the connected DSL id', () => {
    const { setGlobalScriptSource, getGlobalScriptsSnapshot } = freshStore();

    setGlobalScriptSource('default', 'javascript', 'const farm = 1;');

    expect(getGlobalScriptsSnapshot('dsl-mud').javascript).toBe('const farm = 1;');
    expect(getGlobalScriptsSnapshot(undefined).javascript).toBe('const farm = 1;');
  });

  it('writes a save made under the legacy default id to the dsl-mud storage key', () => {
    const { setGlobalScriptSource } = freshStore();

    setGlobalScriptSource('default', 'lua', 'x = 1');

    expect(window.localStorage.getItem('shatteredArchive.userGlobalScripts.default')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('shatteredArchive.userGlobalScripts.dsl-mud')!).sources.lua).toBe(
      'x = 1',
    );
  });

  it('ignores a cloud bucket that has no connection id', () => {
    const { replaceGlobalScriptBuckets, getGlobalScriptsSnapshot } = freshStore();
    const empty = { javascript: '', lua: '', python: '', typescript: '' };

    replaceGlobalScriptBuckets([
      { connectionId: '', sources: { ...empty, javascript: 'orphan' } },
      { connectionId: 'default', sources: { ...empty, lua: 'kept' } },
    ]);

    expect(getGlobalScriptsSnapshot('default')).toEqual({ ...empty, lua: 'kept' });
  });

  it('never lets an empty cloud bucket wipe a local one', () => {
    const { setGlobalScriptSource, replaceGlobalScriptBuckets, getGlobalScriptsSnapshot } = freshStore();
    const empty = { javascript: '', lua: '', python: '', typescript: '' };
    setGlobalScriptSource('dsl-mud', 'javascript', 'keep me');

    replaceGlobalScriptBuckets([{ connectionId: 'dsl-mud', sources: empty }]);

    expect(getGlobalScriptsSnapshot('dsl-mud').javascript).toBe('keep me');
  });

  it('normalizeGlobalBuckets canonicalizes ids, merges both ids, and drops empty buckets', () => {
    const { normalizeGlobalBuckets } = freshStore();
    const empty = { javascript: '', lua: '', python: '', typescript: '' };

    const out = normalizeGlobalBuckets([
      { connectionId: 'default', sources: { ...empty, javascript: 'a', python: 'only default' } },
      { connectionId: 'dsl-mud', sources: { ...empty, javascript: 'b' } },
      { connectionId: 'mud.example.com:4000', sources: empty },
      { connectionId: 'host:1', sources: { ...empty, lua: 'x' } },
    ]);

    expect(out).toEqual([
      { connectionId: 'dsl-mud', sources: { javascript: 'b', lua: '', python: 'only default', typescript: '' } },
      { connectionId: 'host:1', sources: { ...empty, lua: 'x' } },
    ]);
  });

  it('languagesWithSource lists only the languages that hold source', () => {
    const { languagesWithSource } = freshStore();
    expect(languagesWithSource({ javascript: 'x', lua: '', python: 'y', typescript: '' })).toEqual(['javascript', 'python']);
    expect(languagesWithSource({ javascript: '', lua: '', python: '', typescript: '' })).toEqual([]);
  });

  it('keeps a custom server separate', () => {
    const { setGlobalScriptSource, getGlobalScriptsSnapshot } = freshStore();

    setGlobalScriptSource('mud.example.com:4000', 'javascript', 'custom');

    expect(getGlobalScriptsSnapshot('default').javascript).toBe('');
    expect(getGlobalScriptsSnapshot('mud.example.com:4000').javascript).toBe('custom');
  });

  it('merges cloud buckets uploaded under both ids instead of letting the last one win', () => {
    const { replaceGlobalScriptBuckets, getGlobalScriptsSnapshot } = freshStore();
    const empty = { javascript: '', lua: '', python: '', typescript: '' };

    replaceGlobalScriptBuckets([
      { connectionId: 'dsl-mud', sources: { ...empty, javascript: 'from dsl-mud', lua: 'lua only on dsl-mud' } },
      { connectionId: 'default', sources: { ...empty, javascript: 'from default', python: 'py only on default' } },
    ]);

    expect(getGlobalScriptsSnapshot('default')).toEqual({
      javascript: 'from dsl-mud',
      lua: 'lua only on dsl-mud',
      python: 'py only on default',
      typescript: '',
    });
  });

  it('prefers the dsl-mud bucket regardless of the order the cloud returned them in', () => {
    const { replaceGlobalScriptBuckets, getGlobalScriptsSnapshot } = freshStore();
    const empty = { javascript: '', lua: '', python: '', typescript: '' };

    replaceGlobalScriptBuckets([
      { connectionId: 'default', sources: { ...empty, javascript: 'from default' } },
      { connectionId: 'dsl-mud', sources: { ...empty, javascript: 'from dsl-mud' } },
    ]);

    expect(getGlobalScriptsSnapshot('default').javascript).toBe('from dsl-mud');
  });
});

describe('global vars loaded from disk', () => {
  it('parses vars already stored in localStorage', () => {
    window.localStorage.setItem(
      'shatteredArchive.userGlobalVars.dsl-mud',
      JSON.stringify({ schema: 'shatteredArchive.globalVars.v1', vars: { target: 'weed' } }),
    );
    const { getGlobalVarsSnapshot } = freshStore();

    expect(getGlobalVarsSnapshot('default')).toEqual({ target: 'weed' });
  });

  it('falls back to no vars when the stored value is corrupt', () => {
    window.localStorage.setItem('shatteredArchive.userGlobalVars.dsl-mud', '{not json');
    const { getGlobalVarsSnapshot } = freshStore();

    expect(getGlobalVarsSnapshot('default')).toEqual({});
  });

  it('serves the cached vars until the stored value changes', () => {
    window.localStorage.setItem(
      'shatteredArchive.userGlobalVars.dsl-mud',
      JSON.stringify({ schema: 'shatteredArchive.globalVars.v1', vars: { a: 1 } }),
    );
    const { getGlobalVarsSnapshot } = freshStore();

    const first = getGlobalVarsSnapshot('default');
    expect(getGlobalVarsSnapshot('default')).toBe(first);

    window.localStorage.setItem(
      'shatteredArchive.userGlobalVars.dsl-mud',
      JSON.stringify({ schema: 'shatteredArchive.globalVars.v1', vars: { a: 2 } }),
    );
    expect(getGlobalVarsSnapshot('default')).toEqual({ a: 2 });
  });
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
