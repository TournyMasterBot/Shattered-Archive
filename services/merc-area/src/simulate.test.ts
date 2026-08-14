/**
 * simulateResets (Phase 13): the M/O/P/G/E/D/R boot-state state machine,
 * checked against merc-mud/2.4/src/db.c reset_area's actual logic rather
 * than intuition — each case below is chosen to exercise a specific branch
 * read directly from that source (see simulate.ts's header for citations).
 */
import { simulateResets, WEAR_SLOTS } from './simulate.js';
import type { AreaFile, Mobile, MudObject, Reset, Room, RoomExit } from './types.js';

function reset(command: Reset['command'], arg1 = 0, arg2 = 0, arg3 = 0, arg4 = 0): Reset {
  return { command, ifFlag: 0, arg1, arg2, arg3, arg4, comment: '' };
}

function mob(vnum: number, shortDescr: string): Mobile {
  return {
    vnum,
    name: shortDescr,
    shortDescr,
    longDescr: `${shortDescr} is here.`,
    description: '',
    race: 'human',
    act: 0,
    affectedBy: 0,
    alignment: 0,
    group: 0,
    level: 10,
    hitroll: 0,
    hit: { number: 1, type: 1, bonus: 1 },
    mana: { number: 1, type: 1, bonus: 1 },
    damage: { number: 1, type: 1, bonus: 1 },
    damType: 'slash',
    ac: [0, 0, 0, 0],
    offFlags: 0,
    immFlags: 0,
    resFlags: 0,
    vulnFlags: 0,
    startPos: 'stand',
    defaultPos: 'stand',
    sex: 'male',
    wealth: 0,
    form: 0,
    parts: 0,
    size: 'medium',
    material: 'unknown',
    flagRemovals: [],
  };
}

function obj(vnum: number, shortDescr: string): MudObject {
  return {
    vnum,
    name: shortDescr,
    shortDescr,
    description: `${shortDescr} lies here.`,
    material: 'steel',
    itemType: 'weapon',
    extraFlags: 0,
    wearFlags: 0,
    values: [0, 0, 0, 0, 0],
    level: 0,
    weight: 1,
    cost: 1,
    condition: 'P',
    affects: [],
    flagAffects: [],
    extraDescrs: [],
  };
}

function exit(door: number, toVnum: number, locks = 0): RoomExit {
  return { door, description: '', keyword: '', locks, key: -1, toVnum };
}

function room(vnum: number, name: string, exits: RoomExit[] = []): Room {
  return { vnum, name, description: '', areaNumber: 0, roomFlags: 0, sectorType: 0, exits, extraDescrs: [] };
}

function area(opts: { mobiles?: Mobile[]; objects?: MudObject[]; rooms?: Room[]; resets?: Reset[] }): AreaFile {
  return {
    sections: [
      { kind: 'mobiles', mobiles: opts.mobiles ?? [] },
      { kind: 'objects', objects: opts.objects ?? [] },
      { kind: 'rooms', rooms: opts.rooms ?? [] },
      { kind: 'resets', resets: opts.resets ?? [] },
    ],
  };
}

describe('simulateResets', () => {
  it('M + E + G chain: both objects attach to the mob M just created', () => {
    const a = area({
      mobiles: [mob(100, 'a guard')],
      objects: [obj(200, 'a sword'), obj(201, 'a pouch')],
      rooms: [room(300, 'Guard Post')],
      resets: [reset('M', 100, 1, 300, 1), reset('E', 200, -1, 16 /* wielded */), reset('G', 201, -1)],
    });
    const result = simulateResets(a);
    expect(result.warnings).toEqual([]);
    expect(result.rooms).toEqual([
      {
        room: 300,
        mobs: [
          {
            vnum: 100,
            name: 'a guard',
            count: 1,
            equipped: [{ vnum: 200, name: 'a sword', contents: [], slot: WEAR_SLOTS[16] }],
            carried: [{ vnum: 201, name: 'a pouch', contents: [] }],
          },
        ],
        objects: [],
      },
    ]);
  });

  it('M limit honored: a global count at the reset limit stops further copies from spawning', () => {
    const a = area({
      mobiles: [mob(100, 'a rat')],
      rooms: [room(300, 'Sewer'), room(301, 'Sewer 2')],
      resets: [
        reset('M', 100, 1, 300, 1), // global limit 1 -> succeeds, count now 1
        reset('M', 100, 1, 301, 1), // count(1) >= limit(1) -> skipped
      ],
    });
    const result = simulateResets(a);
    const allMobs = result.rooms.flatMap((r) => r.mobs);
    expect(allMobs).toHaveLength(1);
    expect(allMobs[0]).toMatchObject({ vnum: 100, count: 1 });
    expect(result.rooms.find((r) => r.room === 301)).toBeUndefined();
  });

  it('a room-local dup limit (arg4) independently caps copies of the same mob in one room', () => {
    const a = area({
      mobiles: [mob(100, 'a rat')],
      rooms: [room(300, 'Sewer')],
      resets: [
        reset('M', 100, 5, 300, 1), // global limit 5 (plenty), room limit 1
        reset('M', 100, 5, 300, 1), // room already has 1 >= room limit 1 -> skipped
      ],
    });
    const result = simulateResets(a);
    expect(result.rooms[0].mobs).toEqual([expect.objectContaining({ vnum: 100, count: 1 })]);
  });

  it('O placement: an object lands in its target room', () => {
    const a = area({
      objects: [obj(200, 'a torch')],
      rooms: [room(300, 'Hall')],
      resets: [reset('O', 200, 0, 300)],
    });
    const result = simulateResets(a);
    expect(result.warnings).toEqual([]);
    expect(result.rooms).toEqual([{ room: 300, mobs: [], objects: [{ vnum: 200, name: 'a torch', contents: [] }] }]);
  });

  it('a duplicate O for the same vnum+room is skipped (db.c count_obj_list guard)', () => {
    const a = area({
      objects: [obj(200, 'a torch')],
      rooms: [room(300, 'Hall')],
      resets: [reset('O', 200, 0, 300), reset('O', 200, 0, 300)],
    });
    const result = simulateResets(a);
    expect(result.rooms[0].objects).toHaveLength(1);
  });

  it('P into container: an item nests inside the most recently created object of the target vnum', () => {
    const a = area({
      objects: [obj(200, 'a chest'), obj(201, 'a gem')],
      rooms: [room(300, 'Vault')],
      resets: [reset('O', 200, 0, 300), reset('P', 201, -1, 200, 1)],
    });
    const result = simulateResets(a);
    expect(result.warnings).toEqual([]);
    expect(result.rooms[0].objects).toEqual([
      { vnum: 200, name: 'a chest', contents: [{ vnum: 201, name: 'a gem', contents: [] }] },
    ]);
  });

  it('P chains onto a container just given to a mob, even though it is not sitting in a room', () => {
    const a = area({
      mobiles: [mob(100, 'a merchant')],
      objects: [obj(200, 'a backpack'), obj(201, 'a coin')],
      rooms: [room(300, 'Market')],
      resets: [reset('M', 100, 1, 300, 1), reset('G', 200, -1), reset('P', 201, -1, 200, 1)],
    });
    const result = simulateResets(a);
    expect(result.warnings).toEqual([]);
    expect(result.rooms[0].mobs[0].carried).toEqual([
      { vnum: 200, name: 'a backpack', contents: [{ vnum: 201, name: 'a coin', contents: [] }] },
    ]);
  });

  it('D lock states: 0/1/2 resolve to open/closed/locked, defaulting doors nobody resets to open', () => {
    const a = area({
      rooms: [
        room(300, 'Cell', [exit(0, 301, 1), exit(1, 302, 1)]),
        room(301, 'Corridor'),
        room(302, 'Corridor 2'),
      ],
      resets: [reset('D', 300, 0, 2)], // door 0: state=2 (locked)
    });
    const result = simulateResets(a);
    expect(result.doors).toEqual([
      { room: 300, door: 0, state: 'locked' },
      { room: 300, door: 1, state: 'open' }, // never reset, but IS a door (locks=1) -> shown as open
    ]);
  });

  it('a D reset against a direction with no exit at all is silently skipped, not a warning', () => {
    const a = area({
      rooms: [room(300, 'Cell', [])],
      resets: [reset('D', 300, 5, 2)],
    });
    const result = simulateResets(a);
    expect(result.doors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('R is reported as randomized without picking an order', () => {
    const a = area({
      rooms: [room(300, 'Plaza', [exit(0, 301), exit(1, 302)])],
      resets: [reset('R', 300, 2)],
    });
    const result = simulateResets(a);
    expect(result.randomizedExits).toEqual([300]);
    // the room's own exit array is untouched — simulateResets never mutates the input model.
    expect(a.sections.find((s) => s.kind === 'rooms')!).toMatchObject({
      rooms: [expect.objectContaining({ vnum: 300 })],
    });
  });

  it('orphan G/E warning: no preceding M means there is no mob to attach to', () => {
    const a = area({
      objects: [obj(200, 'a sword')],
      resets: [reset('E', 200, 0, 16)],
    });
    const result = simulateResets(a);
    expect(result.rooms).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('reset #1 (E): no active mob to equip object 200 to')]);
  });

  it('a chain-breaking skip between M and E silently drops the E (db.c: no bug() call for !last, unlike a null mob)', () => {
    // db.c only bug()s the `mob == NULL` case; a `!last` skip from an earlier
    // failed reset (here, M's own global limit) is treated as unremarkable
    // and produces no warning — only the loadout silently comes up short.
    const a = area({
      mobiles: [mob(100, 'a guard')],
      rooms: [room(300, 'Post'), room(301, 'Post 2')],
      objects: [obj(200, 'a sword')],
      resets: [
        reset('M', 100, 1, 300, 1),
        reset('M', 100, 1, 301, 1), // global limit already hit -> last=false, mob unchanged
        reset('E', 200, 0, 16), // chain is broken -> silently skipped, no warning
      ],
    });
    const result = simulateResets(a);
    expect(result.warnings).toEqual([]);
    expect(result.rooms[0].mobs[0].equipped).toEqual([]);
  });

  it('cross-area object via resolver: an out-of-file vnum resolves through the world index', () => {
    const a = area({
      mobiles: [mob(100, 'a wizard')],
      rooms: [room(300, 'Tower')],
      resets: [reset('M', 100, 1, 300, 1), reset('E', 9000, -1, 16)],
    });
    const resolveExternal = (kind: string, vnum: number) =>
      kind === 'object' && vnum === 9000 ? { file: 'equipment.are', name: 'a staff of the magi' } : null;
    const result = simulateResets(a, { resolveExternal });
    expect(result.warnings).toEqual([]);
    expect(result.rooms[0].mobs[0].equipped).toEqual([
      { vnum: 9000, name: 'a staff of the magi', contents: [], slot: WEAR_SLOTS[16] },
    ]);
  });

  it('an unresolvable vnum with no resolver configured surfaces as a warning, never throws', () => {
    const a = area({
      mobiles: [mob(100, 'a wizard')],
      rooms: [room(300, 'Tower')],
      resets: [reset('M', 9999, 1, 300, 1)],
    });
    expect(() => simulateResets(a)).not.toThrow();
    const result = simulateResets(a);
    expect(result.rooms).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('mob 9999 not found')]);
  });

  it('identical mob loadouts in the same room collapse into one group with a count', () => {
    const a = area({
      mobiles: [mob(100, 'a guard')],
      objects: [obj(200, 'a sword')],
      rooms: [room(300, 'Barracks')],
      resets: [
        reset('M', 100, 5, 300, 5),
        reset('E', 200, -1, 16),
        reset('M', 100, 5, 300, 5),
        reset('E', 200, -1, 16),
      ],
    });
    const result = simulateResets(a);
    expect(result.rooms[0].mobs).toEqual([expect.objectContaining({ vnum: 100, count: 2 })]);
  });
});
