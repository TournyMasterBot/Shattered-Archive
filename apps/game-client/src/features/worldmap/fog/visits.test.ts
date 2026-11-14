// The rooms visited, per world, account and character: written once on the first visit, read once, two levels from the same records.
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import type { Scope } from './identity';
import { createVisitStore, VISIT_PREFIX } from './visits';

const scope = (character: string, extra: Partial<Scope> = {}): Scope => ({ world: 'dsl', account: 'acct-1', character, ...extra });

describe('createVisitStore', () => {
  it('records a visit once, writes only the first, and says whether it was new', async () => {
    const kv = memoryKvStore();
    const set = jest.spyOn(kv, 'set');
    const store = createVisitStore(kv);
    expect(await store.record(scope('Aldric-M'), 'r1')).toBe(true);
    expect(await store.record(scope('Aldric-M'), 'r1')).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
    expect(await kv.keys()).toEqual([`${VISIT_PREFIX}dsl|acct-1|Aldric-M|r1`]);
  });

  it('answers the character level for one character and the user level for all characters of the account', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scope('Aldric-M'), 'r1');
    await store.record(scope('Aldric-M'), 'r2');
    await store.record(scope('Mira-F'), 'r2');
    await store.record(scope('Mira-F'), 'r3');
    expect([...store.visited(scope('Aldric-M'), 'character')].sort()).toEqual(['r1', 'r2']);
    expect([...store.visited(scope('Mira-F'), 'character')].sort()).toEqual(['r2', 'r3']);
    expect([...store.visited(scope('Mira-F'), 'user')].sort()).toEqual(['r1', 'r2', 'r3']);
    expect(store.visited(scope('Nobody-U'), 'character').size).toBe(0);
  });

  it('keeps worlds and accounts apart', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scope('Aldric-M'), 'r1');
    await store.record(scope('Aldric-M', { world: 'sandbox' }), 'r5');
    await store.record(scope('Aldric-M', { account: 'acct-2' }), 'r6');
    expect([...store.visited(scope('Aldric-M'), 'user')]).toEqual(['r1']);
    expect([...store.visited(scope('Aldric-M', { world: 'sandbox' }), 'user')]).toEqual(['r5']);
    expect([...store.visited(scope('Aldric-M', { account: 'acct-2' }), 'user')]).toEqual(['r6']);
  });

  it('counts a visit with no character name for the account level only', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scope(''), 'r1');
    await store.record(scope('Aldric-M'), 'r2');
    expect([...store.visited(scope('Aldric-M'), 'character')]).toEqual(['r2']);
    expect([...store.visited(scope('Aldric-M'), 'user')].sort()).toEqual(['r1', 'r2']);
  });

  it('reads what an earlier page stored, once, and ignores keys that are not visits', async () => {
    const kv = memoryKvStore({
      [`${VISIT_PREFIX}dsl|acct-1|Aldric-M|r1`]: 1,
      [`${VISIT_PREFIX}dsl|acct-1|Aldric-M|r2`]: 1,
      [`${VISIT_PREFIX}dsl|acct-1|Mira-F|r9`]: 1,
      [`${VISIT_PREFIX}dsl|acct-2|Mira-F|rX`]: 1, // another account
      [`${VISIT_PREFIX}dsl|acct-1|Mira-F|Bad Id!`]: 1, // not a room id
      [`${VISIT_PREFIX}dsl|acct-1|%E0%A4%A|r4`]: 1, // not valid text
      [`${VISIT_PREFIX}dsl|acct-1|Mira-F|r5|extra`]: 1, // not this shape
      [`${VISIT_PREFIX}dsl|acct-1|only`]: 1, // not this shape
      'layer|dsl': { version: 1 },
      'trail|dsl|hall': {},
    });
    const keys = jest.spyOn(kv, 'keys');
    const store = createVisitStore(kv);
    expect(store.visited(scope('Aldric-M'), 'user').size).toBe(0); // nothing is known before it is loaded
    await store.load(scope('Aldric-M'));
    await store.load(scope('Mira-F'));
    expect(keys).toHaveBeenCalledTimes(1);
    expect([...store.visited(scope('Aldric-M'), 'user')].sort()).toEqual(['r1', 'r2', 'r9']);
    const again = createVisitStore(kv);
    expect(await again.record(scope('Aldric-M'), 'r1')).toBe(false); // already stored
  });

  it('refuses a room id that is not an id, and writes nothing', async () => {
    const kv = memoryKvStore();
    const store = createVisitStore(kv);
    expect(await store.record(scope('Aldric-M'), 'Not An Id')).toBe(false);
    expect(await store.record(scope('Aldric-M'), '')).toBe(false);
    expect(await kv.keys()).toEqual([]);
  });

  it('tells listeners after a load and after a new visit, not after a repeat, and stops when unsubscribed', async () => {
    const store = createVisitStore(memoryKvStore());
    const heard = jest.fn();
    const off = store.subscribe(heard);
    await store.record(scope('Aldric-M'), 'r1'); // the load, then the visit
    expect(heard).toHaveBeenCalledTimes(2);
    await store.record(scope('Aldric-M'), 'r1');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    await store.record(scope('Aldric-M'), 'r2');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('keeps two quick visits of one new room to a single write', async () => {
    const kv = memoryKvStore();
    const set = jest.spyOn(kv, 'set');
    const store = createVisitStore(kv);
    const results = await Promise.all([store.record(scope('Aldric-M'), 'r1'), store.record(scope('Aldric-M'), 'r1')]);
    expect(results.sort()).toEqual([false, true]);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('returns copies: changing what was returned does not change the store', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scope('Aldric-M'), 'r1');
    (store.visited(scope('Aldric-M'), 'character') as Set<string>).add('hack');
    (store.visited(scope('Aldric-M'), 'user') as Set<string>).add('hack');
    expect([...store.visited(scope('Aldric-M'), 'user')]).toEqual(['r1']);
  });

  describe('the backup: byCharacter and addMany', () => {
    it('lists every character sorted, as copies, and nothing for an unknown account', async () => {
      const store = createVisitStore(memoryKvStore());
      await store.record(scope('Aldric-M'), 'r2');
      await store.record(scope('Aldric-M'), 'r1');
      await store.record(scope('Mira-F'), 'r3');
      const listed = store.byCharacter(scope('Aldric-M'));
      expect(listed).toEqual({ 'Aldric-M': ['r1', 'r2'], 'Mira-F': ['r3'] });
      listed['Aldric-M']!.push('hack');
      expect(store.byCharacter(scope('Aldric-M'))['Aldric-M']).toEqual(['r1', 'r2']);
      expect(store.byCharacter(scope('x', { account: 'other' }))).toEqual({});
    });

    it('adds rooms visited elsewhere, writes only the new ones and reports how many were new', async () => {
      const kv = memoryKvStore();
      const store = createVisitStore(kv);
      await store.record(scope('Aldric-M'), 'r1');
      const set = jest.spyOn(kv, 'set');
      const added = await store.addMany(scope('Aldric-M'), { 'Aldric-M': ['r1', 'r2'], 'Mira-F': ['r2', 'r3'] });
      expect(added).toBe(3);
      expect(set).toHaveBeenCalledTimes(3);
      expect(store.byCharacter(scope('Aldric-M'))).toEqual({ 'Aldric-M': ['r1', 'r2'], 'Mira-F': ['r2', 'r3'] });
      expect((await kv.keys()).sort()).toEqual(
        ['r1', 'r2'].map((r) => `${VISIT_PREFIX}dsl|acct-1|Aldric-M|${r}`).concat(['r2', 'r3'].map((r) => `${VISIT_PREFIX}dsl|acct-1|Mira-F|${r}`)).sort(),
      );
    });

    it('skips ids that are not room ids, keeps an empty character name, and stays quiet when nothing was new', async () => {
      const store = createVisitStore(memoryKvStore());
      await store.load(scope('x'));
      const listener = jest.fn();
      store.subscribe(listener);
      expect(await store.addMany(scope('x'), { '': ['r9', 'Not An Id', '../x'] })).toBe(1);
      expect(store.byCharacter(scope('x'))).toEqual({ '': ['r9'] });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(await store.addMany(scope('x'), { '': ['r9'] })).toBe(0);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('writes a large backup in groups and survives a reload from the stored keys', async () => {
      const kv = memoryKvStore();
      const ids = Array.from({ length: 1234 }, (_, i) => `room-${i}`);
      expect(await createVisitStore(kv).addMany(scope('Aldric-M'), { 'Aldric-M': ids })).toBe(1234);
      const reloaded = createVisitStore(kv);
      await reloaded.load(scope('Aldric-M'));
      expect(reloaded.visited(scope('Aldric-M'), 'user').size).toBe(1234);
    });
  });
});
