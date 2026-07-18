import type { Application, Request, Response } from 'express';
import type { AreaFile, AreaHeaderSection, Room } from '@shatteredarchive/merc-area';

import { AreaStoreError, type AreaStore } from '../area-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Read-only map aggregates (Phase 12): GET /api/map/:file returns
 *   one area's rooms + exits with cross-area exit targets resolved via the
 *   world vnum index; GET /api/map returns the world graph (areas as nodes,
 *   directional links aggregated from resolved cross-area exits).
 * @ai-public registerMapRoutes, AreaMapRoom, AreaMapResponse, WorldMapResponse
 * @ai-notes Pure view over existing store reads — never writes, never audited
 *   (GET). Unparseable files appear in the world map with parseError and zero
 *   rooms, mirroring /api/world. An exit is "external" only when its target is
 *   NOT defined in the area's own rooms AND some listed area defines it;
 *   dangling targets carry neither flag (the client renders them dimmed).
 */

export interface AreaMapExit {
  /** Door direction 0-9 (N E S W U D NE NW SE SW). */
  door: number;
  toVnum: number;
  /** Lock state 0-4 (0 = open passage; 1+ = door variants per db.c). */
  locks: number;
  /** Present when the target room lives in another listed area. */
  external?: { file: string; name: string };
}

/** A `warp <vnum>` teleport declared by a room entry script (Phase 12b). */
export interface AreaMapWarp {
  toVnum: number;
  external?: { file: string; name: string };
}

export interface AreaMapRoom {
  vnum: number;
  name: string;
  sectorType: number;
  exits: AreaMapExit[];
  /** Present only when the room has script warps. */
  warps?: AreaMapWarp[];
}

export interface AreaMapResponse {
  file: string;
  name?: string;
  minVnum?: number;
  maxVnum?: number;
  rooms: AreaMapRoom[];
}

export interface WorldMapArea {
  file: string;
  name?: string;
  minVnum?: number;
  maxVnum?: number;
  rooms: number;
  parseError?: string;
}

/** Directional cross-area connection: exits from `from`'s rooms into `to`. */
export interface WorldMapLink {
  from: string;
  to: string;
  count: number;
  exits: { fromVnum: number; door: number; toVnum: number; toName: string }[];
}

export interface WorldMapResponse {
  areas: WorldMapArea[];
  links: WorldMapLink[];
}

function areaRooms(area: AreaFile): Room[] {
  const rooms: Room[] = [];
  for (const s of area.sections) {
    if (s.kind === 'rooms') rooms.push(...s.rooms);
  }
  return rooms;
}

type RoomIndex = Map<number, { file: string; name: string }>;

function mapRooms(file: string, area: AreaFile, worldRooms: RoomIndex): AreaMapRoom[] {
  const own = new Set(areaRooms(area).map((r) => r.vnum));
  const resolve = (toVnum: number): { file: string; name: string } | undefined => {
    if (toVnum < 0 || own.has(toVnum)) return undefined;
    const hit = worldRooms.get(toVnum);
    // The index includes this file too; only a genuinely foreign hit links.
    return hit && hit.file !== file ? hit : undefined;
  };

  // Room-script warps (Phase 12b): `warp <vnum>` lines on R-attached scripts.
  const warpsByRoom = new Map<number, AreaMapWarp[]>();
  for (const s of area.sections) {
    if (s.kind !== 'scripts') continue;
    for (const sc of s.scripts) {
      if (sc.attach !== 'room') continue;
      for (const line of sc.body.split('\n')) {
        const m = /^\s*warp\s+(-?\d+)/.exec(line);
        if (!m) continue;
        const toVnum = Number(m[1]);
        const warp: AreaMapWarp = { toVnum };
        const external = resolve(toVnum);
        if (external) warp.external = external;
        const list = warpsByRoom.get(sc.mobVnum) ?? [];
        list.push(warp);
        warpsByRoom.set(sc.mobVnum, list);
      }
    }
  }

  return areaRooms(area).map((room) => {
    const out: AreaMapRoom = {
      vnum: room.vnum,
      name: room.name,
      sectorType: room.sectorType,
      exits: room.exits.map((exit) => {
        const ex: AreaMapExit = { door: exit.door, toVnum: exit.toVnum, locks: exit.locks };
        const external = resolve(exit.toVnum);
        if (external) ex.external = external;
        return ex;
      }),
    };
    const warps = warpsByRoom.get(room.vnum);
    if (warps) out.warps = warps;
    return out;
  });
}

export function registerMapRoutes(app: Application, store: AreaStore): void {
  app.get('/api/map', (_req: Request, res: Response) => {
    try {
      const worldRooms = store.worldVnumIndex().room;
      const areas: WorldMapArea[] = [];
      const linkMap = new Map<string, WorldMapLink>();
      for (const entry of store.listAreas()) {
        try {
          const area = store.readArea(entry.file);
          const rooms = mapRooms(entry.file, area, worldRooms);
          areas.push({
            file: entry.file,
            name: entry.name,
            minVnum: entry.minVnum,
            maxVnum: entry.maxVnum,
            rooms: rooms.length,
          });
          for (const room of rooms) {
            for (const exit of room.exits) {
              if (!exit.external) continue;
              const key = `${entry.file}\n${exit.external.file}`;
              let link = linkMap.get(key);
              if (!link) {
                link = { from: entry.file, to: exit.external.file, count: 0, exits: [] };
                linkMap.set(key, link);
              }
              link.count += 1;
              link.exits.push({ fromVnum: room.vnum, door: exit.door, toVnum: exit.toVnum, toName: exit.external.name });
            }
          }
        } catch (e) {
          areas.push({ file: entry.file, rooms: 0, parseError: (e as Error).message });
        }
      }
      const body: WorldMapResponse = { areas, links: [...linkMap.values()] };
      res.json(body);
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });

  app.get('/api/map/:file', (req: Request, res: Response) => {
    try {
      const file = String(req.params.file);
      const area = store.readArea(file);
      const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
      const body: AreaMapResponse = {
        file,
        name: header?.name,
        minVnum: header?.minVnum,
        maxVnum: header?.maxVnum,
        rooms: mapRooms(file, area, store.worldVnumIndex().room),
      };
      res.json(body);
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });
}
