import { DEFAULT_FOCUS, FOCUS_KEY, FOCUS_LABELS, createFocusStore } from './focus';

class Store {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

describe('createFocusStore', () => {
  it('is Training until the AI agent is chosen, and says so in words', () => {
    expect(DEFAULT_FOCUS).toBe('training');
    expect(createFocusStore(new Store()).get()).toBe('training');
    expect(FOCUS_LABELS).toEqual({ training: 'Training', agent: 'AI agent' });
  });

  it('reads only the exact stored text `agent` as the agent: anything else, damaged or blocked, is Training', () => {
    const stored = (value: string) => {
      const s = new Store();
      s.setItem(FOCUS_KEY, value);
      return createFocusStore(s).get();
    };
    expect(stored('agent')).toBe('agent');
    for (const bad of ['Agent', 'AGENT', 'true', '', 'driving', '{"focus":"agent"}']) expect(stored(bad)).toBe('training');
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(createFocusStore(blocked).get()).toBe('training');
    expect(createFocusStore(undefined).get()).toBe('training');
  });

  it('saves a change, tells the listeners once, and does nothing for the value it already has', () => {
    const storage = new Store();
    const store = createFocusStore(storage);
    const seen: string[] = [];
    store.subscribe((f) => seen.push(f));
    store.set('agent');
    store.set('agent');
    expect(storage.data.get(FOCUS_KEY)).toBe('agent');
    expect(seen).toEqual(['agent']);
    store.set('training');
    expect(seen).toEqual(['agent', 'training']);
    expect(createFocusStore(storage).get()).toBe('training'); // what was stored last
  });

  it('keeps the choice for the page when the storage blocks the write, and stops telling a listener that unsubscribed', () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    const store = createFocusStore(blocked);
    const seen: string[] = [];
    const stop = store.subscribe((f) => seen.push(f));
    store.set('agent');
    expect(store.get()).toBe('agent');
    stop();
    store.set('training');
    expect(seen).toEqual(['agent']);
  });

  it('follows another tab through the storage event, and a cleared storage is Training', () => {
    const store = createFocusStore(new Store());
    store.onStorageEvent({ key: FOCUS_KEY, newValue: 'agent' });
    expect(store.get()).toBe('agent');
    store.onStorageEvent({ key: 'something.else', newValue: 'training' });
    expect(store.get()).toBe('agent'); // another key: not ours
    store.onStorageEvent({ key: FOCUS_KEY, newValue: 'nonsense' });
    expect(store.get()).toBe('training');
    store.onStorageEvent({ key: FOCUS_KEY, newValue: 'agent' });
    store.onStorageEvent({ key: null, newValue: null });
    expect(store.get()).toBe('training');
  });
});
