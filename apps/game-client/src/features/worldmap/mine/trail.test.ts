// The browser's own trail of rooms seen: exit sets and visits per title, where each exit led, persisted to the key/value store, bounded.
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import { createTrail, MAX_VARIANTS, titleKey, TRAIL_KEY_PREFIX } from './trail';

const signal = new AbortController().signal;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('titleKey', () => {
  it('ignores case and spacing', () => {
    expect(titleKey('  The   Hall ')).toBe('the hall');
    expect(titleKey(undefined as unknown as string)).toBe('');
  });
});

describe('createTrail', () => {
  it('counts visits per exit set and keeps the sector', async () => {
    const trail = createTrail(memoryKvStore());
    trail.seen('dsl', { room: 'The Hall', sector: 'inside', exits: ['s', 'N'] });
    trail.seen('dsl', { room: 'the  hall', exits: ['N', 'S'] });
    trail.seen('dsl', { room: 'The Hall', exits: ['N'] });
    await settle();
    const found = await trail.find('dsl', { title: 'THE HALL', exits: ['N', 'S'] }, signal);
    expect(found.map((r) => [r.exits, r.visits, r.sameExits, r.sector, r.source])).toEqual([
      [['N', 'S'], 2, true, 'inside', 'browser'],
      [['N'], 1, false, undefined, 'browser'],
    ]);
  });

  it('ignores darkness, blank titles and a move with nothing to say', async () => {
    const trail = createTrail(memoryKvStore());
    trail.seen('dsl', { room: 'darkness' });
    trail.seen('dsl', {});
    trail.moved('dsl', { room: 'A' }, 'n', { room: 'darkness' });
    trail.moved('dsl', { room: ' ' }, 'n', { room: 'B' });
    trail.moved('dsl', { room: 'A' }, ' ', { room: 'B' });
    trail.moved('dsl', { room: 'A' }, 'n', {});
    await settle();
    trail.moved('dsl', {}, 'n', { room: 'B' });
    await settle();
    expect(await trail.find('dsl', { title: 'A', exits: [] }, signal)).toEqual([]);
    expect(await trail.find('dsl', { title: 'darkness', exits: [] }, signal)).toEqual([]);
  });

  it('takes a room seen with no exit list as a room with none', async () => {
    const trail = createTrail(memoryKvStore());
    trail.seen('dsl', { room: 'Bare' });
    await settle();
    expect((await trail.find('dsl', { title: 'Bare', exits: [] }, signal)).map((r) => [r.exits, r.sameExits])).toEqual([[[], true]]);
  });

  it('records where an exit led, keeping the latest answer for a direction', async () => {
    const trail = createTrail(memoryKvStore());
    trail.moved('dsl', { room: 'Hall', exits: ['N', 'E'], sector: 'city' }, 'n', { room: 'Study', exits: ['S'] });
    trail.moved('dsl', { room: 'Hall', exits: ['N', 'E'] }, 'e', { room: 'Yard' });
    trail.moved('dsl', { room: 'Hall', exits: ['N', 'E'] }, 'n', { room: 'Library' });
    await settle();
    const [hall] = await trail.find('dsl', { title: 'Hall', exits: ['E', 'N'] }, signal);
    expect(hall.neighbours).toEqual([
      { dir: 'N', title: 'Library' },
      { dir: 'E', title: 'Yard' },
    ]);
    expect(hall.sector).toBe('city');
  });

  it('keeps worlds apart', async () => {
    const trail = createTrail(memoryKvStore());
    trail.seen('dsl', { room: 'Hall', exits: ['N'] });
    await settle();
    expect(await trail.find('sandbox', { title: 'Hall', exits: ['N'] }, signal)).toEqual([]);
  });

  it('writes what changed on flush, and a new trail over the same store finds it', async () => {
    const kv = memoryKvStore();
    const trail = createTrail(kv);
    trail.seen('dsl', { room: 'Hall', exits: ['N'] });
    await settle();
    expect(await kv.keys()).toEqual([]); // nothing is written before a flush
    await trail.flush();
    expect(await kv.keys()).toEqual([`${TRAIL_KEY_PREFIX}dsl|hall`]);
    await trail.flush(); // nothing changed: nothing more to write
    const later = createTrail(kv);
    expect((await later.find('dsl', { title: 'Hall', exits: ['N'] }, signal))[0]).toMatchObject({ visits: 1, sameExits: true });
    later.seen('dsl', { room: 'Hall', exits: ['N'] });
    await settle();
    expect((await later.find('dsl', { title: 'Hall', exits: ['N'] }, signal))[0].visits).toBe(2);
  });

  it('starts over from a stored record that is not a record', async () => {
    const kv = memoryKvStore({ [`${TRAIL_KEY_PREFIX}dsl|hall`]: { nonsense: true } });
    const trail = createTrail(kv);
    trail.seen('dsl', { room: 'Hall', exits: ['N'] });
    await settle();
    expect((await trail.find('dsl', { title: 'Hall', exits: ['N'] }, signal))[0].visits).toBe(1);
  });

  it('keeps at most MAX_VARIANTS exit sets per title, dropping the least visited', async () => {
    const trail = createTrail(memoryKvStore());
    for (let i = 0; i < 3; i += 1) trail.seen('dsl', { room: 'Maze', exits: ['U'] });
    const letters = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'D'];
    for (let mask = 1; mask <= MAX_VARIANTS + 5; mask += 1) {
      trail.seen('dsl', { room: 'Maze', exits: letters.filter((_, bit) => (mask >> bit) & 1) });
    }
    await settle();
    const kept = await trail.find('dsl', { title: 'Maze', exits: ['U'] }, signal);
    expect(kept).toHaveLength(MAX_VARIANTS);
    expect(kept[0]).toMatchObject({ exits: ['U'], visits: 3 }); // the often-seen one survived
  });

  it('answers nothing for a room it has not seen, with no exits given', async () => {
    const trail = createTrail(memoryKvStore());
    expect(await trail.find('dsl', { title: 'Nowhere', exits: [] }, signal)).toEqual([]);
    expect(trail.label).toBe('what this browser has seen');
  });
});
