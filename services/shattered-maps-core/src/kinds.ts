/**
 * Marking mazes: which subzones keep their rooms in place and which do not.
 *
 * A subzone has a `kind` (schema: 'consistent', 'maze', 'teleport', 'loop'). Imported maps mark every one 'consistent', and the renderer draws
 * a maze, a teleport run or a loop apart (coloured hexes) and keeps its links from turning into a tangle of long lines. This proposes the kinds
 * from the data and applies the ones the owner confirmed: the detector never changes a map by itself.
 *
 * The test is the exits themselves: an exit "leads straight on" when its target lies the way the exit points (see `classifyLink`); a subzone
 * where many exits do not is a maze or a teleport run. Only exits whose target is in the same subzone are counted.
 */
import { classifyLink } from './render.js';
import type { Coords, MapFile, SubzoneKind } from './schema.js';

export interface KindProposal {
  continentId: string;
  areaId: string;
  areaName: string;
  subzoneId: string;
  subzoneName: string;
  /** The kind proposed. */
  kind: Exclude<SubzoneKind, 'consistent'>;
  /** Exits counted (target in the same subzone), and how many of them do not lead straight on. */
  exits: number;
  twisted: number;
  /** twisted / exits, 0 to 1. */
  share: number;
}

export interface ProposeOptions {
  /** Fewest counted exits for a proposal (small subzones prove nothing). Default 30. */
  minExits?: number;
  /** Smallest share of exits that do not lead straight on. Default 0.3. */
  minShare?: number;
}

/** Subzones of kind 'consistent' that look like mazes, worst first. */
export function proposeKinds(map: MapFile, options: ProposeOptions = {}): KindProposal[] {
  const minExits = options.minExits ?? 30;
  const minShare = options.minShare ?? 0.3;
  const linkById = new Map(map.links.map((l) => [l.id, l] as const));
  const out: KindProposal[] = [];
  const none: ReadonlySet<string> = new Set();
  for (const continent of map.continents)
    for (const area of continent.areas)
      for (const subzone of area.subzones) {
        if (subzone.kind !== 'consistent') continue;
        const coords = new Map<string, Coords>();
        for (const r of subzone.rooms) if (r.coords && r.aliasOf === undefined) coords.set(r.id, r.coords);
        let exits = 0;
        let twisted = 0;
        for (const r of subzone.rooms) {
          const from = coords.get(r.id);
          if (!from) continue;
          for (const linkId of Object.values(r.exits)) {
            const link = linkById.get(linkId);
            const to = link?.to ? coords.get(link.to) : undefined;
            if (!link || !to) continue;
            exits += 1;
            // a horizontal exit that changes floor does not lead straight on either
            if (link.dir !== 'U' && link.dir !== 'D' && (to.z ?? 0) !== (from.z ?? 0)) twisted += 1;
            else if (classifyLink(link.dir, from, to, none) !== 'clean') twisted += 1;
          }
        }
        const share = exits === 0 ? 0 : twisted / exits;
        if (exits >= minExits && share >= minShare)
          out.push({ continentId: continent.id, areaId: area.id, areaName: area.name, subzoneId: subzone.id, subzoneName: subzone.name, kind: 'maze', exits, twisted, share });
      }
  return out.sort((a, b) => b.share - a.share || b.exits - a.exits);
}

export interface KindsApplied {
  map: MapFile;
  /** Subzone ids that were changed, and ids the map does not have. */
  changed: string[];
  unknown: string[];
}

/** The map with the given subzones' kinds set (`{ "<subzone id>": "maze" }`). The input map is not changed. */
export function applyKinds(map: MapFile, kinds: Readonly<Record<string, SubzoneKind>>): KindsApplied {
  const wanted = new Map(Object.entries(kinds));
  const changed: string[] = [];
  const next: MapFile = {
    ...map,
    continents: map.continents.map((c) => ({
      ...c,
      areas: c.areas.map((a) => ({
        ...a,
        subzones: a.subzones.map((s) => {
          const kind = wanted.get(s.id);
          if (kind === undefined) return s;
          wanted.delete(s.id);
          if (kind === s.kind) return s;
          changed.push(s.id);
          return { ...s, kind };
        }),
      })),
    })),
  };
  return { map: next, changed, unknown: [...wanted.keys()] };
}
