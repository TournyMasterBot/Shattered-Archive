// Module-level singleton state (the `db` Map) means each test needs a fresh
// module instance — jest.resetModules() + re-require, rather than a shared
// import at file scope. Mirrors peopleDb.test.ts.

function freshStorage() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./crafting-helper-storage') as typeof import('./crafting-helper-storage');
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('crafting-helper-storage persistence', () => {
  it('coalesces a burst of setTrackedSkillLevel calls into one localStorage write', () => {
    const { setTrackedSkillLevel } = freshStorage();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    for (let i = 1; i <= 20; i++) setTrackedSkillLevel('grondak', 'spellcrafting', i);
    expect(setItemSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const written = setItemSpy.mock.calls[0][1] as string;
    expect(JSON.parse(written)['grondak::spellcrafting'].level).toBe(20);

    setItemSpy.mockRestore();
  });

  it('round-trips a value through a fresh module instance', () => {
    const first = freshStorage();
    first.setTrackedSkillLevel('grondak', 'spellcrafting', 948);
    jest.advanceTimersByTime(500);

    const second = freshStorage();
    expect(second.getTrackedSkillLevel('grondak', 'spellcrafting')).toBe(948);
  });

  it('isolates entries per character and per craft type', () => {
    const { setTrackedSkillLevel, getTrackedSkillLevel } = freshStorage();
    setTrackedSkillLevel('grondak', 'spellcrafting', 948);
    setTrackedSkillLevel('grondak', 'tailoring', 10);
    setTrackedSkillLevel('riaghan', 'spellcrafting', 500);

    expect(getTrackedSkillLevel('grondak', 'spellcrafting')).toBe(948);
    expect(getTrackedSkillLevel('grondak', 'tailoring')).toBe(10);
    expect(getTrackedSkillLevel('riaghan', 'spellcrafting')).toBe(500);
    expect(getTrackedSkillLevel('riaghan', 'tailoring')).toBeNull();
  });

  it('returns null for an untracked character/craft-type pair', () => {
    const { getTrackedSkillLevel } = freshStorage();
    expect(getTrackedSkillLevel('nobody', 'spellcrafting')).toBeNull();
  });

  it('falls back to an empty store on corrupt localStorage rather than throwing', () => {
    window.localStorage.setItem('shatteredarchive.plugins.crafting-helper.skillLevels', '{not valid json');
    const { getTrackedSkillLevel } = freshStorage();
    expect(() => getTrackedSkillLevel('grondak', 'spellcrafting')).not.toThrow();
    expect(getTrackedSkillLevel('grondak', 'spellcrafting')).toBeNull();
  });
});
