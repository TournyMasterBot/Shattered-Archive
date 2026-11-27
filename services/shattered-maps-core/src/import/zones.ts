/**
 * The CMud zone rules: which zone of the community map is a continent, an area or a subzone of the neutral map.
 *
 * The community map (a CMud database) keeps zones in a tree with `Parent`: a root zone has parent -1. Measured on the real database
 * (docs/shattered-maps/import-azah.md): 7 roots whose names are the continents and which hold no rooms, 389 zones whose parent is a root
 * and which hold every room, and nothing deeper. The rules are written for the general tree, so a deeper chain still lands somewhere:
 *
 *   depth 1 (parent -1)             a CONTINENT
 *   depth 2 (parent is a continent) an AREA, its rooms in one subzone of its own
 *   depth 3 or more                 a SUBZONE of its depth-2 ancestor (the area)
 *
 * Names are only used for display (an all-capitals name is shown in capitals-and-lower-case) and for one hint: a name containing "maze"
 * makes the subzone kind `maze` (the importer lists these so they can be checked). Nothing is regrouped by name. A zone whose chain does not reach a root (a parent that is not in
 * the table, a loop, or an ancestor that is itself broken) is UNMATCHED: it is listed, never guessed into the tree; its rooms are kept
 * in a separate "unsorted" continent by the importer.
 *
 * Pure: zone rows and room counts in, a plan out.
 */

import type { SubzoneKind } from '../schema.js';

export interface ZoneRow {
  zoneId: number;
  name: string;
  /** -1 for a root zone. */
  parent: number | null;
}

export type ZoneRole = 'continent' | 'area' | 'subzone';
export type UnmatchedReason = 'orphan-parent' | 'cycle' | 'unmatched-ancestor' | 'duplicate-id';

export interface ZonePlan {
  zoneId: number;
  role: ZoneRole;
  /** 1 for a root. */
  depth: number;
  /** The root zone of its chain. */
  continent: number;
  /** The depth-2 zone of its chain; undefined for a continent. */
  area: number | undefined;
  name: string;
  kind: SubzoneKind;
  /** Rooms the table says belong to this zone itself (not its descendants). */
  rooms: number;
}

export interface UnmatchedZone {
  zoneId: number;
  name: string;
  reason: UnmatchedReason;
  rooms: number;
}

export interface ZoneRules {
  plans: Map<number, ZonePlan>;
  unmatched: UnmatchedZone[];
  /** Zones that hold no rooms and have no children: nothing to show, but not a problem. */
  empty: number[];
}

/** How deep a chain may be before it is called a cycle. */
const MAX_DEPTH = 32;

/** A name to show: spacing tidied; an ALL-CAPITALS name (the roots) in capitals-and-lower-case; `Zone <id>` when there is none. */
export function tidyName(raw: string | null | undefined, fallback: string): string {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (name === '') return fallback;
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[ -])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

export function planZones(zones: readonly ZoneRow[], roomCounts: ReadonlyMap<number, number>): ZoneRules {
  const byId = new Map<number, ZoneRow>();
  const unmatched: UnmatchedZone[] = [];
  const rooms = (id: number): number => roomCounts.get(id) ?? 0;
  const fallbackName = (z: ZoneRow): string => tidyName(z.name, `Zone ${z.zoneId}`);
  for (const zone of zones) {
    if (byId.has(zone.zoneId))
      unmatched.push({ zoneId: zone.zoneId, name: fallbackName(zone), reason: 'duplicate-id', rooms: 0 });
    else byId.set(zone.zoneId, zone);
  }

  // the chain from a zone to its root, or why there is none
  const chainOf = (zone: ZoneRow): { chain: number[] } | { reason: UnmatchedReason } => {
    const chain = [zone.zoneId];
    const seen = new Set(chain);
    let current = zone;
    for (let steps = 0; steps < MAX_DEPTH; steps += 1) {
      if (current.parent === -1) return { chain };
      const next = current.parent === null ? undefined : byId.get(current.parent);
      if (next === undefined) return { reason: chain.length === 1 ? 'orphan-parent' : 'unmatched-ancestor' };
      if (seen.has(next.zoneId)) return { reason: 'cycle' };
      seen.add(next.zoneId);
      chain.push(next.zoneId);
      current = next;
    }
    return { reason: 'cycle' };
  };

  const hasChild = new Set<number>();
  for (const zone of byId.values()) if (zone.parent !== null && zone.parent !== -1) hasChild.add(zone.parent);

  const plans = new Map<number, ZonePlan>();
  const empty: number[] = [];
  for (const zone of byId.values()) {
    const found = chainOf(zone);
    if ('reason' in found) {
      unmatched.push({
        zoneId: zone.zoneId,
        name: fallbackName(zone),
        reason: found.reason,
        rooms: rooms(zone.zoneId),
      });
      continue;
    }
    const { chain } = found;
    const depth = chain.length;
    const name = fallbackName(zone);
    plans.set(zone.zoneId, {
      zoneId: zone.zoneId,
      role: depth === 1 ? 'continent' : depth === 2 ? 'area' : 'subzone',
      depth,
      continent: chain[chain.length - 1],
      area: depth === 1 ? undefined : chain[chain.length - 2],
      name,
      kind: /maze/i.test(name) ? 'maze' : 'consistent',
      rooms: rooms(zone.zoneId),
    });
    if (rooms(zone.zoneId) === 0 && !hasChild.has(zone.zoneId)) empty.push(zone.zoneId);
  }
  unmatched.sort((a, b) => a.zoneId - b.zoneId);
  empty.sort((a, b) => a - b);
  return { plans, unmatched, empty };
}
