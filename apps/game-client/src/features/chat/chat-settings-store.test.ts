const KEY = 'shatteredArchive.chatSettings.v1';

type Store = typeof import('./chat-settings-store');

// The store caches its settings at module level, so every test gets a fresh copy of the module.
async function load(storedJson?: string): Promise<Store> {
  localStorage.clear();
  if (storedJson !== undefined) localStorage.setItem(KEY, storedJson);
  jest.resetModules();
  return import('./chat-settings-store');
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('unreadDots setting', () => {
  it('is off when nothing is stored', async () => {
    const store = await load();

    expect(store.getChatSettings().unreadDots).toBe(false);
  });

  it('reads as off from settings stored before the field existed, and keeps the other fields', async () => {
    const store = await load(JSON.stringify({ strictChatFormat: true, enableChatPanes: true }));
    const settings = store.getChatSettings();

    expect(settings.unreadDots).toBe(false);
    expect(settings.strictChatFormat).toBe(true);
    expect(settings.enableChatPanes).toBe(true);
  });

  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['null', null],
    ['an object', {}],
    ['an array', [true]],
  ])('ignores a stored value that is not a boolean: %s', async (_label, value) => {
    const store = await load(JSON.stringify({ unreadDots: value }));

    expect(store.getChatSettings().unreadDots).toBe(false);
  });

  it('reads a stored true', async () => {
    const store = await load(JSON.stringify({ unreadDots: true }));

    expect(store.getChatSettings().unreadDots).toBe(true);
  });

  it('falls back to the defaults when the stored JSON cannot be parsed', async () => {
    const store = await load('{not json');

    expect(store.getChatSettings().unreadDots).toBe(false);
    expect(store.getChatSettings().strictChatFormat).toBe(false);
  });
});

describe('what is written to storage', () => {
  it('writes no unreadDots key while it is off, but still writes the other fields', async () => {
    const store = await load();

    store.updateChatSettings({ strictChatFormat: true });

    expect(stored()).not.toHaveProperty('unreadDots');
    expect(stored().strictChatFormat).toBe(true);
  });

  it('writes unreadDots: true when it is on and removes the key again when it is turned off', async () => {
    const store = await load();

    store.updateChatSettings({ unreadDots: true });
    expect(stored().unreadDots).toBe(true);

    store.updateChatSettings({ unreadDots: false });
    expect(stored()).not.toHaveProperty('unreadDots');
  });

  it('keeps a stored true through a save that changes another field', async () => {
    const store = await load(JSON.stringify({ unreadDots: true }));

    store.updateChatSettings({ showHiddenChatPanes: true });

    expect(stored().unreadDots).toBe(true);
    expect(stored().showHiddenChatPanes).toBe(true);
  });

  it('does not store the default for someone who never turned it on, even after setChatSettings with a full object', async () => {
    const store = await load();

    store.setChatSettings({ ...store.getChatSettings(), enableChatPanes: true });

    expect(stored()).not.toHaveProperty('unreadDots');
    expect(store.getChatSettings().unreadDots).toBe(false);
  });
});

describe('the other settings survive the way unreadDots is stored (SETTINGS-04)', () => {
  it('keeps the per-pane flags and the pane order through a save', async () => {
    const store = await load();

    store.updateChatSettings({ enabledPanes: { tell: false } as never, paneOrder: ['gossip', 'tell'] });

    expect(stored().enabledPanes).toMatchObject({ tell: false, gossip: true });
    expect((stored().paneOrder as string[]).slice(0, 2)).toEqual(['gossip', 'tell']);
    expect(store.getChatSettings().enabledPanes.tell).toBe(false);
  });

  it('gives every update its own enabledPanes object and never changes the one it replaced', async () => {
    const store = await load();
    const before = store.getChatSettings().enabledPanes;
    expect(before.tell).toBe(true);

    store.updateChatSettings({ enabledPanes: { tell: false } as never });
    const after = store.getChatSettings().enabledPanes;

    expect(after).not.toBe(before); // ChatPane memoises on this object's identity
    expect(after.tell).toBe(false);
    expect(before.tell).toBe(true);
  });

  it('does not let a stored per-pane flag change the shipped defaults that later settings start from', async () => {
    const store = await load(JSON.stringify({ enabledPanes: { tell: false } }));
    expect(store.getChatSettings().enabledPanes.tell).toBe(false);

    // settings that carry no per-pane flags at all start from the defaults, which must still say tell is on
    store.setChatSettings({ ...store.getChatSettings(), enabledPanes: undefined as never });

    expect(store.getChatSettings().enabledPanes.tell).toBe(true);
  });

  it('reads stored per-pane flags and ignores a flag that is not a boolean', async () => {
    const store = await load(JSON.stringify({ enabledPanes: { tell: false, gossip: 'no' } }));
    const { enabledPanes } = store.getChatSettings();

    expect(enabledPanes.tell).toBe(false);
    expect(enabledPanes.gossip).toBe(true);
  });

  it('reads a stored pane order, dropping unknown and repeated entries and appending the missing panes', async () => {
    const store = await load(JSON.stringify({ paneOrder: ['gossip', 'nonsense', 'gossip', 'tell', 42] }));
    const { paneOrder } = store.getChatSettings();

    expect(paneOrder.slice(0, 2)).toEqual(['gossip', 'tell']);
    expect(paneOrder).toHaveLength(store.KNOWN_CHAT_SUBTYPES.length);
    expect(new Set(paneOrder).size).toBe(paneOrder.length);
  });
});

describe('subscribers and failure to save', () => {
  it('notifies subscribers with a new settings object that carries the changed value', async () => {
    const store = await load();
    const seen: Array<{ unreadDots: boolean }> = [];
    const off = store.subscribeChatSettings((s) => seen.push(s));
    const first = seen[0];

    store.updateChatSettings({ unreadDots: true });

    expect(first.unreadDots).toBe(false); // subscribeChatSettings calls back once with the current settings
    expect(seen).toHaveLength(2);
    expect(seen[1].unreadDots).toBe(true);
    expect(seen[1]).not.toBe(first);

    off();
    store.updateChatSettings({ unreadDots: false });
    expect(seen).toHaveLength(2);
  });

  it('keeps the in-memory settings and still notifies when storage rejects the write', async () => {
    const store = await load();
    const seen: boolean[] = [];
    store.subscribeChatSettings((s) => seen.push(s.unreadDots));
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => store.updateChatSettings({ unreadDots: true })).not.toThrow();

    expect(store.getChatSettings().unreadDots).toBe(true);
    expect(seen).toEqual([false, true]);
  });
});
