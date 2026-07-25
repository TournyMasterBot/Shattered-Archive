import type { AreaFile, Room, RoomExit, RoomsSection } from '@shatteredarchive/merc-area';

import type { AreaMapRoom } from '../../api/client.js';
import { DOOR_NAMES, REV_DIR } from './layout.js';

/**
 * AI-ANNOTATION
 * @ai-summary Pure staged-edit engine for the Phase 14b map exit editor.
 *   Edits are OPS (addExit/updateExit/removeExit), never in-place mutation:
 *   applyOps replays an ordered op list over an immutable AreaFile snapshot,
 *   so per-item undo is "drop the op and re-replay" with no separate undo
 *   logic to keep in sync. areaToMapRooms projects the edited AreaFile back
 *   into the AreaMapRoom[] shape layoutArea (layout.ts) already consumes, so
 *   view mode and edit mode share one renderer.
 * @ai-public ExitOp, applyOps, areaToMapRooms, inferDirection, describeOp
 * @ai-notes Operates on the FULL parsed AreaFile (via the #ROOMS section),
 *   never the /api/map projection — that payload lacks non-exit room fields
 *   and would destroy data if saved. Two-way adds mirror REV_DIR from
 *   layout.ts and downgrade to one-way (with a warning) when the target's
 *   reverse slot is occupied or the target room isn't local to this area.
 */

export type ExitOp =
  | { op: 'addExit'; from: number; door: number; to: number; twoWay: boolean; locks: number; key: number }
  | { op: 'updateExit'; from: number; door: number; locks: number; key: number }
  | { op: 'removeExit'; from: number; door: number; alsoReverse: boolean };

export interface ApplyOpsResult {
  area: AreaFile;
  warnings: string[];
}

function roomsSectionOf(area: AreaFile): RoomsSection | undefined {
  return area.sections.find((s): s is RoomsSection => s.kind === 'rooms');
}

function withRooms(area: AreaFile, section: RoomsSection, rooms: Room[]): AreaFile {
  return { sections: area.sections.map((s) => (s === section ? { ...s, rooms } : s)) };
}

function applyAddExit(area: AreaFile, op: Extract<ExitOp, { op: 'addExit' }>): ApplyOpsResult {
  const section = roomsSectionOf(area);
  if (!section) return { area, warnings: [`area has no rooms — addExit skipped`] };
  if (!section.rooms.some((r) => r.vnum === op.from)) {
    return { area, warnings: [`room #${op.from} not found — addExit skipped`] };
  }

  const warnings: string[] = [];
  const newExit: RoomExit = { door: op.door, description: '', keyword: '', locks: op.locks, key: op.key, toVnum: op.to };
  let rooms = section.rooms.map((r) =>
    r.vnum === op.from ? { ...r, exits: [...r.exits.filter((e) => e.door !== op.door), newExit] } : r,
  );

  if (op.twoWay) {
    const revDoor = REV_DIR[op.door];
    const target = rooms.find((r) => r.vnum === op.to);
    if (!target) {
      warnings.push(`target room #${op.to} is not in this area — created one-way only`);
    } else if (target.exits.some((e) => e.door === revDoor)) {
      warnings.push(`#${op.to}'s ${DOOR_NAMES[revDoor]} exit is already in use — created one-way only`);
    } else {
      const reverseExit: RoomExit = {
        door: revDoor,
        description: '',
        keyword: '',
        locks: op.locks,
        key: op.key,
        toVnum: op.from,
      };
      rooms = rooms.map((r) => (r.vnum === op.to ? { ...r, exits: [...r.exits, reverseExit] } : r));
    }
  }

  return { area: withRooms(area, section, rooms), warnings };
}

function applyUpdateExit(area: AreaFile, op: Extract<ExitOp, { op: 'updateExit' }>): ApplyOpsResult {
  const section = roomsSectionOf(area);
  if (!section) return { area, warnings: [`area has no rooms — updateExit skipped`] };
  const room = section.rooms.find((r) => r.vnum === op.from);
  if (!room) return { area, warnings: [`room #${op.from} not found — updateExit skipped`] };
  if (!room.exits.some((e) => e.door === op.door)) {
    return { area, warnings: [`#${op.from} has no ${DOOR_NAMES[op.door]} exit — updateExit skipped`] };
  }

  const rooms = section.rooms.map((r) =>
    r.vnum === op.from
      ? { ...r, exits: r.exits.map((e) => (e.door === op.door ? { ...e, locks: op.locks, key: op.key } : e)) }
      : r,
  );
  return { area: withRooms(area, section, rooms), warnings: [] };
}

function applyRemoveExit(area: AreaFile, op: Extract<ExitOp, { op: 'removeExit' }>): ApplyOpsResult {
  const section = roomsSectionOf(area);
  if (!section) return { area, warnings: [`area has no rooms — removeExit skipped`] };
  const room = section.rooms.find((r) => r.vnum === op.from);
  if (!room) return { area, warnings: [`room #${op.from} not found — removeExit skipped`] };
  const exit = room.exits.find((e) => e.door === op.door);
  if (!exit) return { area, warnings: [`#${op.from} has no ${DOOR_NAMES[op.door]} exit — removeExit skipped`] };

  const warnings: string[] = [];
  let rooms = section.rooms.map((r) => (r.vnum === op.from ? { ...r, exits: r.exits.filter((e) => e.door !== op.door) } : r));

  if (op.alsoReverse) {
    const revDoor = REV_DIR[op.door];
    const target = rooms.find((r) => r.vnum === exit.toVnum);
    const reverse = target?.exits.find((e) => e.door === revDoor && e.toVnum === op.from);
    if (reverse) {
      rooms = rooms.map((r) => (r.vnum === exit.toVnum ? { ...r, exits: r.exits.filter((e) => e.door !== revDoor) } : r));
    } else {
      warnings.push(`no reverse exit found on #${exit.toVnum} — only the forward exit was removed`);
    }
  }

  return { area: withRooms(area, section, rooms), warnings };
}

function applyOp(area: AreaFile, op: ExitOp): ApplyOpsResult {
  switch (op.op) {
    case 'addExit':
      return applyAddExit(area, op);
    case 'updateExit':
      return applyUpdateExit(area, op);
    case 'removeExit':
      return applyRemoveExit(area, op);
  }
}

/** Immutable replay: derives the current model from the base AreaFile + an ordered op list. */
export function applyOps(area: AreaFile, ops: ExitOp[]): ApplyOpsResult {
  return ops.reduce<ApplyOpsResult>(
    (acc, op) => {
      const next = applyOp(acc.area, op);
      return { area: next.area, warnings: [...acc.warnings, ...next.warnings] };
    },
    { area, warnings: [] },
  );
}

/**
 * Minimal AreaFile → AreaMapRoom projection for the edit-mode layout — no server
 * round-trip of its own. `resolveExternal` is an optional oracle (MapPage wires it to
 * the area's last-fetched /api/map response, which the server already cross-area
 * resolved) for exits pointing outside this area's own rooms: when it returns a
 * match the exit renders as a portal stub (read-only — cross-area exit CREATION is
 * still out of scope), otherwise the target stays a dangling exit — no edge drawn —
 * exactly as layoutArea already treats an unresolvable target.
 */
export function areaToMapRooms(
  area: AreaFile,
  resolveExternal?: (fromVnum: number, door: number, toVnum: number) => { file: string; name: string } | undefined,
): AreaMapRoom[] {
  const rooms = roomsSectionOf(area)?.rooms ?? [];
  return rooms.map((r) => ({
    vnum: r.vnum,
    name: r.name,
    sectorType: r.sectorType,
    exits: r.exits.map((e) => {
      const external = resolveExternal?.(r.vnum, e.door, e.toVnum);
      return { door: e.door, toVnum: e.toVnum, locks: e.locks, ...(external ? { external } : {}) };
    }),
  }));
}

/** Nearest of the 8 compass doors by angle from one grid cell to another. Never returns up/down (picker-only). */
const SECTOR_DOORS = [1, 8, 2, 9, 3, 7, 0, 6]; // 0°=E, 45°=SE, 90°=S, 135°=SW, 180°=W, 225°=NW, 270°=N, 315°=NE

export function inferDirection(fromCell: [number, number], toCell: [number, number]): number {
  const dx = toCell[0] - fromCell[0];
  const dy = toCell[1] - fromCell[1];
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const sector = Math.round(angle / 45) % 8;
  return SECTOR_DOORS[sector];
}

/** Human-readable summary of a staged op for the tray. */
export function describeOp(op: ExitOp, area: AreaFile): string {
  const section = roomsSectionOf(area);
  const nameOf = (vnum: number) => {
    const room = section?.rooms.find((r) => r.vnum === vnum);
    return room ? `${room.name} (#${vnum})` : `#${vnum}`;
  };
  switch (op.op) {
    case 'addExit':
      return `Add ${DOOR_NAMES[op.door]} exit: ${nameOf(op.from)} → ${nameOf(op.to)}${op.twoWay ? ' (two-way)' : ' (one-way)'}`;
    case 'updateExit':
      return `Update ${DOOR_NAMES[op.door]} exit on ${nameOf(op.from)}`;
    case 'removeExit':
      return `Remove ${DOOR_NAMES[op.door]} exit on ${nameOf(op.from)}${op.alsoReverse ? ' (and its reverse)' : ''}`;
  }
}
