import { validateMapFile, type Direction, type MapFile, type Room } from '@shatteredarchive/shattered-maps-core';
import { MemoryWorldIo, viewEvents, type ViewSpec } from '../testing/worldFixtures';
import { parseRoomView, type ParsedRoomView } from './parseRoom';
import { WorldMemory, WORLD_FILE_VERSION, type ApplyContext, type WorldMemoryDeps } from './memory';

const FILE = '/data/world/memory.json';
const RAT = '(Glowing) A grey rat sniffs about the floor.';

function seeded(seed = 3): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function open(
  io = new MemoryWorldIo(),
  extra: Partial<WorldMemoryDeps> = {},
): Promise<{ memory: WorldMemory; io: MemoryWorldIo }> {
  const { memory } = await WorldMemory.open({
    io,
    file: FILE,
    baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
    random: seeded(),
    now: () => Date.parse('2026-11-07T12:00:00.000Z'),
    ...extra,
  });
  return { memory, io };
}

function view(spec: ViewSpec & { exits?: string[] }): ParsedRoomView {
  const { exits, ...rest } = spec;
  return parseRoomView(viewEvents(1, { ...rest, ...(exits ? { gmcpExits: exits } : {}) })) as ParsedRoomView;
}

const ctx = (day: string, character = 'Agate-F', arrivalDir?: Direction): ApplyContext => ({
  day,
  session: `${day}:${character}`,
  ...(arrivalDir ? { arrivalDir } : {}),
});

function allRooms(map: MapFile): Room[] {
  return map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));
}

function expectValid(memory: WorldMemory): void {
  const checked = validateMapFile(memory.candidates());
  expect(checked.ok ? [] : checked.errors).toEqual([]);
}

async function created(memory: WorldMemory, v: ParsedRoomView, c: ApplyContext): Promise<string> {
  const result = await memory.apply(v, c);
  if (!result.ok) throw new Error(`apply failed: ${result.reason}`);
  return result.roomId;
}

describe('what a room usually holds (D13, M1)', () => {
  const hall = (contents: string[] = [RAT]): ParsedRoomView => view({ title: 'Hall of Lanterns', contents });
  const days = ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02', '2026-11-03'];

  it('the same room visited five times on three days yields a fixture, with counts', async () => {
    const { memory } = await open();
    let id = '';
    for (const day of days) id = await created(memory, hall(), ctx(day));
    const report = memory.room(id)!;
    expect(report).toMatchObject({ id, title: 'Hall of Lanterns', sector: 'inside', visits: 5, days: 3 });
    expect(report.fixtures).toEqual([
      {
        label: 'A grey rat sniffs about the floor.',
        kind: 'unknown',
        seen: 5,
        observed: 5,
        count: 1,
        days: 3,
        firstSeen: '2026-11-01',
        lastSeen: '2026-11-03',
        returns: 0,
      },
    ]);
    expect(report.transient).toEqual([]);
    expect(memory.counts.rooms).toBe(1);
    expectValid(memory);
  });

  it('a thing seen once stays transient, and a person is never stored', async () => {
    const { memory } = await open();
    const id = await created(memory, hall([RAT, '(WANTED) Zephyr Quill is here.']), ctx('2026-11-01'));
    const report = memory.room(id)!;
    expect(report.fixtures).toEqual([]);
    expect(report.transient.map((c) => c.label)).toEqual(['A grey rat sniffs about the floor.']);
    expect(JSON.stringify(memory.candidates())).not.toContain('Zephyr');
  });

  it('a fixture absent for three visits in a row is demoted and kept as `was` (history kept)', async () => {
    const { memory } = await open();
    let id = '';
    for (const day of days) id = await created(memory, hall(), ctx(day));
    for (let i = 0; i < 3; i += 1) id = await created(memory, hall([]), ctx('2026-11-04'));
    const report = memory.room(id)!;
    expect(report.fixtures).toEqual([]);
    expect(report.was).toEqual([
      expect.objectContaining({
        label: 'A grey rat sniffs about the floor.',
        seen: 5,
        demotedOn: '2026-11-04',
        returns: 0,
      }),
    ]);
    expect(report.visits).toBe(8);
  });

  it("two characters' sessions on the same day both count", async () => {
    const { memory } = await open();
    const id = await created(memory, hall(), ctx('2026-11-01', 'Agate-F'));
    await created(memory, hall(), ctx('2026-11-01', 'Jade-M'));
    expect(memory.room(id)).toMatchObject({ visits: 2, days: 1 });
    expect(memory.room(id)!.transient[0]).toMatchObject({ seen: 2, observed: 2 });
  });

  it('a view whose text could not be tied to the room counts nothing for its contents', async () => {
    const { memory } = await open();
    const id = await created(memory, hall(), ctx('2026-11-01'));
    const mismatched = view({ title: 'Fountain Court', gmcpName: 'Hall of Lanterns', contents: ['     A decoy.'] });
    await created(memory, mismatched, ctx('2026-11-02'));
    const dark = parseRoomView([
      { type: 'lines', at: 1, lines: ['It is pitch black.'] },
      { type: 'room', at: 1, room: 'Hall of Lanterns', sector: 'inside', exits: ['N', 'S'] },
    ]) as ParsedRoomView;
    await created(memory, dark, ctx('2026-11-03'));
    const absent = parseRoomView([
      { type: 'room', at: 1, room: 'Hall of Lanterns', sector: 'inside', exits: ['N', 'S'] },
    ]) as ParsedRoomView;
    await created(memory, absent, ctx('2026-11-04'));
    const report = memory.room(id)!;
    expect(report.visits).toBe(1);
    expect(report.transient.map((c) => c.label)).toEqual(['A grey rat sniffs about the floor.']);
    expect(memory.stats).toMatchObject({
      views: 4,
      textOk: 1,
      textDisagrees: 1,
      textDark: 1,
      textAbsent: 1,
      matched: 3,
      newRooms: 1,
    });
  });

  it('keeps the first description and fills a missing sector later', async () => {
    const { memory } = await open();
    const first = view({ title: 'Hall', description: ['  The first telling.'], sector: '' });
    const id = await created(memory, first, ctx('2026-11-01'));
    expect(memory.room(id)).toMatchObject({ description: 'The first telling.' });
    expect(memory.room(id)!.sector).toBeUndefined();
    await created(
      memory,
      view({ title: 'Hall', description: ['  A later telling.'], sector: 'city' }),
      ctx('2026-11-02'),
    );
    expect(memory.room(id)).toMatchObject({ description: 'The first telling.', sector: 'city' });
  });
});

describe('who a room is (M1)', () => {
  it('a hidden exit appearing keeps one room and adds the exit', async () => {
    const { memory } = await open();
    const id = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const again = await created(memory, view({ title: 'Hall', exits: ['N', 'S'] }), ctx('2026-11-02'));
    expect(again).toBe(id);
    expect(memory.counts.rooms).toBe(1);
    expect(memory.room(id)!.exits.map((e) => [e.dir, e.state])).toEqual([
      ['N', 'unknown-target'],
      ['S', 'unknown-target'],
    ]);
    expectValid(memory);
  });

  it('exits the game names that the map has no slot for are left out, not stored', async () => {
    const { memory } = await open();
    const events = viewEvents(1, { title: 'Hall', gmcpExits: ['N', 'sideways'] });
    const id = await created(memory, parseRoomView(events) as ParsedRoomView, ctx('2026-11-01'));
    expect(memory.room(id)!.exits.map((e) => e.dir)).toEqual(['N']);
  });

  it('walking from room to room records the evidence: one way is 0.6, there and back is 0.95', async () => {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const b = await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    expect(memory.room(a)!.exits).toEqual([
      { dir: 'N', state: 'candidate', confidence: 0.6, to: b, toTitle: 'Study', traversals: 1 },
    ]);
    const back = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01', 'Agate-F', 'S'));
    expect(back).toBe(a);
    expect(memory.room(a)!.exits[0]).toMatchObject({ state: 'confirmed', confidence: 0.95 });
    expect(memory.room(b)!.exits[0]).toMatchObject({ dir: 'S', state: 'confirmed', confidence: 0.95, to: a });
    expect(memory.stats.traversals).toBe(2);
    expectValid(memory);
  });

  it('follows the exit that was taken, so a repeated title in a corridor is two rooms and the way back finds the first', async () => {
    const { memory } = await open();
    const hall = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const p1 = await created(
      memory,
      view({ title: 'Dirt Path', exits: ['N', 'S'] }),
      ctx('2026-11-01', 'Agate-F', 'N'),
    );
    const p2 = await created(
      memory,
      view({ title: 'Dirt Path', exits: ['N', 'S', 'E'] }),
      ctx('2026-11-01', 'Agate-F', 'N'),
    );
    expect(new Set([hall, p1, p2]).size).toBe(3);
    // walking back south from the second to the first: its way back already leads here, so it is the first
    const back = await created(
      memory,
      view({ title: 'Dirt Path', exits: ['N', 'S'] }),
      ctx('2026-11-01', 'Agate-F', 'S'),
    );
    expect(back).toBe(p1);
    expect(memory.counts.rooms).toBe(3);
    expectValid(memory);
  });

  it('does not take a same-titled room for the one whose way back leads somewhere else', async () => {
    const { memory } = await open();
    const x = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const cave1 = await created(memory, view({ title: 'Cave', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01', 'Agate-F', 'S')); // the way back from the cave to the hall is walked
    const z = await created(memory, view({ title: 'Road', exits: ['N'] }), ctx('2026-11-02'));
    const cave2 = await created(memory, view({ title: 'Cave', exits: ['S'] }), ctx('2026-11-02', 'Agate-F', 'N'));
    // the cave's way back leads to the hall, not to the road, so this is another cave
    expect(cave2).not.toBe(cave1);
    expect([x, z].includes(cave2)).toBe(false);
    expect(memory.counts.rooms).toBe(4);
  });

  it('does take the same-titled room when its way back leads to where the character came from', async () => {
    const { memory } = await open();
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const cave = await created(memory, view({ title: 'Cave', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01', 'Agate-F', 'S'));
    expect(await created(memory, view({ title: 'Cave', exits: ['S'] }), ctx('2026-11-02', 'Agate-F'))).toBe(cave); // no arrival known: by title
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-03'));
    expect(await created(memory, view({ title: 'Cave', exits: ['S'] }), ctx('2026-11-03', 'Agate-F', 'N'))).toBe(cave);
    expect(memory.counts.rooms).toBe(2);
  });

  it('keeps ambiguous rooms apart when nothing says which one it is', async () => {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Lane', exits: ['N'] }), ctx('2026-11-01'));
    const b = await created(memory, view({ title: 'Lane', exits: ['E', 'W'] }), ctx('2026-11-01')); // exits neither contain nor sit inside the first's
    expect(a).not.toBe(b);
    // exits N, E, W contain both rooms' exits, so it could be either
    const third = await created(memory, view({ title: 'Lane', exits: ['N', 'E', 'W'] }), ctx('2026-11-02'));
    expect([a, b]).not.toContain(third);
    expect(memory.stats.ambiguous).toBe(1);
    expect(memory.counts.rooms).toBe(3);
  });

  it('a walk of a described exit that arrives somewhere else is flagged as a conflict', async () => {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    const b = await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-02'));
    const c = await created(memory, view({ title: 'Vault', exits: ['S'] }), ctx('2026-11-02', 'Agate-F', 'N'));
    expect(c).not.toBe(b);
    expect(memory.room(a)!.exits[0]).toMatchObject({ state: 'conflict', confidence: 0, to: b });
    expectValid(memory);
  });

  it('does not follow an arrival into another session, or after the session ended', async () => {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01', 'Agate-F'));
    await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Jade-M', 'N'));
    expect(memory.room(a)!.exits[0].state).toBe('unknown-target');
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-02', 'Agate-F'));
    await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-03', 'Agate-F', 'N'));
    expect(memory.room(a)!.exits[0].state).toBe('unknown-target');
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-04'));
    memory.endSession();
    expect(memory.current).toBeUndefined();
    await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-04', 'Agate-F', 'N'));
    expect(memory.room(a)!.exits[0].state).toBe('unknown-target');
  });
});

describe('the evidence a movement suggestion carries', () => {
  async function walked(): Promise<{ memory: WorldMemory; a: string; b: string }> {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Hall', exits: ['N', 'E'] }), ctx('2026-11-01'));
    const b = await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N', 'E'] }), ctx('2026-11-01', 'Agate-F', 'S'));
    return { memory, a, b };
  }

  it('is 0.95 for an exit walked there and back, 0.6 for one walked once, and null for one never walked', async () => {
    const { memory } = await walked();
    expect(memory.edgeEvidence('Hall', 'north')).toBe(0.95);
    expect(memory.edgeEvidence('hall', 'N')).toBe(0.95);
    expect(memory.edgeEvidence('Hall', 'east')).toBeNull(); // known exit, never walked
    const { memory: once } = await open();
    await created(once, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await created(once, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(once, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    expect(once.edgeEvidence('Hall', 'north')).toBe(0.6);
  });

  it('is 0 for a contradicted exit', async () => {
    const { memory } = await open();
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-02'));
    await created(memory, view({ title: 'Vault', exits: ['S'] }), ctx('2026-11-02', 'Agate-F', 'N'));
    await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-03'));
    expect(memory.edgeEvidence('Hall', 'n')).toBe(0);
  });

  it('is null when the command is not a plain movement, the memory is elsewhere, or it knows nothing', async () => {
    const { memory } = await walked();
    expect(memory.edgeEvidence('Hall', 'flee')).toBeNull();
    expect(memory.edgeEvidence('Hall', 'enter portal')).toBeNull();
    expect(memory.edgeEvidence('Study', 'north')).toBeNull(); // the memory is in the hall
    expect(memory.edgeEvidence(undefined, 'north')).toBeNull();
    const { memory: empty } = await open();
    expect(empty.edgeEvidence('Hall', 'north')).toBeNull();
    memory.endSession();
    expect(memory.edgeEvidence('Hall', 'north')).toBeNull();
  });
});

describe('persistence', () => {
  it('a restart loads the same layer', async () => {
    const first = await open();
    const hall = await created(first.memory, view({ title: 'Hall', contents: [RAT] }), ctx('2026-11-01'));
    await created(first.memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    const saved = JSON.parse(first.io.files.get(FILE) as string) as { v: number; map: MapFile };
    expect(saved.v).toBe(WORLD_FILE_VERSION);
    expect(saved.map.generatedAt).toBe('2026-11-07T12:00:00.000Z');

    const { memory, loaded } = await WorldMemory.open({
      io: first.io,
      file: FILE,
      baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
      random: seeded(9),
    });
    expect(loaded).toBe('ok');
    expect(memory.candidates()).toEqual(first.memory.candidates());
    expect(memory.room(hall)).toEqual(first.memory.room(hall));
    expect(memory.counts).toEqual({ rooms: 2, links: first.memory.counts.links });
    expect(memory.current).toBeUndefined(); // where the character is now is not remembered across a restart
  });

  it('a failing disk write leaves the memory exactly as it was', async () => {
    const { memory, io } = await open();
    const hall = await created(memory, view({ title: 'Hall', exits: ['N'], contents: [RAT] }), ctx('2026-11-01'));
    const before = memory.candidates();
    const snapshot = JSON.stringify(before);
    const writtenBefore = io.files.get(FILE);
    const statsBefore = memory.stats;
    io.failWrite = true;
    const result = await memory.apply(view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    expect(result).toEqual({ ok: false, reason: 'write-failed' });
    expect(memory.candidates()).toBe(before);
    expect(JSON.stringify(memory.candidates())).toBe(snapshot);
    expect(io.files.get(FILE)).toBe(writtenBefore);
    expect(memory.current?.id).toBe(hall);
    expect(memory.stats).toEqual({ ...statsBefore, views: statsBefore.views + 1, writeFailures: 1 });
    io.failWrite = false;
    // the next visit works, and is attributed to the room the memory still believes it is in
    const study = await created(memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    expect(memory.room(hall)!.exits[0]).toMatchObject({ to: study, state: 'candidate' });
  });

  it('refuses a layer that would be too big to write, and one that has no more room', async () => {
    const small = await open(new MemoryWorldIo(), { maxChars: 600 });
    const first = await small.memory.apply(view({ title: 'Hall' }), ctx('2026-11-01'));
    expect(first).toEqual({ ok: false, reason: 'too-big' });
    expect(small.memory.counts.rooms).toBe(0);
    expect(small.io.files.has(FILE)).toBe(false);

    const tight = await open(new MemoryWorldIo(), { maxRooms: 1 });
    await created(tight.memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    expect(await tight.memory.apply(view({ title: 'Study' }), ctx('2026-11-01'))).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(await tight.memory.apply(view({ title: 'Hall' }), ctx('2026-11-02'))).toMatchObject({
      ok: true,
      created: false,
    });
    expect(tight.memory.stats.refused).toBe(1);
  });

  it('refuses a day that is not a day', async () => {
    const { memory } = await open();
    for (const day of ['yesterday', '2026-11-1', '2026-11-01T10:00:00Z', '']) {
      expect(await memory.apply(view({ title: 'Hall' }), { day, session: `${day}:Agate-F` })).toEqual({
        ok: false,
        reason: 'bad-day',
      });
    }
    expect(memory.counts.rooms).toBe(0);
  });

  it('starts empty from a file that is missing, and keeps an unreadable one beside the original', async () => {
    expect(
      (
        await WorldMemory.open({
          io: new MemoryWorldIo(),
          file: FILE,
          baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
          random: seeded(),
        })
      ).loaded,
    ).toBe('new');
    const bad: Record<string, string> = {
      'not json': '{oops',
      'wrong version': JSON.stringify({ v: 2, map: { version: 1, continents: [], links: [] } }),
      'invalid map': JSON.stringify({ v: 1, map: { version: 1, continents: 'x', links: [] } }),
      'no map': JSON.stringify({ v: 1 }),
    };
    for (const [name, text] of Object.entries(bad)) {
      const io = new MemoryWorldIo();
      io.files.set(FILE, text);
      const { memory, loaded } = await WorldMemory.open({
        io,
        file: FILE,
        baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
        random: seeded(),
      });
      expect({ name, loaded, rooms: memory.counts.rooms, kept: io.files.get(`${FILE}.unreadable`) }).toEqual({
        name,
        loaded: 'unreadable',
        rooms: 0,
        kept: text,
      });
    }
  });

  it('starts empty even when the unreadable copy cannot be written', async () => {
    const io = new MemoryWorldIo();
    io.files.set(FILE, '{oops');
    io.failPathEnding = '.unreadable';
    const { loaded } = await WorldMemory.open({
      io,
      file: FILE,
      baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
      random: seeded(),
    });
    expect(loaded).toBe('unreadable');
  });

  it('serves concurrent views one at a time, in order', async () => {
    const { memory, io } = await open();
    const titles = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const results = await Promise.all(titles.map((title) => memory.apply(view({ title }), ctx('2026-11-01'))));
    expect(results.every((r) => r.ok && r.created)).toBe(true);
    expect(allRooms(memory.candidates()).map((r) => r.title)).toEqual(titles);
    expect(io.writes).toBe(5);
    expectValid(memory);
  });

  it('keeps going after a view that failed', async () => {
    const { memory, io } = await open();
    io.failWrite = true;
    await memory.apply(view({ title: 'Alpha' }), ctx('2026-11-01'));
    io.failWrite = false;
    expect(await memory.apply(view({ title: 'Beta' }), ctx('2026-11-01'))).toMatchObject({ ok: true });
  });
});

describe('reading the layer', () => {
  it('has no report for an unknown room or one that was merged away, and counts what was refused', async () => {
    const { memory } = await open();
    expect(memory.room('r-nothing')).toBeUndefined();
    memory.noteRefused();
    expect(memory.stats.refused).toBe(1);
    const id = await created(memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    const io = new MemoryWorldIo();
    const saved = JSON.parse(
      (await (async () => memory.candidates())().then((m) => JSON.stringify({ v: 1, map: m }))) as string,
    ) as { map: MapFile };
    allRooms(saved.map)[0].aliasOf = undefined;
    const tomb: Room = { id: 'r-tomb', title: 'Hall', exits: {}, sources: [{ kind: 'walked' }], aliasOf: id };
    saved.map.continents[0].areas[0].subzones[0].rooms.push(tomb);
    io.files.set(FILE, JSON.stringify({ v: 1, map: saved.map }));
    const reopened = await WorldMemory.open({
      io,
      file: FILE,
      baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
      random: seeded(),
    });
    expect(reopened.loaded).toBe('ok');
    expect(reopened.memory.room('r-tomb')).toBeUndefined();
    expect(reopened.memory.room(id)).toBeDefined();
  });

  it('reports the vnum and the exits with the title of the room they lead to', async () => {
    const io = new MemoryWorldIo();
    const first = await open(io);
    const a = await created(first.memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await created(first.memory, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    const saved = JSON.parse(io.files.get(FILE) as string) as { v: number; map: MapFile };
    allRooms(saved.map).find((r) => r.id === a)!.vnum = 4242;
    io.files.set(FILE, JSON.stringify(saved));
    const { memory } = await open(io);
    expect(memory.room(a)).toMatchObject({ vnum: 4242, exits: [{ dir: 'N', toTitle: 'Study', state: 'candidate' }] });
    expect(memory.current).toBeUndefined();
  });

  it('is a valid map file after a longer walk', async () => {
    const { memory } = await open();
    await created(memory, view({ title: 'A', exits: ['N', 'E'], contents: [RAT] }), ctx('2026-11-01'));
    await created(memory, view({ title: 'B', exits: ['S', 'E'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    await created(memory, view({ title: 'C', exits: ['W', 'S'] }), ctx('2026-11-01', 'Agate-F', 'E'));
    await created(memory, view({ title: 'A', exits: ['N', 'E'], contents: [RAT] }), ctx('2026-11-02'));
    expect(memory.counts).toEqual({ rooms: 3, links: 6 });
    expectValid(memory);
  });
});

describe('other edge cases', () => {
  it('a room whose text was never readable has a report with no visits and nothing in it', async () => {
    const { memory } = await open();
    const absent = parseRoomView([{ type: 'room', at: 1, room: 'Hall', sector: '', exits: [] }]) as ParsedRoomView;
    const id = await created(memory, absent, ctx('2026-11-01'));
    expect(memory.room(id)).toEqual({
      id,
      title: 'Hall',
      visits: 0,
      days: 0,
      exits: [],
      fixtures: [],
      transient: [],
      was: [],
    });
  });

  it('adds walked rooms to the walked subzone and leaves any other place in the file alone', async () => {
    const io = new MemoryWorldIo();
    const other: Room = { id: 'rother', title: 'Elsewhere', exits: {}, sources: [{ kind: 'manual' }] };
    const map: MapFile = {
      version: 1,
      continents: [
        {
          id: 'walked',
          name: 'Walked',
          areas: [
            {
              id: 'walked',
              name: 'Walked rooms, not placed',
              placement: null,
              subzones: [
                { id: 'mine', name: 'Mine', kind: 'consistent', rooms: [other] },
                { id: 'walked-main', name: 'Walked', kind: 'consistent', rooms: [] },
              ],
            },
          ],
        },
        {
          id: 'north',
          name: 'North',
          areas: [
            {
              id: 'frost',
              name: 'Frost',
              placement: { x: 1, y: 1 },
              subzones: [{ id: 'frost-main', name: 'Frost', kind: 'consistent', rooms: [] }],
            },
          ],
        },
      ],
      links: [],
    };
    io.files.set(FILE, JSON.stringify({ v: 1, map }));
    const { memory } = await open(io);
    const id = await created(memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    const [walked, north] = memory.candidates().continents;
    expect(walked.areas[0].subzones[0].rooms).toEqual([other]);
    expect(walked.areas[0].subzones[1].rooms.map((r) => r.id)).toEqual([id]);
    expect(north.areas[0].subzones[0].rooms).toEqual([]);
    expectValid(memory);
  });

  it('adds a walked place when the file has none yet, beside what it holds', async () => {
    const io = new MemoryWorldIo();
    io.files.set(
      FILE,
      JSON.stringify({ v: 1, map: { version: 1, continents: [{ id: 'north', name: 'North', areas: [] }], links: [] } }),
    );
    const { memory } = await open(io);
    await created(memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    expect(memory.candidates().continents.map((c) => c.id)).toEqual(['north', 'walked']);
    expectValid(memory);
  });

  it("keeps a view with several possible rooms apart even when it arrived by an exit, if no room's way back leads to where it came from", async () => {
    const { memory } = await open();
    const a = await created(memory, view({ title: 'Lane', exits: ['N'] }), ctx('2026-11-01'));
    const b = await created(memory, view({ title: 'Lane', exits: ['E', 'W'] }), ctx('2026-11-01'));
    await created(memory, view({ title: 'Road', exits: ['N'] }), ctx('2026-11-02'));
    const arrived = await created(
      memory,
      view({ title: 'Lane', exits: ['N', 'E', 'W'] }),
      ctx('2026-11-02', 'Agate-F', 'N'),
    );
    expect([a, b]).not.toContain(arrived);
    expect(memory.stats.ambiguous).toBe(1);
  });
});

describe('a title match with no exit back', () => {
  it('is trusted: a room with no way back described cannot disagree with the arrival', async () => {
    const { memory } = await open();
    const hall = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await created(memory, view({ title: 'Road', exits: ['N'] }), ctx('2026-11-02'));
    const arrived = await created(memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-02', 'Agate-F', 'N'));
    expect(arrived).toBe(hall);
    expect(memory.counts.rooms).toBe(2);
  });
});

describe('a view that throws', () => {
  it('rejects that call only: the next view is still served and the layer is unchanged', async () => {
    const { memory } = await open(new MemoryWorldIo(), { random: () => 0 }); // the second new room asks for the id the first one has
    await created(memory, view({ title: 'Alpha', exits: ['N'] }), ctx('2026-11-01'));
    const before = memory.candidates();
    await expect(memory.apply(view({ title: 'Beta' }), ctx('2026-11-01'))).rejects.toThrow(/free id/);
    expect(memory.candidates()).toBe(before);
    expect(await memory.apply(view({ title: 'Alpha', exits: ['N'] }), ctx('2026-11-02'))).toMatchObject({
      ok: true,
      created: false,
    });
  });
});

describe('deferWrites and flush (replaying logs)', () => {
  it('writes nothing per view, then the same layer a per-view run would have written, once, on flush', async () => {
    const eager = await open();
    const lazy = await open(new MemoryWorldIo(), { deferWrites: true });
    for (const m of [eager.memory, lazy.memory]) {
      await created(m, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
      await created(m, view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'Agate-F', 'N'));
    }
    expect(eager.io.writes).toBe(2);
    expect(lazy.io.writes).toBe(0);
    expect(lazy.io.files.has(FILE)).toBe(false);
    expect(lazy.memory.counts).toEqual(eager.memory.counts);

    expect(await lazy.memory.flush()).toEqual({ ok: true });
    expect(lazy.io.writes).toBe(1);
    expect(lazy.io.files.get(FILE)).toBe(eager.io.files.get(FILE));
  });

  it('a flushed layer is read back by the next open', async () => {
    const lazy = await open(new MemoryWorldIo(), { deferWrites: true });
    await created(lazy.memory, view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await lazy.memory.flush();
    const again = await open(lazy.io);
    expect(again.memory.counts.rooms).toBe(1);
  });

  it('flush says too-big (and writes nothing) when the layer is over the limit, and write-failed when the disk refuses', async () => {
    const small = await open(new MemoryWorldIo(), { deferWrites: true, maxChars: 600 });
    expect(await small.memory.apply(view({ title: 'Hall' }), ctx('2026-11-01'))).toMatchObject({ ok: true });
    expect(await small.memory.flush()).toEqual({ ok: false, reason: 'too-big' });
    expect(small.io.files.has(FILE)).toBe(false);
    expect(small.memory.stats.refused).toBe(1);

    const full = await open(new MemoryWorldIo(), { deferWrites: true });
    await created(full.memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    full.io.failWrite = true;
    expect(await full.memory.flush()).toEqual({ ok: false, reason: 'write-failed' });
    expect(full.memory.stats.writeFailures).toBe(1);
    full.io.failWrite = false;
    expect(await full.memory.flush()).toEqual({ ok: true });
  });

  it('flush waits for the views already given, so it never writes half of one', async () => {
    const lazy = await open(new MemoryWorldIo(), { deferWrites: true });
    const pending = lazy.memory.apply(view({ title: 'Hall' }), ctx('2026-11-01'));
    const flushed = lazy.memory.flush();
    await pending;
    expect(await flushed).toEqual({ ok: true });
    expect(JSON.parse(lazy.io.files.get(FILE) as string).map.continents[0].areas[0].subzones[0].rooms).toHaveLength(1);
  });
});

describe('flush that throws', () => {
  it('rejects that call only: the next flush and the next view are still served', async () => {
    const lazy = await open(new MemoryWorldIo(), { deferWrites: true });
    await created(lazy.memory, view({ title: 'Hall' }), ctx('2026-11-01'));
    const map = lazy.memory.candidates() as unknown as { self?: unknown };
    map.self = map; // a layer that cannot be serialized
    await expect(lazy.memory.flush()).rejects.toThrow(/circular/i);
    delete map.self;
    expect(await lazy.memory.flush()).toEqual({ ok: true });
    expect(await lazy.memory.apply(view({ title: 'Study' }), ctx('2026-11-01'))).toMatchObject({ ok: true, created: true });
  });
});
