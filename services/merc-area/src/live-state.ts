/**
 * Live world-state snapshot parsing + boot-vs-live drift diff (Phase 14c).
 *
 * The engine (state_snapshot.c) emits vnums and counts only — never a game
 * string — so parsing here never touches free text. `parseLiveSnapshot` is
 * deliberately tolerant (malformed input -> null, never throw): the file is
 * written by a separate process on its own cadence and may be read mid-boot
 * or before a builder ever requested one.
 */
import type { DoorState, SimMobGroup, SimObjectNode, SimulateResetsResult } from './simulate.js';

export interface LiveRoomState {
  vnum: number;
  /** [vnum, count] pairs, one per distinct mob vnum present in the room. */
  mobs: [number, number][];
  /** [vnum, count] pairs, one per distinct object vnum present in the room. */
  objs: [number, number][];
  players: number;
  /** [door, state] pairs, state 0 open / 1 closed / 2 locked. */
  doors: [number, number][];
}

export interface LiveSnapshot {
  ts: number;
  rooms: LiveRoomState[];
}

function isVnumCountPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function isLiveRoomState(v: unknown): v is LiveRoomState {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.vnum === 'number' &&
    typeof r.players === 'number' &&
    Array.isArray(r.mobs) &&
    r.mobs.every(isVnumCountPair) &&
    Array.isArray(r.objs) &&
    r.objs.every(isVnumCountPair) &&
    Array.isArray(r.doors) &&
    r.doors.every(isVnumCountPair)
  );
}

/** Parses `state.snapshot.json` content. Malformed/unexpected shape -> null, never throws. */
export function parseLiveSnapshot(text: string): LiveSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.ts !== 'number' || !Array.isArray(obj.rooms) || !obj.rooms.every(isLiveRoomState)) return null;
  return { ts: obj.ts, rooms: obj.rooms as LiveRoomState[] };
}

function doorStateFromCode(code: number): DoorState {
  if (code === 2) return 'locked';
  if (code === 1) return 'closed';
  return 'open';
}

export interface DriftMobEntry {
  vnum: number;
  expected: number;
  actual: number;
}

export interface DriftExtraObject {
  vnum: number;
  count: number;
}

export interface DriftDoorChange {
  door: number;
  boot: DoorState;
  live: DoorState;
}

export interface RoomDrift {
  room: number;
  missingMobs: DriftMobEntry[];
  extraObjects: DriftExtraObject[];
  missingObjects: DriftMobEntry[];
  players: number;
  doorChanges: DriftDoorChange[];
}

export interface DriftSummary {
  roomsWithDrift: number;
  mobsMissing: number;
  objectsExtra: number;
  snapshotTs: number;
}

export interface DiffSpawnStateResult {
  rooms: RoomDrift[];
  summary: DriftSummary;
}

/** Sums SimMobGroup.count per vnum — groups are loadout-grouped, so this collapses them back to a flat per-vnum total. */
function sumMobsByVnum(groups: SimMobGroup[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const g of groups) totals.set(g.vnum, (totals.get(g.vnum) ?? 0) + g.count);
  return totals;
}

/** Room-level objects only — each SimObjectNode entry is one instance (container contents are out of scope). */
function countObjectsByVnum(nodes: SimObjectNode[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const n of nodes) totals.set(n.vnum, (totals.get(n.vnum) ?? 0) + 1);
  return totals;
}

function toMap(pairs: [number, number][]): Map<number, number> {
  return new Map(pairs);
}

/**
 * Diffs a boot-state simulation against a live snapshot. Compares mobs/objects
 * across the UNION of rooms either side mentions (so an object dropped in a
 * room with zero expected spawns still shows up as "extra"); doors are only
 * compared where the simulation defines one (a live room the builder hasn't
 * hot-reloaded yet is silently skipped, never reported as a false mismatch).
 */
export function diffSpawnState(sim: SimulateResetsResult, live: LiveSnapshot): DiffSpawnStateResult {
  const liveRoomsByVnum = new Map(live.rooms.map((r) => [r.vnum, r]));
  const simRoomsByVnum = new Map(sim.rooms.map((r) => [r.room, r]));
  const roomVnums = new Set<number>([...simRoomsByVnum.keys(), ...liveRoomsByVnum.keys()]);

  const doorsBySimRoom = new Map<number, typeof sim.doors>();
  for (const d of sim.doors) {
    const list = doorsBySimRoom.get(d.room);
    if (list) list.push(d);
    else doorsBySimRoom.set(d.room, [d]);
  }

  const rooms: RoomDrift[] = [];
  let mobsMissing = 0;
  let objectsExtra = 0;

  for (const roomVnum of roomVnums) {
    const simRoom = simRoomsByVnum.get(roomVnum);
    const liveRoom = liveRoomsByVnum.get(roomVnum);

    const expectedMobs = simRoom ? sumMobsByVnum(simRoom.mobs) : new Map<number, number>();
    const actualMobs = liveRoom ? toMap(liveRoom.mobs) : new Map<number, number>();
    const expectedObjs = simRoom ? countObjectsByVnum(simRoom.objects) : new Map<number, number>();
    const actualObjs = liveRoom ? toMap(liveRoom.objs) : new Map<number, number>();

    const missingMobs: DriftMobEntry[] = [];
    for (const [vnum, expected] of expectedMobs) {
      const actual = actualMobs.get(vnum) ?? 0;
      if (actual < expected) missingMobs.push({ vnum, expected, actual });
    }

    const missingObjects: DriftMobEntry[] = [];
    for (const [vnum, expected] of expectedObjs) {
      const actual = actualObjs.get(vnum) ?? 0;
      if (actual < expected) missingObjects.push({ vnum, expected, actual });
    }

    const extraObjects: DriftExtraObject[] = [];
    for (const [vnum, actual] of actualObjs) {
      const expected = expectedObjs.get(vnum) ?? 0;
      if (actual > expected) extraObjects.push({ vnum, count: actual - expected });
    }

    const doorChanges: DriftDoorChange[] = [];
    const liveDoors = liveRoom ? toMap(liveRoom.doors) : new Map<number, number>();
    for (const d of doorsBySimRoom.get(roomVnum) ?? []) {
      const liveCode = liveDoors.get(d.door);
      if (liveCode === undefined) continue;
      const liveState = doorStateFromCode(liveCode);
      if (liveState !== d.state) doorChanges.push({ door: d.door, boot: d.state, live: liveState });
    }

    if (missingMobs.length === 0 && extraObjects.length === 0 && missingObjects.length === 0 && doorChanges.length === 0) {
      continue;
    }

    mobsMissing += missingMobs.length;
    objectsExtra += extraObjects.length;
    rooms.push({
      room: roomVnum,
      missingMobs,
      extraObjects,
      missingObjects,
      players: liveRoom?.players ?? 0,
      doorChanges,
    });
  }

  rooms.sort((a, b) => a.room - b.room);

  return {
    rooms,
    summary: { roomsWithDrift: rooms.length, mobsMissing, objectsExtra, snapshotTs: live.ts },
  };
}
