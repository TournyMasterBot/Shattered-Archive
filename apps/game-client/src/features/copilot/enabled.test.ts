import { ENABLED_KEY, createEnabledStore } from './enabled';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('the Copilot switch', () => {
  it('is off in a browser that has never been asked', () => {
    expect(createEnabledStore(memory()).get()).toBe(false);
    expect(createEnabledStore(undefined).get()).toBe(false);
  });

  it('is on only for the exact stored text "true"', () => {
    expect(createEnabledStore(memory({ [ENABLED_KEY]: 'true' })).get()).toBe(true);
    for (const junk of ['false', 'TRUE', '1', 'yes', '', '{"on":true}']) {
      expect(createEnabledStore(memory({ [ENABLED_KEY]: junk })).get()).toBe(false);
    }
  });

  it('is off when the browser refuses to read', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => undefined,
    };
    expect(createEnabledStore(blocked).get()).toBe(false);
  });

  it('keeps the choice, tells every listener once per change, and stops telling one that unsubscribed', () => {
    const storage = memory();
    const store = createEnabledStore(storage);
    const a = jest.fn();
    const b = jest.fn();
    store.subscribe(a);
    const stopB = store.subscribe(b);

    store.set(true);
    expect(store.get()).toBe(true);
    expect(storage.data[ENABLED_KEY]).toBe('true');
    store.set(true); // no change, nothing to tell
    stopB();
    store.set(false);
    expect(storage.data[ENABLED_KEY]).toBe('false');
    expect(a.mock.calls).toEqual([[true], [false]]);
    expect(b.mock.calls).toEqual([[true]]);
    expect(createEnabledStore(storage).get()).toBe(false);
  });

  it('keeps the choice in memory when the browser refuses to write', () => {
    const store = createEnabledStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    store.set(true);
    expect(store.get()).toBe(true);
  });

  it('follows another tab: its change, a cleared storage (back to off), and nothing else', () => {
    const store = createEnabledStore(memory());
    const listener = jest.fn();
    store.subscribe(listener);

    store.onStorageEvent({ key: ENABLED_KEY, newValue: 'true' });
    expect(store.get()).toBe(true);
    store.onStorageEvent({ key: 'copilot.settings.v1', newValue: 'x' });
    expect(store.get()).toBe(true);
    store.onStorageEvent({ key: ENABLED_KEY, newValue: null }); // removed in the other tab
    expect(store.get()).toBe(false);
    store.onStorageEvent({ key: ENABLED_KEY, newValue: 'true' });
    store.onStorageEvent({ key: null, newValue: null }); // storage.clear()
    expect(store.get()).toBe(false);
    expect(listener.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
