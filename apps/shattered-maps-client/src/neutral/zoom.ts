import { buildIndex, type MapFile, type SliceLevel } from '@shatteredarchive/shattered-maps-core';

/**
 * Zoom navigation over a neutral map: the four levels, the path from the continent down to the focus, and one step in or out.
 * Pure selectors; the viewer keeps only a `Focus` and asks these what is above, below and beside it.
 */

export interface Focus {
  level: SliceLevel;
  id: string;
}

/** Outermost to innermost. */
export const LEVELS: readonly SliceLevel[] = ['continent', 'area', 'subzone', 'room'];

export interface Crumb extends Focus {
  name: string;
}

export interface Child extends Focus {
  name: string;
  /** Rooms below it (for a room: 1). */
  rooms: number;
}

const liveCount = (rooms: readonly { aliasOf?: string }[]): number => rooms.filter((r) => r.aliasOf === undefined).length;

/** The focus to open a map on: its first continent, or `null` when the map is empty. */
export function defaultFocus(map: MapFile): Focus | null {
  const first = map.continents[0];
  return first ? { level: 'continent', id: first.id } : null;
}

/** The path from the continent to `focus`, outermost first. Empty when the focus is not in the map. */
export function breadcrumb(map: MapFile, focus: Focus): Crumb[] {
  const index = buildIndex(map);
  const continentName = (id: string): string => map.continents.find((c) => c.id === id)!.name; // only called with a continent that exists
  if (focus.level === 'continent') {
    return map.continents.some((c) => c.id === focus.id) ? [{ ...focus, name: continentName(focus.id) }] : [];
  }
  if (focus.level === 'area') {
    const entry = index.areas.get(focus.id);
    if (!entry) return [];
    return [
      { level: 'continent', id: entry.continentId, name: continentName(entry.continentId) },
      { ...focus, name: entry.area.name },
    ];
  }
  if (focus.level === 'subzone') {
    for (const continent of map.continents)
      for (const area of continent.areas) {
        const subzone = area.subzones.find((s) => s.id === focus.id);
        if (subzone)
          return [
            { level: 'continent', id: continent.id, name: continent.name },
            { level: 'area', id: area.id, name: area.name },
            { ...focus, name: subzone.name },
          ];
      }
    return [];
  }
  const found = index.rooms.get(focus.id);
  if (!found || found.room.aliasOf !== undefined) return [];
  const area = index.areas.get(found.areaId)!;
  const subzone = area.area.subzones.find((s) => s.id === found.subzoneId)!;
  return [
    { level: 'continent', id: found.continentId, name: continentName(found.continentId) },
    { level: 'area', id: found.areaId, name: area.area.name },
    { level: 'subzone', id: found.subzoneId, name: subzone.name },
    { ...focus, name: found.room.title },
  ];
}

/** One step out, or `null` at the continent. An unknown focus also has no parent. */
export function zoomOut(map: MapFile, focus: Focus): Focus | null {
  const path = breadcrumb(map, focus);
  if (path.length < 2) return null;
  const parent = path[path.length - 2];
  return { level: parent.level, id: parent.id };
}

/** What lies one level below the focus: areas of a continent, subzones of an area, rooms of a subzone. A room has none. */
export function children(map: MapFile, focus: Focus): Child[] {
  if (focus.level === 'continent') {
    const continent = map.continents.find((c) => c.id === focus.id);
    const areas = (continent?.areas ?? []).map((a) => ({
      level: 'area' as const,
      id: a.id,
      name: a.name,
      rooms: a.subzones.reduce((n, s) => n + liveCount(s.rooms), 0),
    }));
    // areas that hold rooms first, in the file's order; the empty ones (a catalog lists hundreds nobody has mapped) after them
    return [...areas.filter((a) => a.rooms > 0), ...areas.filter((a) => a.rooms === 0)];
  }
  if (focus.level === 'area') {
    const area = buildIndex(map).areas.get(focus.id)?.area;
    return (area?.subzones ?? []).map((s) => ({ level: 'subzone' as const, id: s.id, name: s.name, rooms: liveCount(s.rooms) }));
  }
  if (focus.level === 'subzone') {
    for (const continent of map.continents)
      for (const area of continent.areas) {
        const subzone = area.subzones.find((s) => s.id === focus.id);
        if (subzone)
          return subzone.rooms.filter((r) => r.aliasOf === undefined).map((r) => ({ level: 'room' as const, id: r.id, name: r.title, rooms: 1 }));
      }
  }
  return [];
}

/**
 * One step in. With no `target`, it is the only child when there is exactly one (an area with a single subzone opens it), else `null`
 * (the viewer shows the children to choose from). With a `target`, that child, when it is one.
 */
export function zoomIn(map: MapFile, focus: Focus, target?: string): Focus | null {
  const below = children(map, focus);
  if (target !== undefined) {
    const hit = below.find((c) => c.id === target);
    return hit ? { level: hit.level, id: hit.id } : null;
  }
  return below.length === 1 ? { level: below[0].level, id: below[0].id } : null;
}

/** The floors (z values) among rooms, ascending, each with how many rooms it holds; rooms without coordinates are not on a floor. */
export function floorsOf(rooms: readonly { coords?: { z?: number } }[]): { z: number; rooms: number }[] {
  const counts = new Map<number, number>();
  for (const room of rooms) {
    if (room.coords === undefined) continue;
    const z = room.coords.z ?? 0;
    counts.set(z, (counts.get(z) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([z, n]) => ({ z, rooms: n }));
}

/** The floor to open on: the one with the most rooms (the lowest of equals). `0` when nothing is placed. */
export function busiestFloor(rooms: readonly { coords?: { z?: number } }[]): number {
  const floors = floorsOf(rooms);
  if (floors.length === 0) return 0;
  return floors.reduce((best, f) => (f.rooms > best.rooms ? f : best)).z;
}
