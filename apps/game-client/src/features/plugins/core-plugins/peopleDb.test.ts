// Module-level singleton state (the `db` Map) means each test needs a fresh
// module instance — jest.resetModules() + re-require, rather than a shared
// import at file scope.

function freshPeopleDb() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./peopleDb') as typeof import('./peopleDb');
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('peopleDb persistence', () => {
  it('coalesces a burst of setPerson calls (a `who` list) into one localStorage write', () => {
    const { setPerson } = freshPeopleDb();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    for (let i = 0; i < 50; i++) setPerson(`Player${i}`, { level: 10 });
    expect(setItemSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const written = setItemSpy.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toHaveLength(50);

    setItemSpy.mockRestore();
  });

  it('caps retained people, evicting the oldest lastSeen first', () => {
    const { setPerson, dbSize, getPerson } = freshPeopleDb();

    // MAX_PEOPLE=3000/TRIM_TO=2500 — push past the cap with strictly increasing
    // lastSeen so eviction order is deterministic.
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now++);
    for (let i = 0; i < 3001; i++) setPerson(`Player${i}`, {});

    expect(dbSize()).toBeLessThanOrEqual(3000);
    expect(getPerson('Player0')).toBeNull(); // oldest, evicted
    expect(getPerson('Player3000')).not.toBeNull(); // newest, retained
  });
});
