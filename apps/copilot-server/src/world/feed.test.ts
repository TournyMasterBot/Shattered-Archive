import type { FeedEvent } from '@shatteredarchive/copilot-core';
import { commandEvent, linesEvent, MemoryWorldIo, roomEvent, viewEvents } from '../testing/worldFixtures';
import { createWorldFeed, playDay } from './feed';
import { WorldMemory } from './memory';
import type { Labeler } from './parseRoom';

const T0 = Date.parse('2026-11-05T10:00:00Z');

async function setup(character: string | null = 'Agate-F', label?: Labeler) {
  const io = new MemoryWorldIo();
  const { memory } = await WorldMemory.open({
    io,
    file: '/data/world.json',
    baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
    random: (() => {
      let n = 0;
      return () => ((n += 1) * 0.173) % 1;
    })(),
  });
  const state = { character, refreshed: 0 };
  const feed = createWorldFeed({
    memory,
    character: () => state.character ?? undefined,
    label: label ?? (() => 'unknown'),
    refreshNames: () => (state.refreshed += 1),
  });
  return { memory, feed, state, io };
}

const hall = (at: number, extra: Partial<Parameters<typeof viewEvents>[1]> = {}): FeedEvent[] =>
  viewEvents(at, { title: 'Hall', gmcpExits: ['N'], exitWords: ['north'], ...extra });
const study = (at: number): FeedEvent[] => viewEvents(at, { title: 'Study', gmcpExits: ['S'], exitWords: ['south'] });

describe('createWorldFeed', () => {
  it('stores the room of a view: the text before the room event, with its play day', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0, { contents: ['     A brass bell.'] }));
    const rooms = memory.candidates().continents[0].areas[0].subzones[0].rooms;
    expect(rooms).toHaveLength(1);
    expect(memory.room(rooms[0].id)).toMatchObject({
      title: 'Hall',
      visits: 1,
      days: 1,
      transient: [{ label: 'A brass bell.', firstSeen: '2026-11-05' }],
    });
    expect(playDay(T0)).toBe('2026-11-05');
  });

  it('keeps the text of a view that arrives in an earlier batch than its room event', async () => {
    const { memory, feed } = await setup();
    const [text, room] = hall(T0, { contents: ['     A brass bell.'] });
    await feed.handle([text]);
    await feed.handle([room]);
    const id = memory.current!.id;
    expect(memory.room(id)!.transient.map((c) => c.label)).toEqual(['A brass bell.']);
  });

  it('follows one movement command into a link, the way back confirms it', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0));
    await feed.handle([commandEvent(T0 + 1, 'north'), ...study(T0 + 2)]);
    await feed.handle([commandEvent(T0 + 3, 's'), ...hall(T0 + 4)]);
    const id = memory.candidates().continents[0].areas[0].subzones[0].rooms[0].id;
    expect(memory.room(id)!.exits[0]).toMatchObject({
      dir: 'N',
      state: 'confirmed',
      confidence: 0.95,
      toTitle: 'Study',
    });
    expect(memory.stats).toMatchObject({ newRooms: 2, matched: 1, traversals: 2 });
  });

  it('records no link when more than one movement command came before the view (a move failed or rooms were skipped)', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0));
    await feed.handle([commandEvent(T0 + 1, 'east'), commandEvent(T0 + 2, 'north'), ...study(T0 + 3)]);
    expect(memory.stats.traversals).toBe(0);
    await feed.handle([commandEvent(T0 + 4, 'south'), commandEvent(T0 + 5, 'south'), ...hall(T0 + 6)]);
    expect(memory.stats.traversals).toBe(0);
  });

  it('records no link when the last command was not a movement (a failed move, then a recall)', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0));
    await feed.handle([commandEvent(T0 + 1, 'north'), commandEvent(T0 + 2, 'recall'), ...study(T0 + 3)]);
    expect(memory.stats.traversals).toBe(0);
    await feed.handle([commandEvent(T0 + 4, 'south'), commandEvent(T0 + 5, 'look'), ...hall(T0 + 6)]);
    expect(memory.stats.traversals).toBe(0);
  });

  it('does not count movement commands from an earlier view against the next one', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0));
    await feed.handle([commandEvent(T0 + 1, 'north'), ...study(T0 + 2)]);
    await feed.handle([commandEvent(T0 + 3, 'south'), ...hall(T0 + 4)]);
    expect(memory.stats.traversals).toBe(2); // two moves, two single-move views: nothing carried over
  });

  it('ignores vitals and other events, and text from before the last command', async () => {
    const { memory, feed } = await setup();
    await feed.handle([
      linesEvent(T0, 'Hall', '  Stale text.', '', ' [Exits: north  ]', '     A stale thing.'),
      commandEvent(T0 + 1, 'look'),
    ]);
    await feed.handle([
      {
        type: 'vitals',
        at: T0 + 2,
        vitals: { hp: 1, maxHp: 1, mana: 1, maxMana: 1, move: 1, maxMove: 1 },
        inFight: false,
      },
      ...hall(T0 + 3),
    ]);
    const id = memory.current!.id;
    expect(memory.room(id)!.transient).toEqual([]);
  });

  it('a login or a session event ends the session: the next view is not an arrival', async () => {
    const { memory, feed } = await setup();
    await feed.handle(hall(T0));
    await feed.handle([
      commandEvent(T0 + 1, 'north'),
      { type: 'session', at: T0 + 2, state: 'closed' },
      ...study(T0 + 3),
    ]);
    expect(memory.stats.traversals).toBe(0);
    await feed.handle([commandEvent(T0 + 4, 's'), { type: 'login', at: T0 + 5, name: 'ignored' }, ...hall(T0 + 6)]);
    expect(memory.stats.traversals).toBe(0);
    expect(memory.counts.rooms).toBe(2);
  });

  it('a session event forgets the text and commands collected so far', async () => {
    const { memory, feed } = await setup();
    await feed.handle([
      commandEvent(T0, 'north'),
      linesEvent(T0, 'Hall', '  Old.', '', ' [Exits: north  ]', '     A ghost.'),
    ]);
    await feed.handle([{ type: 'session', at: T0 + 1, state: 'connected' }, ...hall(T0 + 2)]);
    expect(memory.room(memory.current!.id)!.transient).toEqual([]);
  });

  it('stores nothing without a registered character, and counts the view as refused', async () => {
    const { memory, feed, state } = await setup(null);
    await feed.handle(hall(T0));
    expect(memory.counts.rooms).toBe(0);
    expect(memory.stats.refused).toBe(1);
    state.character = 'Agate-F';
    await feed.handle(hall(T0 + 1));
    expect(memory.counts.rooms).toBe(1);
  });

  it("uses the character's codename for the session: two characters on one day are two sessions", async () => {
    const { memory, feed, state } = await setup('Agate-F');
    await feed.handle(hall(T0));
    state.character = 'Jade-M';
    await feed.handle([commandEvent(T0 + 1, 'north'), ...study(T0 + 2)]);
    expect(memory.stats.traversals).toBe(0); // the first character's room is not this character's origin
    expect(memory.room(memory.candidates().continents[0].areas[0].subzones[0].rooms[0].id)).toMatchObject({
      visits: 1,
    });
  });

  it('labels contents through the labeler and asks for the names on each room view', async () => {
    const { memory, feed, state } = await setup('Agate-F', (text, placement) =>
      placement === 'object' ? 'item' : 'mob',
    );
    await feed.handle(hall(T0, { contents: ['     A brass bell.', 'A grey rat sniffs about.'] }));
    expect(state.refreshed).toBe(1);
    expect(memory.room(memory.current!.id)!.transient.map((c) => [c.label, c.kind])).toEqual([
      ['A brass bell.', 'item'],
      ['A grey rat sniffs about.', 'mob'],
    ]);
    await feed.handle(study(T0 + 1));
    expect(state.refreshed).toBe(2);
  });

  it('works without a refresh callback', async () => {
    const { memory } = await setup();
    const feed = createWorldFeed({ memory, character: () => 'Agate-F', label: () => 'unknown' });
    await feed.handle(hall(T0));
    expect(memory.counts.rooms).toBe(1);
  });

  it('keeps only a bounded window of events while it waits for a room event', async () => {
    const { memory, feed } = await setup();
    const noise = Array.from({ length: 500 }, (_, i) => linesEvent(T0 + i, `noise ${i}`));
    await feed.handle(noise);
    await feed.handle(hall(T0 + 1000));
    expect(memory.room(memory.current!.id)).toMatchObject({ title: 'Hall', visits: 1 });
  });

  it('counts a room event with no text before it as a view with absent text', async () => {
    const { memory, feed } = await setup();
    await feed.handle([roomEvent(T0, 'Hall', ['N'])]);
    expect(memory.stats).toMatchObject({ views: 1, textAbsent: 1 });
  });

  it('the play day is the UTC date of the event', () => {
    expect(playDay(Date.parse('2026-11-05T23:59:59Z'))).toBe('2026-11-05');
    expect(playDay(Date.parse('2026-11-06T00:00:00Z'))).toBe('2026-11-06');
  });
});

describe('createWorldFeed: where the next views are from', () => {
  it('tells the sink about each connection: the target of a connect, and a close with none, after the memory\'s session ended', async () => {
    const { feed, memory } = await setup();
    const seen: unknown[] = [];
    const ended = jest.spyOn(memory, 'endSession');
    const withHook = createWorldFeed({
      memory,
      character: () => 'Agate-F',
      label: () => 'unknown',
      onSession: (s) => seen.push([s, ended.mock.calls.length]),
    });
    await withHook.handle([
      { type: 'session', at: T0, state: 'connected', target: 'dsl-mud.org:4000' },
      { type: 'session', at: T0 + 1, state: 'closed', code: 1001 },
      { type: 'session', at: T0 + 2, state: 'connected' },
    ]);
    expect(seen).toEqual([
      [{ state: 'connected', target: 'dsl-mud.org:4000' }, 1],
      [{ state: 'closed' }, 2],
      [{ state: 'connected' }, 3],
    ]);
    await feed.handle([{ type: 'session', at: T0, state: 'connected', target: 'x:1' }]); // a feed with no hook ignores the target
  });
});
