import { ACTIVITY_CAP, createActivityLog, type NewActivityEntry } from './activityLog';

const entry = (n: number): NewActivityEntry => ({
  at: `2026-11-07T00:00:${String(n % 60).padStart(2, '0')}Z`,
  line: `look ${n}`,
  verdict: 'accepted',
  replyLines: [`reply ${n}`],
  rawReply: `reply ${n}\n\r`,
});

describe('the activity store', () => {
  it('stores entries oldest first with increasing ids and returns the stored entry', () => {
    const store = createActivityLog();
    const first = store.add(entry(1));
    const second = store.add({ ...entry(2), verdict: 'refused', reason: 'Huh?' });
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(store.getEntries().map((e) => e.line)).toEqual(['look 1', 'look 2']);
    expect(store.getEntries()[1]).toEqual(expect.objectContaining({ verdict: 'refused', reason: 'Huh?' }));
  });

  it('drops the oldest past the cap of 200', () => {
    expect(ACTIVITY_CAP).toBe(200);
    const store = createActivityLog();
    for (let i = 1; i <= 201; i++) store.add(entry(i));
    const lines = store.getEntries().map((e) => e.line);
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('look 2');
    expect(lines[199]).toBe('look 201');
  });

  it('honours a smaller cap', () => {
    const store = createActivityLog(2);
    store.add(entry(1));
    store.add(entry(2));
    store.add(entry(3));
    expect(store.getEntries().map((e) => [e.id, e.line])).toEqual([
      [2, 'look 2'],
      [3, 'look 3'],
    ]);
    expect(store.getEntries()).toHaveLength(2);
  });

  it('notifies subscribers on add and clear, but not when clearing an empty store', () => {
    const store = createActivityLog();
    const listener = jest.fn();
    const stop = store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
    store.add(entry(1));
    expect(listener).toHaveBeenCalledTimes(1);
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getEntries()).toEqual([]);
    stop();
    store.add(entry(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the same array until something changes', () => {
    const store = createActivityLog();
    store.add(entry(1));
    const afterAdd = store.getEntries();
    expect(store.getEntries()).toBe(afterAdd); // reading never makes a new array, so a React store sees no change
    store.add(entry(2));
    expect(store.getEntries()).not.toBe(afterAdd);
    const afterSecond = store.getEntries();
    store.clear();
    expect(store.getEntries()).not.toBe(afterSecond);
    const empty = store.getEntries();
    store.clear(); // clearing an empty store is not a change
    expect(store.getEntries()).toBe(empty);
  });

  it('writes nothing to storage', () => {
    const set = jest.spyOn(Storage.prototype, 'setItem');
    const store = createActivityLog();
    store.add(entry(1));
    store.clear();
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});
