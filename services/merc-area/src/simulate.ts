/**
 * Reset simulator (MUD Builder Phase 13): computes the FIRST-BOOT spawn state
 * an area's #RESETS would produce, straight from the parsed model — no C, no
 * disk, no running game. Line-faithful mirror of merc-mud/2.4/src/db.c
 * reset_area (verified against that source, not memory) for the boot-state
 * case only: pArea->nplayer == 0 and every room/mob-count/obj-count starts at
 * zero, which is what a fresh MUD boot actually sees. Later repop drift
 * (players present, prior kills already having incremented counts) is out of
 * scope — reset_area's own player/count checks would then behave differently,
 * and this simulator does not attempt that.
 *
 * Faithfully modeled: the M/O/P/G/E/D/R state machine, the shared `last`/
 * `mob` ("LastMob") variables threaded across the WHOLE reset list exactly as
 * db.c does (so an unrelated D or O between an M and a G can still keep the
 * G chained to that mob, or break it, exactly like the real game), the
 * global mob-count and room-count M limits, the get_obj_type "most recently
 * created object of this vnum" lookup P relies on (db.c prepends every new
 * object to a single global list, so the first match walking from the head
 * is always the newest), and the P chaining rule that lets a container just
 * given to a mob (in_room === null) still accept a P as long as the reset
 * chain is still live.
 *
 * Deliberately NOT modeled (documented simplifications, not bugs):
 *  - db.c's P/G/E object-limit check has a 1-in-5 random escape once the
 *    count is at/over the limit (`number_range(0,4) != 0`). A preview must be
 *    deterministic, so once the limit is reached this simulator always skips
 *    — matching the common case (80% of real boots) and reusing the exact
 *    same limit decoding routes/world.ts's effectiveObjLimit already uses.
 *  - Shop keepers (mob->pIndexData->pShop != NULL) get unlimited restock in
 *    db.c, bypassing the object limit entirely. Not modeled: on a genuinely
 *    fresh boot every count starts at 0, so the limit essentially never bites
 *    before this distinction would matter.
 *  - The pet-shop ACT_PET flag, computed object cost/level, and the
 *    alignment-zap-on-equip case (anti-good/evil/neutral gear) affect mob
 *    stats or drop the item back to the room — none change what a builder
 *    sees as "what spawns", so none are represented in this output.
 *  - A container's lock state gets silently reset to its template default by
 *    ANY successful P against it (db.c: `obj_to->value[1] = ...value[1]`).
 *    Not surfaced — this simulator's `doors` field only covers #ROOMS exits
 *    (D resets), not object/container locks, which the plan's output shape
 *    doesn't call for either.
 */

import type { AreaFile, Mobile, MudObject, Reset, Room } from './types.js';
import type { RefKind } from './validate.js';

/** db.c handler.c equip_char wear-location table (merc.h WEAR_*), index-matched to E's arg3. */
export const WEAR_SLOTS = [
  'light',
  'finger (left)',
  'finger (right)',
  'neck (1)',
  'neck (2)',
  'body',
  'head',
  'legs',
  'feet',
  'hands',
  'arms',
  'shield',
  'about body',
  'waist',
  'wrist (left)',
  'wrist (right)',
  'wielded',
  'held',
  'float',
] as const;

/** One object instance in the spawn tree — a room's own object, or nested via a P reset. */
export interface SimObjectNode {
  vnum: number;
  name: string;
  contents: SimObjectNode[];
}

/** An equipped object additionally carries which wear slot it landed in. */
export interface SimEquippedObject extends SimObjectNode {
  slot: string;
}

/**
 * One or more identical mob spawns in a room — instances with the same vnum
 * AND the same resulting gear (equipped + carried, recursively) collapse
 * into a single entry with `count > 1`; any variance in loadout (a common,
 * deliberate area-authoring pattern — "3 guards, only the captain has a
 * horn") keeps them as separate entries.
 */
export interface SimMobGroup {
  vnum: number;
  name: string;
  count: number;
  equipped: SimEquippedObject[];
  carried: SimObjectNode[];
}

export interface SimRoomState {
  room: number;
  mobs: SimMobGroup[];
  objects: SimObjectNode[];
}

export type DoorState = 'open' | 'closed' | 'locked';

export interface SimDoorState {
  room: number;
  door: number;
  state: DoorState;
}

export interface SimulateResetsOptions {
  /** Same shape as validateRefs' resolver (validate.ts) — world-index lookup for a vnum this file doesn't define. */
  resolveExternal?: (kind: RefKind, vnum: number) => { file: string; name: string } | null;
}

export interface SimulateResetsResult {
  /** Only rooms that actually receive a mob or object spawn — omit empty ones. */
  rooms: SimRoomState[];
  /** Every door (an exit with a non-zero `locks` field) this area defines, at its resolved final state. */
  doors: SimDoorState[];
  /** Room vnums whose exits an R reset shuffles on every boot — order is NOT simulated, per the plan. */
  randomizedExits: number[];
  /** Human-readable notes for the three cases db.c silently drops: broken vnum refs, orphan G/E, orphan P. */
  warnings: string[];
}

/** db.c reset_area limit decoding for P/G/E resets: >50 = old format (6), -1 = unlimited (999). Mirrors routes/world.ts effectiveObjLimit (a small enough pure function that duplicating it here beats merc-area depending on the server package). */
function effectiveObjLimit(arg2: number): number {
  if (arg2 > 50) return 6;
  if (arg2 === -1) return 999;
  return arg2;
}

interface RawMobInstance {
  vnum: number;
  name: string;
  room: number;
  equipped: Map<number, SimEquippedObject>;
  carried: SimObjectNode[];
}

export function simulateResets(area: AreaFile, opts: SimulateResetsOptions = {}): SimulateResetsResult {
  const mobsByVnum = new Map<number, Mobile>();
  const objsByVnum = new Map<number, MudObject>();
  const roomsByVnum = new Map<number, Room>();
  let resets: Reset[] = [];
  for (const section of area.sections) {
    if (section.kind === 'mobiles') for (const m of section.mobiles) mobsByVnum.set(m.vnum, m);
    if (section.kind === 'objects') for (const o of section.objects) objsByVnum.set(o.vnum, o);
    if (section.kind === 'rooms') for (const r of section.rooms) roomsByVnum.set(r.vnum, r);
    if (section.kind === 'resets') resets = section.resets.filter((r): r is Reset => r.command !== '*');
  }

  const warnings: string[] = [];
  const resolveExternal = opts.resolveExternal;

  /** Vnum existence check for M/O placement targets and D/R sources — a plain vnum is enough, no fields needed. */
  function roomExists(vnum: number, where: string): boolean {
    if (roomsByVnum.has(vnum)) return true;
    if (resolveExternal?.('room', vnum)) return true;
    warnings.push(`${where}: room ${vnum} not found (broken reference)`);
    return false;
  }

  /** D/R need the actual Room record (its exits array) — a cross-area room can't be mutated from here. */
  function localRoomForExits(vnum: number, where: string): Room | null {
    const local = roomsByVnum.get(vnum);
    if (local) return local;
    if (resolveExternal?.('room', vnum)) {
      warnings.push(`${where}: room ${vnum} is defined in another area — its doors/exits are not simulated here`);
      return null;
    }
    warnings.push(`${where}: room ${vnum} not found (broken reference)`);
    return null;
  }

  function resolveMobName(vnum: number, where: string): string | null {
    const local = mobsByVnum.get(vnum);
    if (local) return local.shortDescr;
    const ext = resolveExternal?.('mob', vnum);
    if (ext) return ext.name;
    warnings.push(`${where}: mob ${vnum} not found (broken reference)`);
    return null;
  }

  function resolveObjName(vnum: number, where: string): string | null {
    const local = objsByVnum.get(vnum);
    if (local) return local.shortDescr;
    const ext = resolveExternal?.('object', vnum);
    if (ext) return ext.name;
    warnings.push(`${where}: object ${vnum} not found (broken reference)`);
    return null;
  }

  const roomMobInstances = new Map<number, RawMobInstance[]>();
  const roomObjects = new Map<number, SimObjectNode[]>();
  const objectsDirectlyInRoom = new Set<SimObjectNode>();

  const mobGlobalCount = new Map<number, number>();
  const mobRoomCount = new Map<string, number>();
  const objGlobalCount = new Map<number, number>();
  /** get_obj_type equivalent: the most recently CREATED instance of a vnum, anywhere (room, mob inventory, or nested). */
  const mostRecentObjByVnum = new Map<number, SimObjectNode>();

  const doorOverrides = new Map<string, DoorState>();
  const randomizedRooms = new Set<number>();

  function addRoomMob(room: number, inst: RawMobInstance): void {
    const list = roomMobInstances.get(room);
    if (list) list.push(inst);
    else roomMobInstances.set(room, [inst]);
  }

  function addRoomObject(room: number, node: SimObjectNode): void {
    const list = roomObjects.get(room);
    if (list) list.push(node);
    else roomObjects.set(room, [node]);
    objectsDirectlyInRoom.add(node);
  }

  function createObjectNode(vnum: number, name: string): SimObjectNode {
    const node: SimObjectNode = { vnum, name, contents: [] };
    objGlobalCount.set(vnum, (objGlobalCount.get(vnum) ?? 0) + 1);
    mostRecentObjByVnum.set(vnum, node);
    return node;
  }

  // db.c reset_area initializes `mob = NULL; last = TRUE;` once, before the loop.
  let lastMob: RawMobInstance | null = null;
  let last = true;

  let i = 0;
  for (const entry of resets) {
    i++;
    const where = `reset #${i} (${entry.command})`;

    switch (entry.command) {
      case 'M': {
        const name = resolveMobName(entry.arg1, where);
        if (name === null) continue;
        if (!roomExists(entry.arg3, where)) continue;

        const globalCount = mobGlobalCount.get(entry.arg1) ?? 0;
        if (globalCount >= entry.arg2) {
          last = false;
          break;
        }
        const roomKey = `${entry.arg1}:${entry.arg3}`;
        const roomCount = mobRoomCount.get(roomKey) ?? 0;
        if (roomCount >= entry.arg4) {
          last = false;
          break;
        }

        const inst: RawMobInstance = { vnum: entry.arg1, name, room: entry.arg3, equipped: new Map(), carried: [] };
        mobGlobalCount.set(entry.arg1, globalCount + 1);
        mobRoomCount.set(roomKey, roomCount + 1);
        addRoomMob(entry.arg3, inst);
        lastMob = inst;
        last = true;
        break;
      }

      case 'O': {
        const name = resolveObjName(entry.arg1, where);
        if (name === null) continue;
        if (!roomExists(entry.arg3, where)) continue;

        const alreadyPresent = (roomObjects.get(entry.arg3) ?? []).some((o) => o.vnum === entry.arg1);
        if (alreadyPresent) {
          last = false;
          break;
        }
        addRoomObject(entry.arg3, createObjectNode(entry.arg1, name));
        last = true;
        break;
      }

      case 'P': {
        const name = resolveObjName(entry.arg1, where);
        if (name === null) continue;
        const containerName = resolveObjName(entry.arg3, where);
        if (containerName === null) continue;

        const container = mostRecentObjByVnum.get(entry.arg3);
        const containerInRoom = container ? objectsDirectlyInRoom.has(container) : false;
        if (!container || (!containerInRoom && !last)) {
          warnings.push(`${where}: no container found for object ${entry.arg1} (object ${entry.arg3} not yet created, or the reset chain broke before it)`);
          last = false;
          break;
        }

        const limit = effectiveObjLimit(entry.arg2);
        const existing = container.contents.filter((o) => o.vnum === entry.arg1).length;
        if (existing > entry.arg4) {
          last = false;
          break;
        }
        let count = existing;
        while (count < entry.arg4) {
          if ((objGlobalCount.get(entry.arg1) ?? 0) >= limit) break;
          const node = createObjectNode(entry.arg1, name);
          container.contents.push(node);
          count++;
        }
        last = true;
        break;
      }

      case 'G':
      case 'E': {
        const name = resolveObjName(entry.arg1, where);
        if (name === null) continue;
        if (!last) break;
        if (!lastMob) {
          warnings.push(`${where}: no active mob to ${entry.command === 'G' ? 'give' : 'equip'} object ${entry.arg1} to`);
          last = false;
          break;
        }

        const limit = effectiveObjLimit(entry.arg2);
        if ((objGlobalCount.get(entry.arg1) ?? 0) >= limit) {
          // Silent per db.c (a shop keeper or a lucky 1-in-5 roll would still create one — not modeled; see file header).
          break;
        }
        const node = createObjectNode(entry.arg1, name);
        if (entry.command === 'E') {
          if (lastMob.equipped.has(entry.arg3)) {
            // Slot already occupied: db.c's equip_char bugs and returns without setting wear_loc,
            // but obj_to_char already ran — the item still ends up in inventory.
            lastMob.carried.push(node);
          } else {
            lastMob.equipped.set(entry.arg3, { ...node, slot: WEAR_SLOTS[entry.arg3] ?? `slot ${entry.arg3}` });
          }
        } else {
          lastMob.carried.push(node);
        }
        last = true;
        break;
      }

      case 'D': {
        const room = localRoomForExits(entry.arg1, where);
        if (!room) continue;
        const exit = room.exits.find((e) => e.door === entry.arg2);
        if (!exit) break;
        const key = `${entry.arg1}:${entry.arg2}`;
        if (entry.arg3 === 0) doorOverrides.set(key, 'open');
        else if (entry.arg3 === 1) doorOverrides.set(key, 'closed');
        else if (entry.arg3 === 2) doorOverrides.set(key, 'locked');
        last = true;
        break;
      }

      case 'R': {
        const room = localRoomForExits(entry.arg1, where);
        if (!room) continue;
        randomizedRooms.add(entry.arg1);
        break;
      }
    }
  }

  const rooms: SimRoomState[] = [];
  const roomVnums = new Set([...roomMobInstances.keys(), ...roomObjects.keys()]);
  for (const room of roomVnums) {
    rooms.push({
      room,
      mobs: groupMobs(roomMobInstances.get(room) ?? []),
      objects: roomObjects.get(room) ?? [],
    });
  }
  rooms.sort((a, b) => a.room - b.room);

  const doors: SimDoorState[] = [];
  for (const room of roomsByVnum.values()) {
    for (const exit of room.exits) {
      if (exit.locks === 0) continue; // not a door at all (plain passage)
      const state = doorOverrides.get(`${room.vnum}:${exit.door}`) ?? 'open'; // db.c never sets EX_CLOSED at load — doors start open
      doors.push({ room: room.vnum, door: exit.door, state });
    }
  }
  doors.sort((a, b) => a.room - b.room || a.door - b.door);

  return {
    rooms,
    doors,
    randomizedExits: [...randomizedRooms].sort((a, b) => a - b),
    warnings,
  };
}

function groupMobs(instances: RawMobInstance[]): SimMobGroup[] {
  const groups = new Map<string, SimMobGroup>();
  for (const inst of instances) {
    const equipped = [...inst.equipped.values()].sort((a, b) => a.slot.localeCompare(b.slot));
    const carried = inst.carried;
    const key = JSON.stringify({ vnum: inst.vnum, equipped: stripNames(equipped), carried: stripNames(carried) });
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { vnum: inst.vnum, name: inst.name, count: 1, equipped, carried });
  }
  return [...groups.values()];
}

/** Dedup key helper: shape (vnum + nesting) is what defines an identical loadout, not the resolved display name. */
function stripNames(nodes: SimObjectNode[]): unknown {
  return nodes.map((n) => ({ vnum: n.vnum, contents: stripNames(n.contents) }));
}
