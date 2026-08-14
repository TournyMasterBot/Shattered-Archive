/**
 * live-state (Phase 14c): parseLiveSnapshot's tolerant-parse contract, and
 * diffSpawnState's boot-vs-live comparison — each case exercises one drift
 * kind the Simulate pane needs to surface (dead/looted spawns, player-
 * dropped objects, door-state changes) plus the "nothing changed" baseline.
 */
import { diffSpawnState, parseLiveSnapshot } from './live-state.js';
import type { SimMobGroup, SimObjectNode, SimRoomState, SimulateResetsResult } from './simulate.js';

function simResult(rooms: SimRoomState[], doors: SimulateResetsResult['doors'] = []): SimulateResetsResult {
  return { rooms, doors, randomizedExits: [], warnings: [] };
}

function mobGroup(vnum: number, count: number): SimMobGroup {
  return { vnum, name: `mob ${vnum}`, count, equipped: [], carried: [] };
}

function objNode(vnum: number): SimObjectNode {
  return { vnum, name: `obj ${vnum}`, contents: [] };
}

describe('parseLiveSnapshot', () => {
  it('parses a well-formed snapshot', () => {
    const text = '{"ts":1234,"rooms":[{"vnum":3001,"mobs":[[3000,1]],"objs":[],"players":0,"doors":[]}]}';
    expect(parseLiveSnapshot(text)).toEqual({
      ts: 1234,
      rooms: [{ vnum: 3001, mobs: [[3000, 1]], objs: [], players: 0, doors: [] }],
    });
  });

  it('non-JSON text returns null, never throws', () => {
    expect(parseLiveSnapshot('not json at all')).toBeNull();
  });

  it('a truncated/torn write (mid-write read) returns null', () => {
    expect(parseLiveSnapshot('{"ts":1234,"rooms":[{"vnum":3001,"mobs":[[3')).toBeNull();
  });

  it('valid JSON but the wrong shape returns null', () => {
    expect(parseLiveSnapshot('{"hello":"world"}')).toBeNull();
    expect(parseLiveSnapshot('{"ts":1234,"rooms":[{"vnum":"3001"}]}')).toBeNull();
  });
});

describe('diffSpawnState', () => {
  it('clean world: live matches boot exactly -> zero drift', () => {
    const sim = simResult([{ room: 3001, mobs: [mobGroup(3000, 1)], objects: [objNode(3010)] }]);
    const live = { ts: 1000, rooms: [{ vnum: 3001, mobs: [[3000, 1]] as [number, number][], objs: [[3010, 1]] as [number, number][], players: 0, doors: [] }] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([]);
    expect(result.summary).toEqual({ roomsWithDrift: 0, mobsMissing: 0, objectsExtra: 0, snapshotTs: 1000 });
  });

  it('killed mob: expected 1, live 0 -> reported as missing even with no live room entry at all', () => {
    const sim = simResult([{ room: 3001, mobs: [mobGroup(3000, 1)], objects: [] }]);
    const live = { ts: 2000, rooms: [] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([
      { room: 3001, missingMobs: [{ vnum: 3000, expected: 1, actual: 0 }], extraObjects: [], missingObjects: [], players: 0, doorChanges: [] },
    ]);
    expect(result.summary).toEqual({ roomsWithDrift: 1, mobsMissing: 1, objectsExtra: 0, snapshotTs: 2000 });
  });

  it('loadout-grouped mobs collapse back to a flat per-vnum total before comparing (the SimMobGroup trap)', () => {
    // 3 guards total, split into two loadout groups (2 identical + 1 with a horn) -- must sum to 3, not compare group-by-group.
    const sim = simResult([{ room: 3001, mobs: [mobGroup(4000, 2), mobGroup(4000, 1)], objects: [] }]);
    const live = { ts: 3000, rooms: [{ vnum: 3001, mobs: [[4000, 2]] as [number, number][], objs: [], players: 0, doors: [] }] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([
      { room: 3001, missingMobs: [{ vnum: 4000, expected: 3, actual: 2 }], extraObjects: [], missingObjects: [], players: 0, doorChanges: [] },
    ]);
  });

  it('player-dropped object: live has an object the boot state never placed', () => {
    const sim = simResult([{ room: 3001, mobs: [], objects: [] }]);
    const live = { ts: 4000, rooms: [{ vnum: 3001, mobs: [], objs: [[9999, 1]] as [number, number][], players: 1, doors: [] }] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([
      { room: 3001, missingMobs: [], extraObjects: [{ vnum: 9999, count: 1 }], missingObjects: [], players: 1, doorChanges: [] },
    ]);
    expect(result.summary.objectsExtra).toBe(1);
  });

  it('door opened: boot expects closed, live reports open', () => {
    const sim = simResult([{ room: 3001, mobs: [], objects: [] }], [{ room: 3001, door: 2, state: 'closed' }]);
    const live = { ts: 5000, rooms: [{ vnum: 3001, mobs: [], objs: [], players: 0, doors: [[2, 0]] as [number, number][] }] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([
      { room: 3001, missingMobs: [], extraObjects: [], missingObjects: [], players: 0, doorChanges: [{ door: 2, boot: 'closed', live: 'open' }] },
    ]);
  });

  it('a door the live snapshot has no data for (room not yet emitted/hot-reloaded) is skipped, never a false mismatch', () => {
    const sim = simResult([{ room: 3001, mobs: [], objects: [] }], [{ room: 3001, door: 2, state: 'closed' }]);
    const live = { ts: 6000, rooms: [] };

    const result = diffSpawnState(sim, live);

    expect(result.rooms).toEqual([]);
  });
});
