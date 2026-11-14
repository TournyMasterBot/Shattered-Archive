/**
 * The player's own layer: rooms a player added to the map by hand or from their game history, each filed under a continent, an area and a
 * subzone. The layer is a MapFile of its own, kept apart from the published (audited) map and never written into it; `mergeLayer` lays it
 * over one published area when that area is shown. Pure: no clock, no storage, no network; the caller gives the date and the random source.
 *
 * Filing: a continent, area or subzone is either an existing one (its id is given, so the room lands in the published one) or a new one
 * (only a name is given; the id is derived from the name). The world is not a field here: a layer belongs to one world, which the caller
 * keeps (the DSL and the Simulacrum never share a layer).
 */

import { normalizeTitle, mintId } from '../identity.js';
import { buildIndex } from '../hierarchy.js';
import { layoutUnplaced } from '../layout.js';
import {
  cloneJson,
  DIRECTIONS,
  ID_PATTERN,
  LIMITS,
  type Area,
  type Continent,
  type Direction,
  type Link,
  type MapFile,
  type Room,
  type Subzone,
} from '../schema.js';

/** Where a room is filed. `*Id` set: an existing one (the name is only for display); unset: a new one with this name. */
export interface Place {
  continentId?: string;
  continent: string;
  areaId?: string;
  area: string;
  subzoneId?: string;
  subzone: string;
}

export interface AddRoomSpec {
  title: string;
  sector?: string;
  description?: string;
  place: Place;
  /** Direction -> the room the exit leads to (a published or layer room id), or `null` when the target is not known. */
  exits: Partial<Record<Direction, string | null>>;
  /** `walked`: sourced from the player's game history; `manual`: typed in. */
  source: 'walked' | 'manual';
  /** `YYYY-MM-DD` or a UTC timestamp. */
  at: string;
}

export type AddRoomResult = { ok: true; map: MapFile; roomId: string } | { ok: false; reason: string };

export function emptyLayer(): MapFile {
  return { version: 1, continents: [], links: [] };
}

/** A name as an id: lower case, runs of other characters become one hyphen, at most 40 characters; `x` when nothing is left. */
export function slugOf(name: string): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug === '' ? 'x' : slug;
}

function idsOf(map: MapFile): Set<string> {
  const ids = new Set<string>();
  for (const c of map.continents) for (const a of c.areas) for (const s of a.subzones) for (const r of s.rooms) ids.add(r.id);
  for (const l of map.links) ids.add(l.id);
  return ids;
}

function clean(text: string | undefined, max: number): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Adds a room to the layer. Refuses (with the reason) a missing title or name, an id that is not an id, a layer at the size cap, and an exit
 * that is not a direction. `avoid` holds ids that must not be minted (the published area's), so a new id cannot collide with one on screen.
 */
export function addRoomToLayer(
  layer: MapFile,
  spec: AddRoomSpec,
  random: () => number,
  avoid: ReadonlySet<string> = new Set(),
): AddRoomResult {
  const title = clean(spec.title, LIMITS.shortText);
  if (title === '') return { ok: false, reason: 'The room needs a title.' };
  const place = spec.place;
  const names = [clean(place.continent, LIMITS.shortText), clean(place.area, LIMITS.shortText), clean(place.subzone, LIMITS.shortText)];
  if (names.some((n) => n === '')) return { ok: false, reason: 'The room needs a continent, an area and a subzone.' };
  const given = [place.continentId, place.areaId, place.subzoneId];
  if (given.some((id) => id !== undefined && !ID_PATTERN.test(id))) return { ok: false, reason: 'A chosen place has an id that is not valid.' };
  for (const dir of Object.keys(spec.exits)) {
    if (!(DIRECTIONS as readonly string[]).includes(dir)) return { ok: false, reason: `"${dir}" is not a direction.` };
  }
  const out = cloneJson(layer);
  if (idsOf(out).size >= LIMITS.maxRooms) return { ok: false, reason: 'The layer is full.' };

  const continentId = place.continentId ?? `c-${slugOf(names[0])}`;
  const areaId = place.areaId ?? `a-${slugOf(names[1])}`;
  const subzoneId = place.subzoneId ?? `s-${slugOf(names[2])}`;
  const continent: Continent =
    out.continents.find((c) => c.id === continentId) ?? out.continents[out.continents.push({ id: continentId, name: names[0], areas: [] }) - 1];
  const area: Area =
    continent.areas.find((a) => a.id === areaId) ?? continent.areas[continent.areas.push({ id: areaId, name: names[1], placement: null, subzones: [] }) - 1];
  const subzone: Subzone =
    area.subzones.find((s) => s.id === subzoneId) ?? area.subzones[area.subzones.push({ id: subzoneId, name: names[2], kind: 'consistent', rooms: [] }) - 1];

  const inLayer = new Set<string>();
  for (const c of out.continents) for (const a of c.areas) for (const s of a.subzones) for (const r of s.rooms) inLayer.add(r.id);
  const taken = new Set<string>([...idsOf(out), ...avoid]);
  const roomId = mintId('r', taken, random);
  taken.add(roomId);
  const exits: Room['exits'] = {};
  const links: Link[] = [];
  for (const dir of DIRECTIONS) {
    if (!(dir in spec.exits)) continue;
    const to = spec.exits[dir] ?? null;
    const linkId = mintId('l', taken, random);
    taken.add(linkId);
    exits[dir] = linkId;
    links.push({
      id: linkId,
      from: roomId,
      dir,
      to,
      state: to === null ? 'unknown-target' : 'candidate',
      confidence: to === null ? 0 : 0.6,
      // the layer is a file of its own: a target that is not one of its rooms (a published room) counts as outside it, as the strict reader requires
      offPage: to !== null && !inLayer.has(to),
      traversals: 0,
      reverse: false,
      sources: [{ kind: spec.source, date: spec.at }],
    });
  }
  const sector = clean(spec.sector, LIMITS.shortText);
  const description = clean(spec.description, LIMITS.description);
  subzone.rooms.push({
    id: roomId,
    title,
    ...(sector === '' ? {} : { sector }),
    ...(description === '' ? {} : { description }),
    exits,
    sources: [{ kind: spec.source, date: spec.at }],
  });
  out.links.push(...links);
  return { ok: true, map: out, roomId };
}

/**
 * Removes a room (and the exits it started) from the layer; an exit of another layer room that led to it becomes an unknown target; empty
 * subzones, areas and continents go with it. Unknown id: the layer unchanged.
 */
export function removeRoomFromLayer(layer: MapFile, roomId: string): MapFile {
  const out = cloneJson(layer);
  out.links = out.links
    .filter((l) => l.from !== roomId)
    // an exit of another layer room that led here no longer leads anywhere known
    .map((l) => (l.to === roomId ? { ...l, to: null, state: 'unknown-target' as const, confidence: 0, offPage: false, reverse: false } : l));
  for (const c of out.continents) for (const a of c.areas) for (const s of a.subzones) s.rooms = s.rooms.filter((r) => r.id !== roomId);
  for (const c of out.continents) {
    for (const a of c.areas) a.subzones = a.subzones.filter((s) => s.rooms.length > 0);
    c.areas = c.areas.filter((a) => a.subzones.length > 0);
  }
  out.continents = out.continents.filter((c) => c.areas.length > 0);
  return out;
}

export interface LayerRoomInfo {
  roomId: string;
  title: string;
  areaId: string;
  areaName: string;
  continentId: string;
  subzoneId: string;
}

/** Every layer room with the place it is filed in (for the search and for "which area is this room in"). */
export function layerRooms(layer: MapFile): LayerRoomInfo[] {
  const rows: LayerRoomInfo[] = [];
  for (const c of layer.continents)
    for (const a of c.areas)
      for (const s of a.subzones)
        for (const r of s.rooms) rows.push({ roomId: r.id, title: r.title, areaId: a.id, areaName: a.name, continentId: c.id, subzoneId: s.id });
  return rows;
}

/** Layer rooms whose title contains the text (case and spacing ignored), in the order they were added. */
export function searchLayer(layer: MapFile, q: string): LayerRoomInfo[] {
  const needle = normalizeTitle(q);
  if (needle === '') return [];
  return layerRooms(layer).filter((row) => normalizeTitle(row.title).includes(needle));
}

/** Only the part of the layer filed under one area, as a map file of its own (null when nothing is). */
export function layerOfArea(layer: MapFile, areaId: string): MapFile | null {
  const continents: Continent[] = [];
  for (const c of layer.continents) {
    const area = c.areas.find((a) => a.id === areaId);
    if (area) continents.push({ ...c, areas: [area] });
  }
  if (continents.length === 0) return null;
  const ids = new Set<string>();
  for (const c of continents) for (const a of c.areas) for (const s of a.subzones) for (const r of s.rooms) ids.add(r.id);
  return { version: 1, continents: cloneJson(continents), links: cloneJson(layer.links.filter((l) => ids.has(l.from))) };
}

/**
 * Lays the layer's rooms over a published map (one area's file): their continent, area and subzone are joined by id or added; a room whose id
 * the published map has already is skipped; each link is marked `offPage` when its target is not in the same area of the merged file; then the
 * rooms with no position are placed by their exits next to the rooms that have one. The published map is never changed (a copy is returned).
 */
export function mergeLayer(base: MapFile, layer: MapFile): MapFile {
  const out = cloneJson(base);
  const have = idsOf(out);
  const added = new Set<string>();
  for (const lc of layer.continents) {
    const continent = out.continents.find((c) => c.id === lc.id) ?? out.continents[out.continents.push({ id: lc.id, name: lc.name, areas: [] }) - 1];
    for (const la of lc.areas) {
      const area = continent.areas.find((a) => a.id === la.id) ?? continent.areas[continent.areas.push({ id: la.id, name: la.name, placement: null, subzones: [] }) - 1];
      for (const ls of la.subzones) {
        const subzone = area.subzones.find((s) => s.id === ls.id) ?? area.subzones[area.subzones.push({ id: ls.id, name: ls.name, kind: ls.kind, rooms: [] }) - 1];
        for (const room of ls.rooms) {
          if (have.has(room.id)) continue;
          subzone.rooms.push(cloneJson(room));
          added.add(room.id);
          have.add(room.id);
        }
      }
    }
  }
  if (added.size === 0) return out;
  for (const link of layer.links) {
    if (!added.has(link.from) || out.links.some((l) => l.id === link.id)) continue;
    out.links.push(cloneJson(link));
  }
  const index = buildIndex(out);
  for (const link of out.links) {
    if (!added.has(link.from)) continue;
    const from = index.rooms.get(link.from);
    const to = link.to === null ? undefined : index.rooms.get(link.to);
    link.offPage = link.to !== null && (to === undefined || to.areaId !== from?.areaId);
  }
  return layoutUnplaced(out).map;
}
