/**
 * The Simulacrum's map is read from the area files by this package; the MUD Builder reads the same files with the same parser and draws
 * them. If the two ever disagree about a room or an exit, one of them is wrong, so this compares them.
 *
 * The Builder's side arrives as plain data in the shape its map route serves (`AreaMapRoom`): per file, its rooms with name, door, target
 * and, for a target in another file, the file it lives in. This module has no dependency on the Builder; `scripts/check-against-builder.mjs`
 * feeds it the Builder's own `mapRooms`.
 *
 * What is compared, per file: the set of room numbers, each room's title, and each live exit (door, target, and whether the target is in
 * another file). An exit the Builder shows with no room behind it ("dead") is not in this package's map, so dead exits are only counted:
 * the totals must agree. A difference is described in words, up to a cap; the counts are always complete.
 */

import type { Direction, Link, MapFile } from '../schema.js';
import { DOOR_DIRECTIONS, playerText } from './merc.js';

export interface BuilderExit {
  door: number;
  toVnum: number;
  /** Present when the target room lives in another file. */
  external?: { file: string; name: string };
}
export interface BuilderRoom {
  vnum: number;
  name: string;
  exits: BuilderExit[];
}
export interface BuilderAreaView {
  file: string;
  rooms: BuilderRoom[];
}

export interface BuilderComparison {
  ok: boolean;
  areas: number;
  rooms: number;
  /** Live exits (an internal or cross-file target). */
  exits: number;
  crossFile: number;
  /** Exits with no room behind them, in the Builder's view. */
  dead: number;
  differences: string[];
}

export const DIFFERENCE_CAP = 50;

export function compareWithBuilder(map: MapFile, views: readonly BuilderAreaView[], expectedDead: number): BuilderComparison {
  const differences: string[] = [];
  let total = 0;
  const note = (text: string): void => {
    total += 1;
    if (differences.length < DIFFERENCE_CAP) differences.push(text);
  };
  const result: BuilderComparison = { ok: false, areas: 0, rooms: 0, exits: 0, crossFile: 0, dead: 0, differences };

  const linkById = new Map(map.links.map((l) => [l.id, l]));
  const ours = new Map<string, { rooms: Map<number, { title: string; exits: Map<number, { to: number; offPage: boolean }> }> }>();
  for (const continent of map.continents)
    for (const area of continent.areas) {
      const file = area.sources?.[0]?.ref ?? area.id;
      const rooms = new Map<number, { title: string; exits: Map<number, { to: number; offPage: boolean }> }>();
      for (const subzone of area.subzones)
        for (const room of subzone.rooms) {
          const exits = new Map<number, { to: number; offPage: boolean }>();
          for (const [dir, linkId] of Object.entries(room.exits)) {
            const link = linkById.get(linkId as string) as Link;
            exits.set(DOOR_DIRECTIONS.indexOf(dir as Direction), { to: Number((link.to as string).replace(/^mr/, '')), offPage: link.offPage });
          }
          rooms.set(room.vnum as number, { title: room.title, exits });
        }
      ours.set(file, { rooms });
    }

  const seen = new Set<string>();
  for (const view of views) {
    seen.add(view.file);
    const mine = ours.get(view.file);
    const builderVnums = new Set(view.rooms.map((r) => r.vnum));
    if (mine === undefined) {
      if (view.rooms.length > 0) note(`${view.file}: the Builder has ${view.rooms.length} rooms and this map has no such area`);
      continue;
    }
    result.areas += 1;
    for (const room of view.rooms) {
      result.rooms += 1;
      const ourRoom = mine.rooms.get(room.vnum);
      if (ourRoom === undefined) {
        note(`${view.file}: room ${room.vnum} is in the Builder and not in this map`);
        continue;
      }
      // the Builder shows the raw text with its colour sigils; the map holds what a player reads
      const builderTitle = playerText(room.name).trim();
      if (ourRoom.title !== builderTitle) note(`${view.file}: room ${room.vnum} is "${builderTitle}" in the Builder and "${ourRoom.title}" here`);
      const live = new Map<number, BuilderExit>();
      for (const exit of room.exits) {
        const alive = exit.external !== undefined || builderVnums.has(exit.toVnum);
        if (!alive) result.dead += 1;
        else if (!live.has(exit.door)) live.set(exit.door, exit);
      }
      for (const [door, exit] of live) {
        result.exits += 1;
        if (exit.external !== undefined) result.crossFile += 1;
        const link = ourRoom.exits.get(door);
        if (link === undefined) note(`${view.file}: room ${room.vnum} door ${door} leads to ${exit.toVnum} in the Builder and nowhere here`);
        else if (link.to !== exit.toVnum) note(`${view.file}: room ${room.vnum} door ${door} leads to ${exit.toVnum} in the Builder and ${link.to} here`);
        else if (link.offPage !== (exit.external !== undefined))
          note(`${view.file}: room ${room.vnum} door ${door}: the Builder says ${exit.external !== undefined ? 'another file' : 'the same file'}, this map says the other`);
      }
      for (const door of ourRoom.exits.keys()) if (!live.has(door)) note(`${view.file}: room ${room.vnum} door ${door} is here and not a live exit in the Builder`);
    }
    for (const vnum of mine.rooms.keys()) if (!builderVnums.has(vnum)) note(`${view.file}: room ${vnum} is here and not in the Builder`);
  }
  for (const file of ours.keys()) if (!seen.has(file)) note(`${file}: this map has the area and the Builder did not report it`);
  if (result.dead !== expectedDead) note(`dead exits: the Builder shows ${result.dead} and the import counted ${expectedDead}`);

  result.ok = total === 0;
  return result;
}
