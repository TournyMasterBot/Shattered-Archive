import { DEFAULT_SETTINGS, ruleKey } from '@shatteredarchive/copilot-core';
import { SETTINGS_KEY, createSettingsStore, type KeyValueStorage } from './settings';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const INFO = ruleKey('world', 'info');
const edited = { ...DEFAULT_SETTINGS, rules: { [INFO]: { enabled: true, threshold: 0.95 } } };

function make(initial?: string) {
  const storage = new MemoryStorage();
  if (initial !== undefined) storage.data.set(SETTINGS_KEY, initial);
  const warnings: string[] = [];
  const store = createSettingsStore(storage, (m) => warnings.push(m));
  return { storage, store, warnings };
}

describe('loading', () => {
  it('starts with the defaults when nothing is stored', () => {
    expect(make().store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('reads stored settings through the normalizer (an unknown key and a never-auto rule are dropped)', () => {
    const { store } = make(JSON.stringify({ schemaVersion: 1, staleAfterSeconds: 120, rules: { [INFO]: { enabled: true, threshold: 0.95 }, 'world:spend-or-lose': { enabled: true, threshold: 0.9 } }, extra: 1 }));
    expect(store.get().staleAfterSeconds).toBe(120);
    expect(store.get().rules).toEqual({ [INFO]: { enabled: true, threshold: 0.95 } });
  });

  it('corrupt JSON gives the defaults and exactly one warning that carries no stored value', () => {
    const { store, warnings } = make('{"staleAfterSeconds": 99, not json');
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    store.onStorageEvent({ key: SETTINGS_KEY, newValue: 'still {not json' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('99');
    expect(warnings[0]).not.toContain('not json');
  });

  it('a blocked storage gives the defaults, with one warning (however often it fails), and editing still works in memory', () => {
    const warnings: string[] = [];
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const store = createSettingsStore(blocked, (m) => warnings.push(m));
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    store.set(edited);
    store.set(DEFAULT_SETTINGS);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(warnings).toEqual(['[copilot] settings storage is not available; changes last until the page closes']); // said once
  });

  it('works with no storage at all', () => {
    const store = createSettingsStore(undefined, () => undefined);
    expect(store.set(edited).rules[INFO]).toEqual({ enabled: true, threshold: 0.95 });
    expect(store.reset()).toEqual(DEFAULT_SETTINGS);
  });

  it('warns through console.warn by default', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const storage = new MemoryStorage();
      storage.data.set(SETTINGS_KEY, '{broken');
      createSettingsStore(storage);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('S1/S2: only differences are stored, compared strictly', () => {
  it('stores only what differs from the defaults', () => {
    const { store, storage } = make();
    store.set(edited);
    expect(JSON.parse(storage.data.get(SETTINGS_KEY) as string)).toEqual({ schemaVersion: 1, rules: { [INFO]: { enabled: true, threshold: 0.95 } } });
  });

  it('removes the stored key when everything is back to the defaults', () => {
    const { store, storage } = make();
    store.set(edited);
    store.set({ ...DEFAULT_SETTINGS, rules: { [INFO]: { enabled: false, threshold: 0.9 } } });
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it('a threshold typed as a string is not the default 0.9 (no coercion)', () => {
    const { store } = make();
    store.set({ ...DEFAULT_SETTINGS, rules: { [INFO]: { enabled: true, threshold: '0.9' } } });
    expect(store.get().rules[INFO]).toBeUndefined(); // unreadable value: the rule is dropped, never coerced
  });
});

describe('S3: reset replaces the live copy without a reload', () => {
  it('the live settings, the stored key and the listeners all see the defaults at once', () => {
    const { store, storage } = make();
    const seen: unknown[] = [];
    store.subscribe((s) => seen.push(s));
    store.set(edited);
    const held = store.get();
    store.reset();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(held).not.toBe(store.get());
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
    expect(seen).toEqual([edited, DEFAULT_SETTINGS]);
  });

  it('a reset when already at the defaults notifies nobody', () => {
    const { store } = make();
    const listener = jest.fn();
    store.subscribe(listener);
    store.reset();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a reset also replaces a corrupt stored value', () => {
    const { store, storage } = make('{broken');
    store.reset();
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });
});

describe('S4: one normalizer for every route', () => {
  const route = {
    editor: (store: ReturnType<typeof make>['store'], raw: unknown) => store.set(raw),
    storageEvent: (store: ReturnType<typeof make>['store'], raw: unknown) => store.onStorageEvent({ key: SETTINGS_KEY, newValue: JSON.stringify(raw) }),
  };
  const hostile = { staleAfterSeconds: 99999, rules: { [INFO]: { enabled: 'yes', threshold: 5 }, 'world:spend-or-lose': { enabled: true, threshold: 0.9 }, 'sky:info': { enabled: true, threshold: 0.9 } } };

  it.each(Object.keys(route) as (keyof typeof route)[])('%s: hostile input ends as the defaults', (name) => {
    const { store } = make();
    route[name](store, hostile);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it.each(Object.keys(route) as (keyof typeof route)[])('%s: a valid edit lands the same way', (name) => {
    const { store } = make();
    route[name](store, edited);
    expect(store.get()).toEqual(edited);
  });

  it('the storage event updates the live copy and notifies, but does not write the key again', () => {
    const { store, storage } = make();
    const listener = jest.fn();
    store.subscribe(listener);
    store.onStorageEvent({ key: SETTINGS_KEY, newValue: JSON.stringify({ schemaVersion: 1, staleAfterSeconds: 300 }) });
    expect(store.get().staleAfterSeconds).toBe(300);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it('a storage event for another key is ignored; a removed key or storage.clear() resets', () => {
    const { store } = make();
    store.set(edited);
    store.onStorageEvent({ key: 'something.else', newValue: '{}' });
    expect(store.get()).toEqual(edited);
    store.onStorageEvent({ key: SETTINGS_KEY, newValue: null });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    store.set(edited);
    store.onStorageEvent({ key: null, newValue: null });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('stops notifying a listener that unsubscribed', () => {
    const { store } = make();
    const listener = jest.fn();
    const stop = store.subscribe(listener);
    stop();
    store.set(edited);
    expect(listener).not.toHaveBeenCalled();
  });
});
