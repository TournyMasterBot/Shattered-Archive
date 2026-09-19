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

describe('crafting-helper-storage order queue', () => {
  it('adds orders in FIFO order and lists them back', () => {
    const { addOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    addOrder('grondak', {
      id: 'order-2',
      itemName: 'silksteel cloth helmet',
      quantityRemaining: 2,
      quantityTotal: 2,
      qualitySpec: { kind: 'exact', value: 99 },
      createdAt: 2,
    });

    const queue = getOrderQueue('grondak');
    expect(queue.map((o) => o.id)).toEqual(['order-1', 'order-2']);
  });

  it('removes an order by id and reports whether it found one', () => {
    const { addOrder, removeOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });

    expect(removeOrder('grondak', 'not-there')).toBe(false);
    expect(removeOrder('grondak', 'order-1')).toBe(true);
    expect(getOrderQueue('grondak')).toEqual([]);
  });

  it('updates fields on an existing order in place', () => {
    const { addOrder, updateOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });

    updateOrder('grondak', 'order-1', { quantityRemaining: 5 });
    expect(getOrderQueue('grondak')[0].quantityRemaining).toBe(5);
  });

  it('isolates order queues per character', () => {
    const { addOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    expect(getOrderQueue('riaghan')).toEqual([]);
  });

  it('round-trips the queue through a fresh module instance, debounced', () => {
    const first = freshStorage();
    first.addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond gem pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    jest.advanceTimersByTime(500);

    const second = freshStorage();
    expect(second.getOrderQueue('grondak')).toHaveLength(1);
    expect(second.getOrderQueue('grondak')[0].itemName).toBe('diamond gem pain');
  });

  it('falls back to an empty queue on corrupt localStorage rather than throwing', () => {
    window.localStorage.setItem('shatteredarchive.plugins.crafting-helper.orders.grondak', '{not valid json');
    const { getOrderQueue } = freshStorage();
    expect(() => getOrderQueue('grondak')).not.toThrow();
    expect(getOrderQueue('grondak')).toEqual([]);
  });
});
