import type { AreaFile, Room, RoomExit, RoomsSection } from '@shatteredarchive/merc-area';

import { applyOps, areaToMapRooms, describeOp, inferDirection, type ExitOp } from './exit-edit.js';

function exit(door: number, toVnum: number, extra?: Partial<RoomExit>): RoomExit {
  return { door, description: '', keyword: '', locks: 0, key: 0, toVnum, ...extra };
}

function room(vnum: number, exits: RoomExit[], name = `Room ${vnum}`): Room {
  return {
    vnum,
    name,
    description: '',
    areaNumber: 0,
    roomFlags: 0,
    sectorType: 0,
    exits,
    extraDescrs: [],
  };
}

function area(rooms: Room[]): AreaFile {
  return { sections: [{ kind: 'rooms', rooms }] };
}

const roomsOf = (a: AreaFile) => a.sections.find((s): s is RoomsSection => s.kind === 'rooms')!.rooms;
const roomOf = (a: AreaFile, vnum: number) => roomsOf(a).find((r) => r.vnum === vnum)!;

describe('applyOps — addExit', () => {
  it('creates both sides of a two-way exit', () => {
    const base = area([room(100, []), room(101, [])]);
    const ops: ExitOp[] = [{ op: 'addExit', from: 100, door: 1, to: 101, twoWay: true, locks: 0, key: 0 }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toEqual([]);
    expect(roomOf(next, 100).exits).toEqual([exit(1, 101)]);
    expect(roomOf(next, 101).exits).toEqual([exit(3, 100)]); // REV_DIR[1] === 3 (west)
  });

  it('downgrades to one-way with a warning when the reverse slot is occupied', () => {
    const base = area([room(100, []), room(101, [exit(3, 999)])]);
    const ops: ExitOp[] = [{ op: 'addExit', from: 100, door: 1, to: 101, twoWay: true, locks: 0, key: 0 }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/already in use/);
    expect(roomOf(next, 100).exits).toEqual([exit(1, 101)]);
    expect(roomOf(next, 101).exits).toEqual([exit(3, 999)]); // untouched
  });

  it('downgrades to one-way with a warning when the target room is not local', () => {
    const base = area([room(100, [])]);
    const ops: ExitOp[] = [{ op: 'addExit', from: 100, door: 1, to: 9999, twoWay: true, locks: 0, key: 0 }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not in this area/);
    expect(roomOf(next, 100).exits).toEqual([exit(1, 9999)]);
  });

  it('carries locks/key onto both sides of a two-way exit', () => {
    const base = area([room(100, []), room(101, [])]);
    const ops: ExitOp[] = [{ op: 'addExit', from: 100, door: 0, to: 101, twoWay: true, locks: 2, key: 5000 }];
    const { area: next } = applyOps(base, ops);
    expect(roomOf(next, 100).exits).toEqual([exit(0, 101, { locks: 2, key: 5000 })]);
    expect(roomOf(next, 101).exits).toEqual([exit(2, 100, { locks: 2, key: 5000 })]);
  });
});

describe('applyOps — updateExit', () => {
  it('patches locks/key on an existing exit', () => {
    const base = area([room(100, [exit(1, 101)])]);
    const ops: ExitOp[] = [{ op: 'updateExit', from: 100, door: 1, locks: 1, key: 42 }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toEqual([]);
    expect(roomOf(next, 100).exits).toEqual([exit(1, 101, { locks: 1, key: 42 })]);
  });

  it('warns and no-ops when the exit does not exist', () => {
    const base = area([room(100, [])]);
    const ops: ExitOp[] = [{ op: 'updateExit', from: 100, door: 1, locks: 1, key: 42 }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toHaveLength(1);
    expect(next).toEqual(base);
  });
});

describe('applyOps — removeExit', () => {
  it('removes only the forward exit by default', () => {
    const base = area([room(100, [exit(1, 101)]), room(101, [exit(3, 100)])]);
    const ops: ExitOp[] = [{ op: 'removeExit', from: 100, door: 1, alsoReverse: false }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toEqual([]);
    expect(roomOf(next, 100).exits).toEqual([]);
    expect(roomOf(next, 101).exits).toEqual([exit(3, 100)]);
  });

  it('removes the reverse exit too when alsoReverse is set', () => {
    const base = area([room(100, [exit(1, 101)]), room(101, [exit(3, 100)])]);
    const ops: ExitOp[] = [{ op: 'removeExit', from: 100, door: 1, alsoReverse: true }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toEqual([]);
    expect(roomOf(next, 100).exits).toEqual([]);
    expect(roomOf(next, 101).exits).toEqual([]);
  });

  it('warns instead of touching an unrelated exit when alsoReverse has no matching reverse', () => {
    const base = area([room(100, [exit(1, 101)]), room(101, [exit(3, 999)])]);
    const ops: ExitOp[] = [{ op: 'removeExit', from: 100, door: 1, alsoReverse: true }];
    const { area: next, warnings } = applyOps(base, ops);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no reverse exit/);
    expect(roomOf(next, 100).exits).toEqual([]);
    expect(roomOf(next, 101).exits).toEqual([exit(3, 999)]); // untouched — points elsewhere
  });
});

describe('applyOps — replay determinism', () => {
  it('produces the same result from the same op list applied twice over', () => {
    const base = area([room(100, []), room(101, [])]);
    const ops: ExitOp[] = [
      { op: 'addExit', from: 100, door: 1, to: 101, twoWay: true, locks: 0, key: 0 },
      { op: 'updateExit', from: 100, door: 1, locks: 2, key: 10 },
      { op: 'removeExit', from: 100, door: 1, alsoReverse: true },
      { op: 'addExit', from: 100, door: 1, to: 101, twoWay: true, locks: 3, key: 20 },
    ];
    const first = applyOps(base, ops);
    const second = applyOps(base, ops);
    expect(second.area).toEqual(first.area);
    expect(second.warnings).toEqual(first.warnings);
  });
});

describe('inferDirection', () => {
  it.each([
    [[0, -1], 0], // north
    [[1, -1], 6], // northeast
    [[1, 0], 1], // east
    [[1, 1], 8], // southeast
    [[0, 1], 2], // south
    [[-1, 1], 9], // southwest
    [[-1, 0], 3], // west
    [[-1, -1], 7], // northwest
  ] as const)('resolves delta %p to door %i', (delta, door) => {
    expect(inferDirection([5, 5], [5 + delta[0], 5 + delta[1]])).toBe(door);
  });

  it('never infers up/down', () => {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const door = inferDirection([0, 0], [dx, dy]);
        expect(door).not.toBe(4);
        expect(door).not.toBe(5);
      }
    }
  });

  it('snaps a shallow diagonal to the nearer cardinal, not a corner', () => {
    // ~18.4° off east — nearer to east (0°) than northeast (45° away would need dx=dy)
    expect(inferDirection([0, 0], [3, -1])).toBe(1); // east
    expect(inferDirection([0, 0], [1, -3])).toBe(0); // north (closer to due-north than northeast)
  });

  it('defaults to east for a zero-length drag (same cell)', () => {
    expect(inferDirection([4, 4], [4, 4])).toBe(1);
  });
});

describe('areaToMapRooms', () => {
  it('projects rooms and exits, dropping non-exit room fields', () => {
    const base = area([room(100, [exit(1, 101, { locks: 2 })], 'Town Square')]);
    expect(areaToMapRooms(base)).toEqual([
      { vnum: 100, name: 'Town Square', sectorType: 0, exits: [{ door: 1, toVnum: 101, locks: 2 }] },
    ]);
  });

  it('never sets `external` — cross-area/unresolvable targets stay dangling for layoutArea to skip', () => {
    const base = area([room(100, [exit(1, 9999)])]);
    const [projected] = areaToMapRooms(base);
    expect(projected.exits[0]).toEqual({ door: 1, toVnum: 9999, locks: 0 });
    expect('external' in projected.exits[0]).toBe(false);
  });

  it('returns an empty list when the area has no rooms section', () => {
    expect(areaToMapRooms({ sections: [] })).toEqual([]);
  });

  it('attaches `external` only when the resolver matches, and stays dangling otherwise', () => {
    const base = area([room(100, [exit(1, 9999), exit(2, 8888)])]);
    const resolveExternal = (from: number, door: number, to: number) =>
      from === 100 && door === 1 && to === 9999 ? { file: 'neighbor.are', name: 'Neighbor Landing' } : undefined;
    const [projected] = areaToMapRooms(base, resolveExternal);
    expect(projected.exits[0]).toEqual({ door: 1, toVnum: 9999, locks: 0, external: { file: 'neighbor.are', name: 'Neighbor Landing' } });
    expect(projected.exits[1]).toEqual({ door: 2, toVnum: 8888, locks: 0 });
    expect('external' in projected.exits[1]).toBe(false);
  });
});

describe('describeOp', () => {
  it('names rooms by name+vnum when known', () => {
    const base = area([room(100, [], 'Town Square'), room(101, [], 'Market')]);
    const op: ExitOp = { op: 'addExit', from: 100, door: 1, to: 101, twoWay: true, locks: 0, key: 0 };
    expect(describeOp(op, base)).toBe('Add east exit: Town Square (#100) → Market (#101) (two-way)');
  });

  it('falls back to a bare vnum for an unknown room', () => {
    const base = area([room(100, [], 'Town Square')]);
    const op: ExitOp = { op: 'addExit', from: 100, door: 1, to: 9999, twoWay: false, locks: 0, key: 0 };
    expect(describeOp(op, base)).toBe('Add east exit: Town Square (#100) → #9999 (one-way)');
  });

  it('describes update and remove ops', () => {
    const base = area([room(100, [], 'Town Square')]);
    expect(describeOp({ op: 'updateExit', from: 100, door: 2, locks: 1, key: 0 }, base)).toBe(
      'Update south exit on Town Square (#100)',
    );
    expect(describeOp({ op: 'removeExit', from: 100, door: 2, alsoReverse: true }, base)).toBe(
      'Remove south exit on Town Square (#100) (and its reverse)',
    );
  });
});
