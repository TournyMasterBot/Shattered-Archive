type UnreadStore = typeof import('./chat-unread-store');

// The store keeps its state at module level, so every test gets a fresh copy of the module.
async function load(): Promise<UnreadStore> {
  jest.resetModules();
  return import('./chat-unread-store');
}

describe('chat unread store', () => {
  it('starts switched off with no baseline and nothing seen', async () => {
    const store = await load();

    expect(store.getUnreadState()).toEqual({ armed: false, baseline: 0, seen: {} });
  });

  it('arming takes the baseline from the newest message id', async () => {
    const store = await load();

    store.armUnread(41);

    expect(store.getUnreadState()).toEqual({ armed: true, baseline: 41, seen: {} });
  });

  it('arming again while armed keeps the first baseline and tells nobody', async () => {
    const store = await load();
    store.armUnread(41);
    const seen: number[] = [];
    store.subscribeUnread((s) => seen.push(s.baseline));

    store.armUnread(99);

    expect(store.getUnreadState().baseline).toBe(41);
    expect(seen).toEqual([]);
  });

  it('records the newest id seen per pane', async () => {
    const store = await load();
    store.armUnread(10);

    store.markPaneSeen('tell', 12);
    store.markPaneSeen('gossip', 15);

    expect(store.getUnreadState().seen).toEqual({ tell: 12, gossip: 15 });
  });

  it('ignores an id that is not newer than what was seen, and tells nobody', async () => {
    const store = await load();
    store.armUnread(10);
    store.markPaneSeen('tell', 12);
    const notified: number[] = [];
    store.subscribeUnread(() => notified.push(1));

    store.markPaneSeen('tell', 12);
    store.markPaneSeen('tell', 11);

    expect(store.getUnreadState().seen).toEqual({ tell: 12 });
    expect(notified).toEqual([]);
  });

  it('records nothing while switched off', async () => {
    const store = await load();

    store.markPaneSeen('tell', 12);

    expect(store.getUnreadState().seen).toEqual({});
  });

  it('disarming forgets the baseline and what was seen', async () => {
    const store = await load();
    store.armUnread(10);
    store.markPaneSeen('tell', 12);

    store.disarmUnread();

    expect(store.getUnreadState()).toEqual({ armed: false, baseline: 0, seen: {} });
  });

  it('disarming while already off tells nobody', async () => {
    const store = await load();
    const notified: number[] = [];
    store.subscribeUnread(() => notified.push(1));

    store.disarmUnread();

    expect(notified).toEqual([]);
  });

  it('switching off and on again starts from the then-current history (UNREAD-01)', async () => {
    const store = await load();
    store.armUnread(10);
    store.markPaneSeen('tell', 12);
    store.disarmUnread();

    store.armUnread(50);

    expect(store.getUnreadState()).toEqual({ armed: true, baseline: 50, seen: {} });
  });

  it('keeps its state when a view unsubscribes and a new one subscribes, as a remounted ChatPane does (UNREAD-01)', async () => {
    const store = await load();
    store.armUnread(10);
    store.markPaneSeen('tell', 12);
    const first = store.subscribeUnread(() => undefined);
    first();

    const second: Array<number | undefined> = [];
    const off = store.subscribeUnread((s) => second.push(s.seen.tell));
    store.markPaneSeen('tell', 20);

    expect(store.getUnreadState()).toEqual({ armed: true, baseline: 10, seen: { tell: 20 } });
    expect(second).toEqual([20]);
    off();
  });

  it('notifies a subscriber once per change and not after it unsubscribes', async () => {
    const store = await load();
    const seen: boolean[] = [];
    const off = store.subscribeUnread((s) => seen.push(s.armed));

    store.armUnread(1);
    store.markPaneSeen('tell', 2);
    expect(seen).toEqual([true, true]);

    off();
    store.disarmUnread();
    expect(seen).toEqual([true, true]);
  });
});
