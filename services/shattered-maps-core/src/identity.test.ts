import { updateBaseline } from './baseline.js';
import { buildIndex } from './hierarchy.js';
import {
  applyTraversal,
  CONFIRMED_CONFIDENCE,
  declareExit,
  matchRoom,
  mergeRooms,
  mintId,
  normalizeTitle,
  recordExit,
  recordTraversal,
  SINGLE_TRAVERSAL_CONFIDENCE,
  splitRoom,
  undoMerge,
} from './identity.js';
import { cloneJson, DIRECTIONS, LIMITS, type Direction, type Link, type MapFile, type Room } from './schema.js';
import { counter, link, room, sampleMap, seeded, subzone } from './testing/fixtures.js';
import { validateMapFile } from './validate.js';

function expectValid(map: MapFile): void {
  const v = validateMapFile(map);
  expect(v.ok ? [] : v.errors).toEqual([]);
}

function allRooms(map: MapFile): Room[] {
  return map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));
}

function byId<T extends { id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.id.localeCompare(b.id));
}

function reslot(map: MapFile): MapFile {
  const next = cloneJson(map);
  for (const r of allRooms(next)) {
    r.exits = {};
    for (const l of next.links) if (l.from === r.id) r.exits[l.dir] = l.id;
  }
  return next;
}

describe('mintId', () => {
  it('makes a prefixed ten-character id that matches the id pattern and is repeatable from a seed', () => {
    const a = mintId('r', new Set(), seeded(3));
    expect(a).toMatch(/^r[0-9a-hjkmnp-tv-z]{10}$/);
    expect(mintId('r', new Set(), seeded(3))).toBe(a);
    expect(mintId('l', new Set(), seeded(3))).toBe(`l${a.slice(1)}`);
  });

  it('is not made from a title: it has no title input, and two draws differ', () => {
    const random = seeded(11);
    const first = mintId('r', new Set(), random);
    const second = mintId('r', new Set([first]), random);
    expect(first).not.toBe(second);
    expect(mintId.length).toBe(3); // (prefix, taken, random): nothing else to build an id from
  });

  it('skips a taken id', () => {
    const taken = new Set([mintId('r', new Set(), seeded(5))]);
    const id = mintId('r', taken, seeded(5).bind(null));
    expect(taken.has(id)).toBe(false);
  });

  it('clamps a bad random value instead of producing garbage', () => {
    expect(mintId('r', new Set(), () => Number.NaN)).toBe('r0000000000');
    expect(mintId('r', new Set(), () => 5)).toBe('rzzzzzzzzzz');
    expect(mintId('r', new Set(), () => -1)).toBe('r0000000000');
  });

  it('throws when the random source keeps returning taken ids', () => {
    expect(() => mintId('r', new Set(['r0000000000']), () => 0)).toThrow(/free id/);
  });
});

describe('normalizeTitle', () => {
  it('ignores case and spacing', () => {
    expect(normalizeTitle('  The   OLD Well ')).toBe('the old well');
  });
});

describe('matchRoom (M1: repeated titles, hidden exits)', () => {
  const index = buildIndex(sampleMap());

  it('follows the exit that was taken when the title agrees', () => {
    expect(
      matchRoom(index, { title: 'mill  road', areaId: 'town', exits: ['W', 'S'], arrivedBy: { from: 'r1', dir: 'E' } }),
    ).toEqual({ kind: 'existing', id: 'r2', reason: 'link' });
  });

  it('keeps one title in two areas as two rooms, each found in its own area', () => {
    const town = matchRoom(index, { title: 'Mill Road', areaId: 'town', exits: ['W', 'S'] });
    const forest = matchRoom(index, { title: 'Mill Road', areaId: 'forest', exits: [] });
    expect(town).toEqual({ kind: 'existing', id: 'r2', reason: 'title' });
    expect(forest).toEqual({ kind: 'existing', id: 'r6', reason: 'title' });
    expect(matchRoom(index, { title: 'Mill Road', areaId: 'swamp', exits: ['W'] })).toEqual({ kind: 'new' });
  });

  it('keeps one room when a hidden exit appears (the view shows more exits than were known)', () => {
    expect(matchRoom(index, { title: 'Mill Road', areaId: 'town', exits: ['W', 'S', 'N'] })).toEqual({
      kind: 'existing',
      id: 'r2',
      reason: 'title',
    });
  });

  it('keeps one room when fewer exits are shown than are known (a door the view did not list)', () => {
    expect(matchRoom(index, { title: 'Mill Road', areaId: 'town', exits: ['W'] })).toEqual({
      kind: 'existing',
      id: 'r2',
      reason: 'title',
    });
  });

  it('makes a new room when the exit sets disagree (neither contains the other)', () => {
    expect(matchRoom(index, { title: 'Mill Road', areaId: 'town', exits: ['E', 'NE'] })).toEqual({ kind: 'new' });
  });

  it('says ambiguous, sorted, when more than one room fits', () => {
    const map = sampleMap();
    map.continents[0].areas[0].subzones[0].rooms.push(room('r0', 'Old Well'));
    expect(matchRoom(buildIndex(map), { title: 'Old Well', areaId: 'town', exits: ['D'] })).toEqual({
      kind: 'ambiguous',
      candidates: ['r0', 'r3'],
    });
  });

  it('matches nothing by title when the area is not known', () => {
    expect(matchRoom(index, { title: 'Market Square', areaId: null, exits: [] })).toEqual({ kind: 'new' });
  });

  it('does not trust a link in conflict, and falls back to the title', () => {
    const map = sampleMap();
    map.links[0] = { ...map.links[0], state: 'conflict', confidence: 0 };
    expect(
      matchRoom(buildIndex(map), {
        title: 'Mill Road',
        areaId: 'town',
        exits: ['W', 'S'],
        arrivedBy: { from: 'r1', dir: 'E' },
      }),
    ).toEqual({ kind: 'existing', id: 'r2', reason: 'title' });
  });

  it('does not trust a link whose target has another title', () => {
    expect(
      matchRoom(index, { title: 'Cellar', areaId: 'town', exits: [], arrivedBy: { from: 'r1', dir: 'E' } }),
    ).toEqual({ kind: 'existing', id: 'r5', reason: 'title' });
  });

  it('ignores an arrival by an exit that has no link, or from an unknown room', () => {
    expect(
      matchRoom(index, { title: 'Old Well', areaId: 'town', exits: ['D'], arrivedBy: { from: 'r1', dir: 'NE' } }),
    ).toEqual({ kind: 'existing', id: 'r3', reason: 'title' });
    expect(
      matchRoom(index, { title: 'Old Well', areaId: 'town', exits: ['D'], arrivedBy: { from: 'nope', dir: 'N' } }),
    ).toEqual({ kind: 'existing', id: 'r3', reason: 'title' });
    // the unknown-target exit of r1 north goes nowhere yet, so it cannot say which room this is
    expect(
      matchRoom(index, { title: 'Gate', areaId: 'town', exits: ['E'], arrivedBy: { from: 'r1', dir: 'N' } }),
    ).toEqual({ kind: 'existing', id: 'r4', reason: 'title' });
  });

  it('follows an alias to the live room', () => {
    const map = sampleMap();
    const rooms = allRooms(map);
    const r4 = rooms.find((r) => r.id === 'r4') as Room;
    r4.aliasOf = 'r3';
    r4.exits = {};
    map.links = map.links.filter((l) => l.from !== 'r4' && l.id !== 'l-r4-e');
    map.links.find((l) => l.id === 'l-r2-s')!.to = 'r4';
    expect(
      matchRoom(buildIndex(map), {
        title: 'old well',
        areaId: 'town',
        exits: ['D'],
        arrivedBy: { from: 'r2', dir: 'S' },
      }),
    ).toEqual({ kind: 'existing', id: 'r3', reason: 'link' });
  });

  it('never returns a merged-away room by title', () => {
    const map = sampleMap();
    (allRooms(map).find((r) => r.id === 'r3') as Room).aliasOf = 'r5';
    expect(matchRoom(buildIndex(map), { title: 'Old Well', areaId: 'town', exits: ['D'] })).toEqual({ kind: 'new' });
  });
});

describe('link evidence (D12)', () => {
  const nextId = counter('w');
  const walk = (
    links: Link[],
    from: string,
    dir: Direction,
    to: string,
    at = '2026-11-01',
  ): { links: Link[]; link: Link } => applyTraversal(links, { from, dir, to, at }, nextId);

  it('a single traversal is a candidate at 0.6', () => {
    const { link: l, links } = walk([], 'a', 'N', 'b');
    expect(links).toHaveLength(1);
    expect(l).toMatchObject({
      from: 'a',
      dir: 'N',
      to: 'b',
      state: 'candidate',
      confidence: SINGLE_TRAVERSAL_CONFIDENCE,
      traversals: 1,
      reverse: false,
      lastWalked: '2026-11-01',
    });
    expect(SINGLE_TRAVERSAL_CONFIDENCE).toBe(0.6);
  });

  it('the reverse traversal confirms both links at 0.95', () => {
    const first = walk([], 'a', 'N', 'b');
    const second = walk(first.links, 'b', 'S', 'a', '2026-11-02');
    expect(second.link).toMatchObject({ state: 'confirmed', confidence: CONFIRMED_CONFIDENCE, reverse: true });
    expect(second.links.find((l) => l.from === 'a')).toMatchObject({
      state: 'confirmed',
      confidence: 0.95,
      reverse: true,
    });
    expect(CONFIRMED_CONFIDENCE).toBe(0.95);
  });

  it('is the same whichever direction was walked first', () => {
    const first = walk([], 'b', 'S', 'a');
    const second = walk(first.links, 'a', 'N', 'b');
    expect(second.links.map((l) => [l.state, l.confidence])).toEqual([
      ['confirmed', 0.95],
      ['confirmed', 0.95],
    ]);
  });

  it('walking the same exit again counts the walk and stays a candidate', () => {
    const first = walk([], 'a', 'N', 'b');
    const again = walk(first.links, 'a', 'N', 'b', '2026-11-03');
    expect(again.link).toMatchObject({ state: 'candidate', confidence: 0.6, traversals: 2, lastWalked: '2026-11-03' });
    expect(again.links).toHaveLength(1);
  });

  it('a confirmed link walked again stays confirmed', () => {
    const confirmed = walk(walk([], 'a', 'N', 'b').links, 'b', 'S', 'a');
    const again = walk(confirmed.links, 'a', 'N', 'b');
    expect(again.link).toMatchObject({ state: 'confirmed', confidence: 0.95, traversals: 2 });
  });

  it('a walk that arrives somewhere else makes the link a conflict, and the first target stays', () => {
    const first = walk([], 'a', 'N', 'b');
    const other = walk(first.links, 'a', 'N', 'c', '2026-11-02');
    expect(other.link).toMatchObject({ state: 'conflict', confidence: 0, to: 'b', conflictTo: ['c'], traversals: 2 });
  });

  it('contradicts a confirmed link too', () => {
    const confirmed = walk(walk([], 'a', 'N', 'b').links, 'b', 'S', 'a');
    expect(walk(confirmed.links, 'a', 'N', 'c').link.state).toBe('conflict');
  });

  it('walked again and consistent, a conflict is a candidate again', () => {
    const conflict = walk(walk([], 'a', 'N', 'b').links, 'a', 'N', 'c');
    const back = walk(conflict.links, 'a', 'N', 'b', '2026-11-05');
    expect(back.link).toMatchObject({ state: 'candidate', confidence: 0.6, to: 'b', lastWalked: '2026-11-05' });
    expect(back.link.conflictTo).toBeUndefined();
  });

  it('does not confirm against a link that is in conflict', () => {
    const conflict = walk(walk([], 'a', 'N', 'b').links, 'a', 'N', 'c');
    const reverse = walk(conflict.links, 'b', 'S', 'a');
    expect(reverse.link).toMatchObject({ state: 'candidate', confidence: 0.6, reverse: false });
  });

  it('does not confirm against a reverse link that leads elsewhere (a one-way exit is not a contradiction)', () => {
    const first = walk([], 'a', 'N', 'b');
    const reverse = walk(first.links, 'b', 'S', 'z');
    expect(reverse.link).toMatchObject({ state: 'candidate' });
    expect(reverse.links.find((l) => l.from === 'a')).toMatchObject({ state: 'candidate' });
  });

  it('an exit declared with no target becomes a candidate on its first walk', () => {
    const declared = declareExit([], 'a', 'E', counter());
    expect(declared.link).toMatchObject({ state: 'unknown-target', to: null, confidence: 0, traversals: 0 });
    const walked = walk(declared.links, 'a', 'E', 'b');
    expect(walked.links).toHaveLength(1);
    expect(walked.link).toMatchObject({ state: 'candidate', to: 'b', confidence: 0.6, traversals: 1 });
  });

  it('declaring an exit again, or one that already has a link, adds nothing', () => {
    const first = declareExit([], 'a', 'E', counter());
    const second = declareExit(first.links, 'a', 'E', counter('x'));
    expect(second.links).toHaveLength(1);
    expect(second.link.id).toBe(first.link.id);
    const walked = walk([], 'a', 'N', 'b');
    expect(declareExit(walked.links, 'a', 'N', counter('x')).link.state).toBe('candidate');
  });

  it('keeps at most the cap of conflicting targets', () => {
    let links = walk([], 'a', 'N', 'b').links;
    for (let i = 0; i < LIMITS.maxConflictTargets + 4; i += 1) links = walk(links, 'a', 'N', `c${i}`).links;
    expect(links[0].conflictTo).toHaveLength(LIMITS.maxConflictTargets);
  });

  it('only asks for a new id when it makes a link, and never changes the list it was given', () => {
    const ids: string[] = [];
    const newId = (): string => {
      ids.push('x');
      return `l${ids.length}`;
    };
    const first = applyTraversal([], { from: 'a', dir: 'N', to: 'b', at: '2026-11-01' }, newId);
    const snapshot = cloneJson(first.links);
    applyTraversal(first.links, { from: 'a', dir: 'N', to: 'b', at: '2026-11-02' }, newId);
    applyTraversal(first.links, { from: 'a', dir: 'N', to: 'c', at: '2026-11-02' }, newId);
    expect(ids).toHaveLength(1);
    expect(first.links).toEqual(snapshot);
  });
});

describe('recordExit and recordTraversal (room slots and links stay in step)', () => {
  it('records an exit in the room slot and the link list, once', () => {
    const map = sampleMap();
    const done = recordExit(map, 'r3', 'E', counter('n')) as { map: MapFile; link: Link };
    expect(done.link).toMatchObject({ from: 'r3', dir: 'E', to: null, state: 'unknown-target' });
    expect((allRooms(done.map).find((r) => r.id === 'r3') as Room).exits.E).toBe(done.link.id);
    const again = recordExit(done.map, 'r3', 'E', counter('m')) as { map: MapFile; link: Link };
    expect(again.link.id).toBe(done.link.id);
    expect(again.map.links).toHaveLength(done.map.links.length);
    expectValid(again.map);
  });

  it('records a walk, sets the slot, and marks a link that leaves the area as off the page', () => {
    const map = sampleMap();
    const done = recordTraversal(map, { from: 'r3', dir: 'W', to: 'r6', at: '2026-11-07' }, counter('n')) as {
      map: MapFile;
      link: Link;
    };
    expect(done.link).toMatchObject({ from: 'r3', dir: 'W', to: 'r6', state: 'candidate', offPage: true });
    expect((allRooms(done.map).find((r) => r.id === 'r3') as Room).exits.W).toBe(done.link.id);
    expectValid(done.map);
    const inside = recordTraversal(map, { from: 'r3', dir: 'E', to: 'r4', at: '2026-11-07' }, counter('n')) as {
      map: MapFile;
      link: Link;
    };
    expect(inside.link.offPage).toBe(false);
  });

  it('walking a described exit with a new target flags the conflict in the map', () => {
    const done = recordTraversal(sampleMap(), { from: 'r1', dir: 'S', to: 'r5', at: '2026-11-07' }, counter('n')) as {
      map: MapFile;
      link: Link;
    };
    expect(done.link).toMatchObject({ id: 'l-r1-s', state: 'conflict', to: 'r3', conflictTo: ['r5'] });
    expectValid(done.map);
  });

  it('does nothing and says so when a room is not in the map', () => {
    const map = sampleMap();
    expect(recordExit(map, 'nope', 'N', counter())).toBeNull();
    expect(recordTraversal(map, { from: 'nope', dir: 'N', to: 'r1', at: '2026-11-07' }, counter())).toBeNull();
    expect(recordTraversal(map, { from: 'r1', dir: 'N', to: 'nope', at: '2026-11-07' }, counter())).toBeNull();
  });

  it('never changes the map it was given', () => {
    const map = sampleMap();
    const snapshot = cloneJson(map);
    recordTraversal(map, { from: 'r3', dir: 'W', to: 'r6', at: '2026-11-07' }, counter('n'));
    recordExit(map, 'r3', 'E', counter('n'));
    expect(map).toEqual(snapshot);
  });
});

function withDuplicate(): MapFile {
  const map = sampleMap();
  const town = map.continents[0].areas[0].subzones[0];
  town.rooms.push(room('r7', 'Mill Road', { sector: 'city', coords: { x: 2, y: 0, z: 0 } }));
  map.links.push(
    link('l-r2-n', 'r2', 'N', null),
    link('l-r2-d', 'r2', 'D', 'r5'),
    link('l-r7-w', 'r7', 'W', 'r1'),
    link('l-r7-s', 'r7', 'S', 'r3'),
    link('l-r7-e', 'r7', 'E', 'r6', { offPage: true }),
    link('l-r7-n', 'r7', 'N', 'r1'),
    link('l-r7-d', 'r7', 'D', null),
    link('l-r7-ne', 'r7', 'NE', 'r7'),
    link('l-r3-n', 'r3', 'N', 'r7'),
  );
  const merged = reslot(map);
  const rooms = allRooms(merged);
  (rooms.find((r) => r.id === 'r2') as Room).baseline = updateBaseline(undefined, {
    day: '2026-11-01',
    entries: [{ label: 'a grey rat', kind: 'mob' }],
  });
  (rooms.find((r) => r.id === 'r7') as Room).baseline = updateBaseline(undefined, {
    day: '2026-11-02',
    entries: [{ label: 'a brass lamp', kind: 'item' }],
  });
  (rooms.find((r) => r.id === 'r7') as Room).vnum = 2002;
  return merged;
}

describe('mergeRooms and undoMerge', () => {
  it('starts from a valid map', () => {
    expectValid(withDuplicate());
  });

  it('absorbs the dropped room: tombstone, exits moved or reconciled, links rewritten, baselines added', () => {
    const before = withDuplicate();
    const after = mergeRooms(before, 'r2', 'r7', '2026-11-07', 'same road') as MapFile;
    expect(after).not.toBeNull();
    expectValid(after);
    const rooms = allRooms(after);
    const keep = rooms.find((r) => r.id === 'r2') as Room;
    const gone = rooms.find((r) => r.id === 'r7') as Room;

    expect(gone).toMatchObject({ aliasOf: 'r2', exits: {}, title: 'Mill Road', vnum: 2002 });
    expect(gone.baseline?.contents[0].label).toBe('a brass lamp'); // the tombstone keeps its own data
    expect(keep.vnum).toBeUndefined();

    // free slots move with the link
    expect(keep.exits.E).toBe('l-r7-e');
    expect(after.links.find((l) => l.id === 'l-r7-e')).toMatchObject({ from: 'r2', to: 'r6' });
    // same slot, same target: the dropped link is gone and the kept one is untouched
    expect(after.links.find((l) => l.id === 'l-r7-w')).toBeUndefined();
    expect(after.links.find((l) => l.id === 'l-r2-w')).toMatchObject({ state: 'confirmed' });
    // same slot, different targets: the kept link becomes a conflict that names the other target
    expect(after.links.find((l) => l.id === 'l-r2-s')).toMatchObject({
      state: 'conflict',
      confidence: 0,
      to: 'r4',
      conflictTo: ['r3'],
    });
    // the kept slot had no target: it takes the other's
    expect(after.links.find((l) => l.id === 'l-r2-n')).toMatchObject({ state: 'candidate', to: 'r1', confidence: 0.6 });
    // the dropped slot had no target: nothing changes
    expect(after.links.find((l) => l.id === 'l-r2-d')).toMatchObject({ to: 'r5', state: 'candidate' });
    expect(after.links.find((l) => l.id === 'l-r7-d')).toBeUndefined();
    // links that ended at the dropped room end at the kept one, including its own loop
    expect(after.links.find((l) => l.id === 'l-r3-n')?.to).toBe('r2');
    expect(after.links.find((l) => l.id === 'l-r7-ne')).toMatchObject({ from: 'r2', to: 'r2' });

    expect(keep.baseline?.contents.map((c) => c.label).sort()).toEqual(['a brass lamp', 'a grey rat']);
    expect(keep.baseline?.visits).toBe(2);
    expect(keep.history?.at(-1)).toMatchObject({ at: '2026-11-07', op: 'merge', with: ['r7'], note: 'same road' });
    expect(gone.history?.at(-1)).toMatchObject({ op: 'merge', with: ['r2'], note: 'same road' });
    expect(keep.sources).toEqual([{ kind: 'walked' }]);
  });

  it('puts both rooms back, with the merge and the undo on both histories', () => {
    const before = withDuplicate();
    const merged = mergeRooms(before, 'r2', 'r7', '2026-11-07') as MapFile;
    const restored = undoMerge(merged, 'r2', 'r7', '2026-11-08') as MapFile;
    expect(restored).not.toBeNull();
    expectValid(restored);

    const wasRooms = allRooms(before);
    const nowRooms = allRooms(restored);
    for (const id of ['r2', 'r7']) {
      const was = wasRooms.find((r) => r.id === id) as Room;
      const now = nowRooms.find((r) => r.id === id) as Room;
      expect(now.exits).toEqual(was.exits);
      expect(now.baseline).toEqual(was.baseline);
      expect(now.aliasOf).toBeUndefined();
      expect(now.title).toBe(was.title);
    }
    expect(byId(restored.links)).toEqual(byId(before.links));

    const keepHistory = (nowRooms.find((r) => r.id === 'r2') as Room).history?.map((h) => h.op);
    const goneHistory = (nowRooms.find((r) => r.id === 'r7') as Room).history?.map((h) => h.op);
    expect(keepHistory).toEqual(['merge', 'undo-merge']);
    expect(goneHistory).toEqual(['merge', 'undo-merge']);
  });

  it('cannot undo the same merge twice, or one that never happened', () => {
    const merged = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    const restored = undoMerge(merged, 'r2', 'r7', '2026-11-08') as MapFile;
    expect(undoMerge(restored, 'r2', 'r7', '2026-11-09')).toBeNull();
    expect(undoMerge(merged, 'r2', 'r1', '2026-11-08')).toBeNull();
    expect(undoMerge(merged, 'nope', 'r7', '2026-11-08')).toBeNull();
    expect(undoMerge(merged, 'r2', 'nope', '2026-11-08')).toBeNull();
    // r7 is not merged into r1
    expect(undoMerge(merged, 'r1', 'r7', '2026-11-08')).toBeNull();
  });

  it('refuses to merge a room with itself, a missing room, or a room already merged away', () => {
    const map = withDuplicate();
    expect(mergeRooms(map, 'r2', 'r2', '2026-11-07')).toBeNull();
    expect(mergeRooms(map, 'r2', 'nope', '2026-11-07')).toBeNull();
    expect(mergeRooms(map, 'nope', 'r2', '2026-11-07')).toBeNull();
    const merged = mergeRooms(map, 'r2', 'r7', '2026-11-07') as MapFile;
    expect(mergeRooms(merged, 'r2', 'r7', '2026-11-07')).toBeNull();
    expect(mergeRooms(merged, 'r7', 'r2', '2026-11-07')).toBeNull();
  });

  it('merges rooms that have no baseline without inventing one, and unions the sources', () => {
    const map = sampleMap();
    const rooms = allRooms(map);
    (rooms.find((r) => r.id === 'r4') as Room).sources = [
      { kind: 'azah', ref: '55', credit: 'Azah', date: '2020-01-01' },
    ];
    const merged = mergeRooms(map, 'r3', 'r4', '2026-11-07') as MapFile;
    const keep = allRooms(merged).find((r) => r.id === 'r3') as Room;
    expect(keep.baseline).toBeUndefined();
    expect(keep.sources).toHaveLength(2);
    expectValid(merged);
    const restored = undoMerge(merged, 'r3', 'r4', '2026-11-08') as MapFile;
    expect((allRooms(restored).find((r) => r.id === 'r3') as Room).baseline).toBeUndefined();
    expectValid(restored);
  });

  it('keeps the newest history entries when a room has more than the cap', () => {
    let map = sampleMap();
    const r3 = allRooms(map).find((r) => r.id === 'r3') as Room;
    r3.history = Array.from({ length: LIMITS.maxHistory }, (_, i) => ({
      at: '2026-11-01',
      op: 'create' as const,
      note: `n${i}`,
    }));
    map = mergeRooms(map, 'r3', 'r4', '2026-11-07') as MapFile;
    const history = (allRooms(map).find((r) => r.id === 'r3') as Room).history as NonNullable<Room['history']>;
    expect(history).toHaveLength(LIMITS.maxHistory);
    expect(history.at(-1)?.op).toBe('merge');
    expect(history[0].note).toBe('n1');
  });

  it('never changes the map it was given', () => {
    const map = withDuplicate();
    const snapshot = cloneJson(map);
    const merged = mergeRooms(map, 'r2', 'r7', '2026-11-07') as MapFile;
    undoMerge(merged, 'r2', 'r7', '2026-11-08');
    expect(map).toEqual(snapshot);
  });

  it('survives a link that was removed between the merge and the undo', () => {
    const merged = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    merged.links = merged.links.filter((l) => l.id !== 'l-r2-s');
    for (const r of allRooms(merged)) if (r.exits.S === 'l-r2-s') delete r.exits.S;
    const restored = undoMerge(merged, 'r2', 'r7', '2026-11-08') as MapFile;
    expect(restored).not.toBeNull();
    expectValid(restored);
  });
});

describe('splitRoom', () => {
  it('makes a second live room and moves the chosen links, both rooms record it', () => {
    const map = sampleMap();
    const out = splitRoom(map, 'r1', {
      newId: 'r9',
      takeLinks: ['l-r1-s', 'l-r2-w'],
      at: '2026-11-07',
      note: 'two squares',
    }) as { map: MapFile; newId: string };
    expect(out.newId).toBe('r9');
    expectValid(out.map);
    const rooms = allRooms(out.map);
    const original = rooms.find((r) => r.id === 'r1') as Room;
    const copy = rooms.find((r) => r.id === 'r9') as Room;
    expect(copy).toMatchObject({ title: 'Market Square', sector: 'city', exits: { S: 'l-r1-s' } });
    expect(copy.baseline).toBeUndefined();
    expect(copy.vnum).toBeUndefined();
    expect(copy.coords).toBeUndefined();
    expect(original.exits.S).toBeUndefined();
    expect(original.exits.E).toBe('l-r1-e');
    expect(out.map.links.find((l) => l.id === 'l-r1-s')?.from).toBe('r9');
    expect(out.map.links.find((l) => l.id === 'l-r2-w')?.to).toBe('r9');
    expect(original.history?.at(-1)).toMatchObject({ op: 'split', with: ['r9'], note: 'two squares' });
    expect(copy.history).toEqual([{ at: '2026-11-07', op: 'split', with: ['r1'], note: 'two squares' }]);
    // the new room is in the same subzone as the original
    const subzone = out.map.continents[0].areas[0].subzones[0];
    expect(subzone.rooms.map((r) => r.id)).toContain('r9');
  });

  it('copies a description, keeps the original baseline, and works with no chosen links', () => {
    const map = sampleMap();
    const r1 = allRooms(map).find((r) => r.id === 'r1') as Room;
    r1.description = 'A wide cobbled square.';
    r1.baseline = updateBaseline(undefined, { day: '2026-11-01', entries: [{ label: 'a fountain', kind: 'item' }] });
    const out = splitRoom(map, 'r1', { newId: 'r9', takeLinks: [], at: '2026-11-07' }) as {
      map: MapFile;
      newId: string;
    };
    const rooms = allRooms(out.map);
    expect((rooms.find((r) => r.id === 'r9') as Room).description).toBe('A wide cobbled square.');
    expect((rooms.find((r) => r.id === 'r1') as Room).baseline?.contents[0].label).toBe('a fountain');
    expect((rooms.find((r) => r.id === 'r1') as Room).history?.at(-1)).not.toHaveProperty('note');
    expectValid(out.map);
  });

  it('refuses a missing or merged-away room, a bad or taken new id, and a link that does not touch the room', () => {
    const map = sampleMap();
    const good = { newId: 'r9', takeLinks: [] as string[], at: '2026-11-07' };
    expect(splitRoom(map, 'nope', good)).toBeNull();
    expect(splitRoom(map, 'r1', { ...good, newId: 'Bad Id' })).toBeNull();
    expect(splitRoom(map, 'r1', { ...good, newId: 'r2' })).toBeNull();
    expect(splitRoom(map, 'r1', { ...good, takeLinks: ['l-r3-d'] })).toBeNull();
    expect(splitRoom(map, 'r1', { ...good, takeLinks: ['no-such-link'] })).toBeNull();
    const merged = mergeRooms(map, 'r3', 'r4', '2026-11-07') as MapFile;
    expect(splitRoom(merged, 'r4', good)).toBeNull();
  });

  it('never changes the map it was given', () => {
    const map = sampleMap();
    const snapshot = cloneJson(map);
    splitRoom(map, 'r1', { newId: 'r9', takeLinks: ['l-r1-s'], at: '2026-11-07' });
    expect(map).toEqual(snapshot);
  });
});

describe('merge and match edge cases', () => {
  it('does not follow a link into an alias loop, and finds nothing by title there either', () => {
    const map = sampleMap();
    const rooms = allRooms(map);
    const r2 = rooms.find((r) => r.id === 'r2') as Room;
    const r4 = rooms.find((r) => r.id === 'r4') as Room;
    r2.aliasOf = 'r4';
    r4.aliasOf = 'r2';
    r2.exits = {};
    r4.exits = {};
    map.links = map.links.filter((l) => l.from !== 'r2' && l.from !== 'r4');
    expect(
      matchRoom(buildIndex(map), {
        title: 'Mill Road',
        areaId: 'town',
        exits: ['W'],
        arrivedBy: { from: 'r1', dir: 'E' },
      }),
    ).toEqual({ kind: 'new' });
  });

  it("lets a kept exit with no target learn the dropped exit's target, evidence and last walk", () => {
    const map = sampleMap();
    map.links.push(
      link('l-r3-n0', 'r3', 'N', null),
      link('l-r4-n', 'r4', 'N', 'r1', {
        state: 'confirmed',
        confidence: 0.95,
        reverse: true,
        traversals: 3,
        lastWalked: '2026-11-01',
      }),
    );
    const merged = mergeRooms(reslot(map), 'r3', 'r4', '2026-11-07') as MapFile;
    expect(merged.links.find((l) => l.id === 'l-r3-n0')).toMatchObject({
      to: 'r1',
      state: 'confirmed',
      confidence: 0.95,
      reverse: true,
      traversals: 3,
      lastWalked: '2026-11-01',
    });
    expectValid(merged);
    const restored = undoMerge(merged, 'r3', 'r4', '2026-11-08') as MapFile;
    expect(restored.links.find((l) => l.id === 'l-r3-n0')).toMatchObject({
      to: null,
      state: 'unknown-target',
      traversals: 0,
    });
    expect(restored.links.find((l) => l.id === 'l-r4-n')).toMatchObject({ from: 'r4', to: 'r1' });
    expectValid(restored);
  });

  it('can undo an older merge into a room that was itself merged away and brought back', () => {
    const first = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    const away = mergeRooms(first, 'r1', 'r2', '2026-11-08') as MapFile;
    const back = undoMerge(away, 'r1', 'r2', '2026-11-09') as MapFile;
    expectValid(back);
    // r2 now has a merge event with no undo image (it was the absorbed side) between it and the older merge
    expect(
      (allRooms(back).find((r) => r.id === 'r2') as Room).history?.map((h) => [h.op, h.undo !== undefined]),
    ).toEqual([
      ['merge', true],
      ['merge', false],
      ['undo-merge', false],
    ]);
    const older = undoMerge(back, 'r2', 'r7', '2026-11-10') as MapFile;
    expect(older).not.toBeNull();
    expectValid(older);
  });

  it('cannot undo a merge when the room only claims to be an alias', () => {
    const map = sampleMap();
    (allRooms(map).find((r) => r.id === 'r4') as Room).aliasOf = 'r3';
    (allRooms(map).find((r) => r.id === 'r4') as Room).exits = {};
    map.links = map.links.filter((l) => l.from !== 'r4');
    expect(undoMerge(map, 'r3', 'r4', '2026-11-08')).toBeNull();
  });

  it('undoes merges newest first: an older merge waits until the newer one is undone', () => {
    const first = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    const second = mergeRooms(first, 'r2', 'r4', '2026-11-08') as MapFile;
    expectValid(second);
    // r7 was merged first; r4 is merged after it and still stands
    expect(undoMerge(second, 'r2', 'r7', '2026-11-09')).toBeNull();
    const newerGone = undoMerge(second, 'r2', 'r4', '2026-11-09') as MapFile;
    expectValid(newerGone);
    const bothGone = undoMerge(newerGone, 'r2', 'r7', '2026-11-10') as MapFile;
    expectValid(bothGone);
    const rooms = allRooms(bothGone);
    expect((rooms.find((r) => r.id === 'r7') as Room).aliasOf).toBeUndefined();
    expect((rooms.find((r) => r.id === 'r4') as Room).aliasOf).toBeUndefined();
    expect((rooms.find((r) => r.id === 'r2') as Room).history?.map((h) => h.op)).toEqual([
      'merge',
      'merge',
      'undo-merge',
      'undo-merge',
    ]);
    // and the same room can be merged again after it was undone
    const again = mergeRooms(bothGone, 'r2', 'r7', '2026-11-11') as MapFile;
    expect(undoMerge(again, 'r2', 'r7', '2026-11-12')).not.toBeNull();
  });

  it('leaves a moved link alone when it was pointed somewhere else after the merge', () => {
    const merged = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    const link = merged.links.find((l) => l.id === 'l-r7-e') as Link;
    expect(link.from).toBe('r2');
    link.from = 'r3'; // someone has since re-homed the link
    const restored = undoMerge(merged, 'r2', 'r7', '2026-11-08') as MapFile;
    expect(restored.links.find((l) => l.id === 'l-r7-e')?.from).toBe('r3');
  });

  it('does not add a dropped link back twice if it is already there, and reads an undo event with no `with`', () => {
    const merged = mergeRooms(withDuplicate(), 'r2', 'r7', '2026-11-07') as MapFile;
    merged.links.push(link('l-r7-w', 'r7', 'W', 'r1'));
    const keep = allRooms(merged).find((r) => r.id === 'r2') as Room;
    keep.history = [...(keep.history ?? []), { at: '2026-11-07', op: 'undo-merge' }];
    const restored = undoMerge(merged, 'r2', 'r7', '2026-11-08') as MapFile;
    expect(restored.links.filter((l) => l.id === 'l-r7-w')).toHaveLength(1);
  });

  it('copies no sector or description when the original had none', () => {
    const map = sampleMap();
    delete (allRooms(map).find((r) => r.id === 'r1') as Room).sector;
    const out = splitRoom(map, 'r1', { newId: 'r9', takeLinks: [], at: '2026-11-07' }) as {
      map: MapFile;
      newId: string;
    };
    const copy = allRooms(out.map).find((r) => r.id === 'r9') as Room;
    expect(copy).not.toHaveProperty('sector');
    expect(copy).not.toHaveProperty('description');
  });
});

describe('a whole walk, end to end', () => {
  it('builds rooms, exits and evidence from a short walk and stays valid', () => {
    let map: MapFile = {
      version: 1,
      continents: [
        {
          id: 'c1',
          name: 'C',
          areas: [
            {
              id: 'a1',
              name: 'A',
              placement: null,
              subzones: [subzone('s1', [room('ra', 'Start'), room('rb', 'Hall')])],
            },
          ],
        },
      ],
      links: [],
    };
    const ids = counter('l');
    map = (recordExit(map, 'ra', 'N', ids) as { map: MapFile }).map;
    map = (recordTraversal(map, { from: 'ra', dir: 'N', to: 'rb', at: '2026-11-01' }, ids) as { map: MapFile }).map;
    map = (recordTraversal(map, { from: 'rb', dir: 'S', to: 'ra', at: '2026-11-01' }, ids) as { map: MapFile }).map;
    expect(map.links).toHaveLength(2);
    expect(map.links.every((l) => l.state === 'confirmed' && l.confidence === 0.95)).toBe(true);
    expectValid(map);
    expect(DIRECTIONS.filter((d) => allRooms(map)[0].exits[d] !== undefined)).toEqual(['N']);
  });
});
