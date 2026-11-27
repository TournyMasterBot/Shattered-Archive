import {
  DEFAULT_SETTINGS,
  GHOSTS_BY_MODE,
  SETTINGS_KEY,
  __resetSharedSettingsForTests,
  createSettingsStore,
  parseSettings,
  sharedSettings,
} from './settings';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('parseSettings', () => {
  it('reads a stored object and falls back per field', () => {
    // a layout saved by an earlier version (squares or hexagons) is ignored: every room is an octagon now
    expect(parseSettings(JSON.stringify({ floors: 'all', layout: 'hex', labels: false }))).toEqual({
      floors: 'all',
      labels: false,
      fog: 'off',
      here: true,
    });
    expect(parseSettings(JSON.stringify({ fog: 'user' })).fog).toBe('user');
    expect(parseSettings(JSON.stringify({ here: false })).here).toBe(false);
    expect(parseSettings(JSON.stringify({ here: 'no' })).here).toBe(true); // not a yes or no: the default
    expect(parseSettings(JSON.stringify({ fog: 'character' })).fog).toBe('character');
    expect(parseSettings(JSON.stringify({ fog: 'everyone' })).fog).toBe('off');
    expect(parseSettings(JSON.stringify({ floors: 'sideways', layout: 7, labels: 'yes' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ layout: 'hex' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the defaults for nothing, damaged text, and values that are not objects', () => {
    expect(parseSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('{ not json')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('"text"')).toBe(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toBe(DEFAULT_SETTINGS);
  });

  it('starts with the nearby floors shown, squares and labels on', () => {
    // fog of war is off until the player turns it on; the red "you are here" dot is on
    expect(DEFAULT_SETTINGS).toEqual({ floors: 'near', labels: true, fog: 'off', here: true });
    expect(GHOSTS_BY_MODE).toEqual({ this: 0, near: 2, all: 8 });
  });
});

describe('createSettingsStore', () => {
  it('keeps the fog of war choice, and never takes anything but its three choices', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(storage);
    expect(store.get().fog).toBe('off');
    store.set({ fog: 'character' });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).fog).toBe('character');
    expect(createSettingsStore(storage).get().fog).toBe('character');
    store.set({ fog: 'nonsense' as never });
    expect(store.get().fog).toBe('off');
  });

  it('starts from what is stored, changes by patch, saves and tells its listeners', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ floors: 'this', layout: 'grid', labels: true }));
    const store = createSettingsStore(storage);
    expect(store.get().floors).toBe('this');
    const listener = jest.fn();
    const stop = store.subscribe(listener);
    store.set({ labels: false });
    expect(store.get()).toEqual({ floors: 'this', labels: false, fog: 'off', here: true });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual(store.get());
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.set({ labels: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('gives a new object for every change (so a React subscription sees it) and keeps the same one when nothing is asked', () => {
    const store = createSettingsStore(new MemoryStorage());
    const before = store.get();
    expect(store.get()).toBe(before);
    store.set({ labels: false });
    expect(store.get()).not.toBe(before);
  });

  it('refuses a value outside the choices', () => {
    const store = createSettingsStore(new MemoryStorage());
    store.set({ floors: 'everywhere' as never });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('works without storage and when storage throws', () => {
    const none = createSettingsStore(null);
    none.set({ labels: false });
    expect(none.get().labels).toBe(false);
    const broken = createSettingsStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.get()).toEqual(DEFAULT_SETTINGS);
    broken.set({ labels: false });
    expect(broken.get().labels).toBe(false);
  });
});

describe('sharedSettings', () => {
  it('is one store for the page until it is reset for a test', () => {
    window.localStorage.clear();
    __resetSharedSettingsForTests();
    const first = sharedSettings();
    expect(sharedSettings()).toBe(first);
    __resetSharedSettingsForTests();
    expect(sharedSettings()).not.toBe(first);
  });

  it('is built on the browser storage', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ floors: 'all', layout: 'grid', labels: true }));
    __resetSharedSettingsForTests();
    expect(sharedSettings().get().floors).toBe('all');
    window.localStorage.clear();
    __resetSharedSettingsForTests();
  });

  it('survives a browser that blocks storage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    __resetSharedSettingsForTests();
    expect(sharedSettings().get()).toEqual(DEFAULT_SETTINGS);
    if (original) Object.defineProperty(window, 'localStorage', original);
    else delete (window as unknown as Record<string, unknown>).localStorage;
    __resetSharedSettingsForTests();
  });
});
