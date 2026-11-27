/**
 * Who a room is and how sure we are of an exit: the identity rules.
 *
 * Rooms: an id is minted at random and never built from the title (titles repeat across the world) or the vnum. A view
 * of a room is matched to a known room by the exit that led to it first, then by title inside the SAME area with a
 * compatible exit set (one set contains the other, so a hidden exit appearing does not make a second room). Where
 * that is not unique the answer is `ambiguous` and the caller keeps them apart: two rooms wrongly kept apart are
 * merged later by the owner; two wrongly merged show up as conflicts and are separated with `splitRoom`/`undoMerge`.
 *
 * Links: the evidence states of docs diagram D12 and nothing more.
 *   unknown-target  the exit is known, where it goes is not                 confidence 0
 *   candidate       walked once in one direction                            0.6
 *   confirmed       walked there and back                                   0.95
 *   conflict        a later walk of the same exit arrived somewhere else    0
 * Not seeing an exit again is NOT evidence against it (doors and hidden exits come and go), so only a walk can
 * contradict a link.
 *
 * Everything here is pure: the map is never changed, a changed copy is returned, and ids come from a caller-supplied
 * random source.
 */

import { mergeBaselines } from './baseline.js';
import { buildIndex, resolveAlias, type MapIndex } from './hierarchy.js';
import {
  cloneJson,
  DIRECTIONS,
  ID_PATTERN,
  LIMITS,
  OPPOSITE,
  type Direction,
  type HistoryEvent,
  type Link,
  type MapFile,
  type MapSource,
  type MergeUndo,
  type Room,
} from './schema.js';

export const SINGLE_TRAVERSAL_CONFIDENCE = 0.6;
export const CONFIRMED_CONFIDENCE = 0.95;

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ID_LENGTH = 10;

/** Case and spacing do not tell two titles apart. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * A fresh id: the prefix (`r` room, `l` link) and ten random characters. It takes no title and no vnum on purpose.
 * `random` returns [0, 1); anything else is clamped. Throws only when 64 draws in a row hit taken ids (a broken source).
 */
export function mintId(prefix: 'r' | 'l', taken: ReadonlySet<string>, random: () => number): string {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let id = prefix;
    for (let i = 0; i < ID_LENGTH; i += 1) {
      const r = random();
      const slot = Number.isFinite(r)
        ? Math.min(ID_ALPHABET.length - 1, Math.max(0, Math.floor(r * ID_ALPHABET.length)))
        : 0;
      id += ID_ALPHABET[slot];
    }
    if (!taken.has(id)) return id;
  }
  throw new Error('could not mint a free id: the random source keeps returning taken values');
}

// ---------------------------------------------------------------------------------------------------------------------
// Matching a view to a room
// ---------------------------------------------------------------------------------------------------------------------

export interface RoomObservation {
  title: string;
  /** The area the walker is in, when known. `null`: a place not placed in any area yet, which matches nothing by title. */
  areaId: string | null;
  /** The exits the view showed. */
  exits: readonly Direction[];
  /** The exit that was just taken to get here, when the walker came by one. */
  arrivedBy?: { from: string; dir: Direction };
}

export type RoomMatch =
  | { kind: 'existing'; id: string; reason: 'link' | 'title' }
  | { kind: 'new' }
  | { kind: 'ambiguous'; candidates: string[] };

function exitsCompatible(known: readonly Direction[], seen: readonly Direction[]): boolean {
  const a = new Set(known);
  const b = new Set(seen);
  const aInB = [...a].every((d) => b.has(d));
  const bInA = [...b].every((d) => a.has(d));
  return aInB || bInA;
}

export function matchRoom(index: MapIndex, observation: RoomObservation): RoomMatch {
  const title = normalizeTitle(observation.title);
  if (observation.arrivedBy) {
    const from = index.rooms.get(observation.arrivedBy.from);
    const link = from ? index.links.get(from.room.exits[observation.arrivedBy.dir] ?? '') : undefined;
    if (link && link.to !== null && link.state !== 'conflict') {
      const target = resolveAlias(index, link.to);
      const found = target === null ? undefined : index.rooms.get(target);
      if (found && normalizeTitle(found.room.title) === title)
        return { kind: 'existing', id: found.room.id, reason: 'link' };
    }
  }
  if (observation.areaId === null) return { kind: 'new' };
  const candidates: string[] = [];
  for (const { room, areaId } of index.rooms.values()) {
    if (areaId !== observation.areaId || room.aliasOf !== undefined || normalizeTitle(room.title) !== title) continue;
    const known = DIRECTIONS.filter((d) => room.exits[d] !== undefined);
    if (exitsCompatible(known, observation.exits)) candidates.push(room.id);
  }
  if (candidates.length === 0) return { kind: 'new' };
  if (candidates.length === 1) return { kind: 'existing', id: candidates[0], reason: 'title' };
  return { kind: 'ambiguous', candidates: candidates.sort() };
}

// ---------------------------------------------------------------------------------------------------------------------
// Link evidence (docs diagram D12)
// ---------------------------------------------------------------------------------------------------------------------

export interface Traversal {
  from: string;
  dir: Direction;
  to: string;
  /** The play day of the walk. */
  at: string;
}

function newLink(id: string, patch: Partial<Link> & Pick<Link, 'from' | 'dir'>): Link {
  return {
    to: null,
    state: 'unknown-target',
    confidence: 0,
    offPage: false,
    traversals: 0,
    reverse: false,
    ...patch,
    id,
  };
}

/** An exit seen in a view, with no idea yet where it goes. A slot that already has a link is left as it is. */
export function declareExit(
  links: readonly Link[],
  from: string,
  dir: Direction,
  newId: () => string,
): { links: Link[]; link: Link } {
  const existing = links.find((l) => l.from === from && l.dir === dir);
  if (existing) return { links: [...links], link: existing };
  const link = newLink(newId(), { from, dir });
  return { links: [...links, link], link };
}

/** The links after one walk through an exit, and the link that walk is about. */
export function applyTraversal(
  links: readonly Link[],
  t: Traversal,
  newId: () => string,
): { links: Link[]; link: Link } {
  const out = [...links];
  const at = out.findIndex((l) => l.from === t.from && l.dir === t.dir);
  let link: Link;
  let fresh = false;
  if (at < 0) {
    link = newLink(newId(), {
      from: t.from,
      dir: t.dir,
      to: t.to,
      state: 'candidate',
      confidence: SINGLE_TRAVERSAL_CONFIDENCE,
      traversals: 1,
      lastWalked: t.at,
    });
    out.push(link);
    fresh = true;
  } else {
    const prior = out[at];
    const traversals = Math.min(prior.traversals + 1, LIMITS.maxTraversals);
    if (prior.to === null) {
      link = {
        ...prior,
        to: t.to,
        state: 'candidate',
        confidence: SINGLE_TRAVERSAL_CONFIDENCE,
        traversals,
        lastWalked: t.at,
      };
      fresh = true;
    } else if (prior.to === t.to) {
      link = { ...prior, traversals, lastWalked: t.at };
      if (prior.state === 'conflict') {
        link.state = 'candidate';
        link.confidence = SINGLE_TRAVERSAL_CONFIDENCE;
        delete link.conflictTo;
      }
    } else {
      const others = [...new Set([...(prior.conflictTo ?? []), t.to])].slice(0, LIMITS.maxConflictTargets);
      link = { ...prior, state: 'conflict', confidence: 0, conflictTo: others, traversals, lastWalked: t.at };
    }
    out[at] = link;
  }
  if (fresh) {
    const backAt = out.findIndex(
      (l) => l.from === t.to && l.dir === OPPOSITE[t.dir] && l.to === t.from && l.state !== 'conflict',
    );
    if (backAt >= 0) {
      link = { ...link, state: 'confirmed', confidence: CONFIRMED_CONFIDENCE, reverse: true };
      out[out.findIndex((l) => l.id === link.id)] = link;
      out[backAt] = { ...out[backAt], state: 'confirmed', confidence: CONFIRMED_CONFIDENCE, reverse: true };
    }
  }
  return { links: out, link };
}

// ---------------------------------------------------------------------------------------------------------------------
// Map-level operations (they keep a room's exit slots and the link list in step)
// ---------------------------------------------------------------------------------------------------------------------

function mapRooms(map: MapFile, fn: (room: Room) => Room): MapFile {
  return {
    ...map,
    continents: map.continents.map((c) => ({
      ...c,
      areas: c.areas.map((a) => ({ ...a, subzones: a.subzones.map((s) => ({ ...s, rooms: s.rooms.map(fn) })) })),
    })),
  };
}

function withOffPage(links: Link[], index: MapIndex): Link[] {
  return links.map((l) => {
    if (l.to === null) return l;
    const a = index.rooms.get(l.from)?.areaId;
    const b = index.rooms.get(l.to)?.areaId;
    const offPage = a !== undefined && b !== undefined && a !== b;
    return offPage === l.offPage ? l : { ...l, offPage };
  });
}

/** Records that an exit exists, in the room's slot and in the link list. `null` when the room is not in the map. */
export function recordExit(
  map: MapFile,
  roomId: string,
  dir: Direction,
  newId: () => string,
): { map: MapFile; link: Link } | null {
  const index = buildIndex(map);
  if (!index.rooms.has(roomId)) return null;
  const result = declareExit(map.links, roomId, dir, newId);
  const next = mapRooms({ ...map, links: result.links }, (r) =>
    r.id === roomId && r.exits[dir] !== result.link.id ? { ...r, exits: { ...r.exits, [dir]: result.link.id } } : r,
  );
  return { map: next, link: result.link };
}

/** Records one walk through an exit. `null` when either end is not in the map. */
export function recordTraversal(map: MapFile, t: Traversal, newId: () => string): { map: MapFile; link: Link } | null {
  const index = buildIndex(map);
  if (!index.rooms.has(t.from) || !index.rooms.has(t.to)) return null;
  const result = applyTraversal(map.links, t, newId);
  const withSlot = mapRooms({ ...map, links: result.links }, (r) =>
    r.id === t.from && r.exits[t.dir] !== result.link.id ? { ...r, exits: { ...r.exits, [t.dir]: result.link.id } } : r,
  );
  const links = withOffPage(withSlot.links, buildIndex(withSlot));
  return { map: { ...withSlot, links }, link: links.find((l) => l.id === result.link.id) as Link };
}

// ---------------------------------------------------------------------------------------------------------------------
// Merge and split (with history)
// ---------------------------------------------------------------------------------------------------------------------

function pushHistory(room: Room, event: HistoryEvent): HistoryEvent[] {
  const all = [...(room.history ?? []), event];
  return all.length > LIMITS.maxHistory ? all.slice(all.length - LIMITS.maxHistory) : all;
}

function unionSources(a: readonly MapSource[], b: readonly MapSource[]): MapSource[] {
  const seen = new Set<string>();
  const out: MapSource[] = [];
  for (const s of [...a, ...b]) {
    const key = JSON.stringify(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, LIMITS.maxSources);
}

/**
 * The owner decided two rooms are one. `dropId` becomes a tombstone (`aliasOf` the kept room, no exits, its own
 * baseline and history still on it) and the kept room takes its exits where the slot is free. Where both had an exit in
 * the same direction the kept room's link wins; if they led to different rooms the kept link becomes a conflict, and if
 * the kept one led nowhere known it learns the other's target. Links that pointed at the dropped room point at the kept
 * one. Everything needed to undo it is on the kept room's history (`undoMerge`). `null` when either room is missing,
 * they are the same room, or the dropped room is already merged away.
 */
export function mergeRooms(map: MapFile, keepId: string, dropId: string, at: string, note?: string): MapFile | null {
  const index = buildIndex(map);
  const keep = index.rooms.get(keepId)?.room;
  const drop = index.rooms.get(dropId)?.room;
  if (!keep || !drop || keepId === dropId || keep.aliasOf !== undefined || drop.aliasOf !== undefined) return null;

  const undo: MergeUndo = {
    absorbed: dropId,
    moved: [],
    dropped: [],
    changed: [],
    absorbedExits: { ...drop.exits },
    keptBaseline: keep.baseline ? cloneJson(keep.baseline) : null,
    keptExits: { ...keep.exits },
  };
  const byId = new Map(map.links.map((l) => [l.id, l] as const));
  const gone = new Set<string>();
  const edits = new Map<string, Link>();
  const keptExits = { ...keep.exits };

  for (const dir of DIRECTIONS) {
    const linkId = drop.exits[dir];
    const link = linkId === undefined ? undefined : byId.get(linkId);
    if (linkId === undefined || !link) continue;
    const target = link.to === dropId ? keepId : link.to;
    const keptLink = keep.exits[dir] === undefined ? undefined : byId.get(keep.exits[dir] as string);
    if (!keptLink) {
      undo.moved.push({ link: linkId, end: 'from' });
      edits.set(linkId, { ...link, from: keepId });
      keptExits[dir] = linkId;
      continue;
    }
    undo.dropped.push(cloneJson(link));
    gone.add(linkId);
    if (keptLink.to === null && target !== null) {
      undo.changed.push(cloneJson(keptLink));
      edits.set(keptLink.id, {
        ...keptLink,
        to: target,
        state: link.state,
        confidence: link.confidence,
        traversals: link.traversals,
        reverse: link.reverse,
        ...(link.lastWalked ? { lastWalked: link.lastWalked } : {}),
      });
    } else if (keptLink.to !== null && target !== null && keptLink.to !== target) {
      undo.changed.push(cloneJson(keptLink));
      const others = [...new Set([...(keptLink.conflictTo ?? []), target])].slice(0, LIMITS.maxConflictTargets);
      edits.set(keptLink.id, { ...keptLink, state: 'conflict', confidence: 0, conflictTo: others });
    }
  }

  const links: Link[] = [];
  for (const original of map.links) {
    if (gone.has(original.id)) continue;
    let link = edits.get(original.id) ?? original;
    if (link.to === dropId) {
      undo.moved.push({ link: link.id, end: 'to' });
      link = { ...link, to: keepId };
    }
    links.push(link);
  }

  const merged = mapRooms({ ...map, links }, (room) => {
    if (room.id === keepId) {
      const baseline = keep.baseline || drop.baseline ? mergeBaselines(keep.baseline, drop.baseline) : undefined;
      const next: Room = {
        ...room,
        exits: keptExits,
        sources: unionSources(keep.sources, drop.sources),
        history: pushHistory(room, { at, op: 'merge', with: [dropId], ...(note ? { note } : {}), undo }),
      };
      if (baseline) next.baseline = baseline;
      return next;
    }
    if (room.id === dropId)
      return {
        ...room,
        exits: {},
        aliasOf: keepId,
        history: pushHistory(room, { at, op: 'merge', with: [keepId], ...(note ? { note } : {}) }),
      };
    return room;
  });
  return { ...merged, links: withOffPage(merged.links, buildIndex(merged)) };
}

/**
 * Puts two merged rooms back. The absorbed room is live again with the exits and links it had; the kept room gives
 * back what it took. The kept room's baseline returns to what it was at merge time (visits recorded since are not
 * re-applied). Both rooms keep the full history, including the merge and this undo. `null` when there is no merge of
 * that room into this one to undo, or it was already undone.
 */
export function undoMerge(map: MapFile, keepId: string, absorbedId: string, at: string): MapFile | null {
  const index = buildIndex(map);
  const keep = index.rooms.get(keepId)?.room;
  const tomb = index.rooms.get(absorbedId)?.room;
  if (!keep || !tomb || tomb.aliasOf !== keepId) return null;
  // Newest first. A merge is undone only while it is the newest merge still standing: undoing an older one over a newer
  // one would put back link states the newer merge has since rewritten.
  let undo: MergeUndo | undefined;
  const undone = new Set<string>();
  const history = keep.history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i];
    if (event.op === 'undo-merge') {
      for (const id of event.with ?? []) undone.add(id);
    } else if (event.op === 'merge' && event.undo) {
      const id = event.undo.absorbed;
      if (undone.has(id))
        undone.delete(id); // an older merge of a room that was since undone
      else if (id === absorbedId) undo = event.undo;
      else return null; // a newer merge is still standing: undo that one first
      if (undo) break;
    }
  }
  if (!undo) return null;
  const done = undo;

  const links = map.links.map((l) => {
    const before = done.changed.find((c) => c.id === l.id);
    let link = before ? cloneJson(before) : l;
    for (const m of done.moved)
      if (m.link === link.id && link[m.end] === keepId) link = { ...link, [m.end]: absorbedId };
    return link;
  });
  const present = new Set(links.map((l) => l.id));
  for (const dropped of done.dropped) if (!present.has(dropped.id)) links.push(cloneJson(dropped));

  const restored = mapRooms({ ...map, links }, (room) => {
    if (room.id === keepId) {
      const exits = { ...room.exits };
      for (const dir of DIRECTIONS) {
        const gave = done.absorbedExits[dir];
        if (gave !== undefined && exits[dir] === gave) delete exits[dir];
      }
      const next: Room = { ...room, exits, history: pushHistory(room, { at, op: 'undo-merge', with: [absorbedId] }) };
      if (done.keptBaseline) next.baseline = cloneJson(done.keptBaseline);
      else delete next.baseline;
      return next;
    }
    if (room.id === absorbedId) {
      const exits: Room['exits'] = {};
      const linkIds = new Set(links.map((l) => l.id));
      for (const dir of DIRECTIONS) {
        const id = done.absorbedExits[dir];
        if (id !== undefined && linkIds.has(id)) exits[dir] = id;
      }
      const next: Room = { ...room, exits, history: pushHistory(room, { at, op: 'undo-merge', with: [keepId] }) };
      delete next.aliasOf;
      return next;
    }
    return room;
  });
  return { ...restored, links: withOffPage(restored.links, buildIndex(restored)) };
}

export interface SplitOptions {
  /** The new room's id, minted by the caller (`mintId('r', ...)`). */
  newId: string;
  /** Links that belong to the new room: ones that start at the room move with their exit slot, ones that end at it now end at the new room. */
  takeLinks: readonly string[];
  at: string;
  note?: string;
}

/**
 * The owner decided one room is really two. The new room is a live copy of the original's title, sector, description
 * and sources with an empty baseline; the chosen links move to it. The original keeps its baseline (what belongs to
 * which room cannot be told) and both rooms record the split. `null` when the room is missing or merged away, the new
 * id is malformed or taken, or a chosen link does not touch the room.
 */
export function splitRoom(map: MapFile, roomId: string, options: SplitOptions): { map: MapFile; newId: string } | null {
  const index = buildIndex(map);
  const found = index.rooms.get(roomId);
  if (!found || found.room.aliasOf !== undefined || !ID_PATTERN.test(options.newId) || index.rooms.has(options.newId))
    return null;
  const take = new Set(options.takeLinks);
  const byId = new Map(map.links.map((l) => [l.id, l] as const));
  for (const id of take) {
    const link = byId.get(id);
    if (!link || (link.from !== roomId && link.to !== roomId)) return null;
  }
  const original = found.room;
  const copy: Room = {
    id: options.newId,
    title: original.title,
    exits: {},
    sources: cloneJson(original.sources),
    history: [{ at: options.at, op: 'split', with: [roomId], ...(options.note ? { note: options.note } : {}) }],
  };
  if (original.sector !== undefined) copy.sector = original.sector;
  if (original.description !== undefined) copy.description = original.description;

  const links = map.links.map((l) => {
    if (!take.has(l.id)) return l;
    let link = l;
    if (link.from === roomId) {
      link = { ...link, from: options.newId };
      const dir = link.dir;
      copy.exits[dir] = link.id;
    }
    if (link.to === roomId) link = { ...link, to: options.newId };
    return link;
  });
  const moved = new Set(DIRECTIONS.filter((d) => copy.exits[d] !== undefined));
  const rebuilt = mapRooms({ ...map, links }, (room) => {
    if (room.id !== roomId) return room;
    const exits = { ...room.exits };
    for (const d of moved) delete exits[d];
    return {
      ...room,
      exits,
      history: pushHistory(room, {
        at: options.at,
        op: 'split',
        with: [options.newId],
        ...(options.note ? { note: options.note } : {}),
      }),
    };
  });
  const placed: MapFile = {
    ...rebuilt,
    continents: rebuilt.continents.map((c) => ({
      ...c,
      areas: c.areas.map((a) => ({
        ...a,
        subzones: a.subzones.map((s) =>
          s.id === found.subzoneId && a.id === found.areaId ? { ...s, rooms: [...s.rooms, copy] } : s,
        ),
      })),
    })),
  };
  return { map: { ...placed, links: withOffPage(placed.links, buildIndex(placed)) }, newId: options.newId };
}
