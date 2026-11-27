import {
  LIMITS,
  buildIndex,
  cloneJson,
  type Area,
  type Continent,
  type Direction,
  type Link,
  type MapFile,
  type MapIndex,
  type MapSource,
  type Room,
  type Subzone,
} from '@shatteredarchive/shattered-maps-core';

/**
 * Candidate review: a curator moves rooms and links from a candidates file (walked evidence, a community import) into the audited
 * layer file, one decision at a time. Pure functions: the clock (`at`) and the curator's note come in as arguments, nothing is stored
 * here, and the inputs are never modified.
 *
 *   candidate --accept--> accepted          candidate --accept with changes--> edited
 *   candidate --reject--> rejected --reopen--> candidate        (accepted and edited items are changed with `editRoom`/`editLink`)
 *
 * Every record that enters the audited file keeps the candidate's own sources and gains one of its own (`manual`, ref `review`, the
 * date), and a room gets a history line with the curator's note, so the file says who vouched for what and when. The decisions (with
 * the notes) are a second file, the review log, because the audited file is a plain map file that other tools read.
 */

export type ItemKind = 'room' | 'link';
export type ReviewStatus = 'accepted' | 'rejected' | 'edited';
export type ItemStatus = 'candidate' | ReviewStatus;

export interface Decision {
  kind: ItemKind;
  id: string;
  status: ReviewStatus;
  /** When (`YYYY-MM-DD` or a UTC timestamp). */
  at: string;
  note: string;
  /** For `edited`: the names of the fields that were changed. */
  edits?: string[];
}

export interface ReviewLog {
  version: 1;
  decisions: Decision[];
}

export const emptyLog = (): ReviewLog => ({ version: 1, decisions: [] });

export interface RoomEdits {
  title?: string;
  description?: string;
  sector?: string;
}

export interface LinkEdits {
  /** A room id (live in the audited file or the candidates), or `null` for "the exit is known, where it goes is not". */
  to?: string | null;
  /** `candidate` or `confirmed`: what the curator vouches for. Setting a target on an unknown exit makes it a candidate unless this says more. */
  state?: 'candidate' | 'confirmed';
}

export interface Meta {
  at: string;
  note?: string;
}

export type Outcome =
  | { ok: true; audited: MapFile; log: ReviewLog; added: string[] }
  | { ok: false; reason: string };

/** The latest decision about an item, or `candidate` when there is none. */
export function statusOf(log: ReviewLog, kind: ItemKind, id: string): ItemStatus {
  for (let i = log.decisions.length - 1; i >= 0; i -= 1) {
    const d = log.decisions[i];
    if (d.kind === kind && d.id === id) return d.status;
  }
  return 'candidate';
}

export interface PendingItem {
  kind: ItemKind;
  id: string;
  /** A room's title, or a link's "from-title direction". */
  label: string;
}

/**
 * The items of `candidates` that nobody has decided on yet, rooms first. A merged-away room is not an item (its survivor is); a link
 * is an item once its starting room is live. `within`, when given, restricts the list to those room ids and their links.
 */
export function pendingItems(candidates: MapFile, log: ReviewLog, within?: ReadonlySet<string>): PendingItem[] {
  const latest = new Map<string, ReviewStatus>();
  for (const d of log.decisions) latest.set(`${d.kind}:${d.id}`, d.status);
  const index = buildIndex(candidates);
  const out: PendingItem[] = [];
  const links: PendingItem[] = [];
  for (const [id, found] of index.rooms) {
    if (found.room.aliasOf !== undefined || (within && !within.has(id))) continue;
    if (!latest.has(`room:${id}`)) out.push({ kind: 'room', id, label: found.room.title });
    for (const link of index.linksFrom.get(id) ?? [])
      if (!latest.has(`link:${link.id}`)) links.push({ kind: 'link', id: link.id, label: `${found.room.title} ${link.dir}` });
  }
  return [...out, ...links];
}

const trimmed = (text: string | undefined, max: number): string => (text ?? '').trim().slice(0, max);

function checkRoomEdits(edits: RoomEdits): string | null {
  if (edits.title !== undefined && (edits.title.trim() === '' || edits.title.length > LIMITS.shortText))
    return `the title must be 1 to ${LIMITS.shortText} characters`;
  if (edits.description !== undefined && edits.description.length > LIMITS.description)
    return `the description must be at most ${LIMITS.description} characters`;
  if (edits.sector !== undefined && edits.sector.length > LIMITS.shortText)
    return `the sector must be at most ${LIMITS.shortText} characters`;
  return null;
}

/** The working copy of one operation (or one bulk operation): the audited file and the log, mutated in place, then handed back. */
class Work {
  readonly audited: MapFile;
  readonly log: ReviewLog;
  readonly added: string[] = [];
  private rooms = new Map<string, Room>();
  private links = new Map<string, Link>();
  private vnums = new Map<number, string>();

  constructor(audited: MapFile, log: ReviewLog, readonly candidates: MapFile, readonly cand: MapIndex) {
    this.audited = cloneJson(audited);
    this.log = { version: 1, decisions: [...log.decisions] };
    for (const c of this.audited.continents)
      for (const a of c.areas)
        for (const s of a.subzones)
          for (const r of s.rooms) {
            this.rooms.set(r.id, r);
            if (r.vnum !== undefined && r.aliasOf === undefined) this.vnums.set(r.vnum, r.id);
          }
    for (const l of this.audited.links) this.links.set(l.id, l);
  }

  private stamp(sources: MapSource[] | undefined, meta: Meta): MapSource[] {
    const out = [...(sources ?? [])];
    if (!out.some((s) => s.kind === 'manual' && s.ref === 'review' && s.date === meta.at)) out.push({ kind: 'manual', ref: 'review', date: meta.at });
    return out.slice(-LIMITS.maxSources);
  }

  private ensureSubzone(roomId: string): Subzone {
    const where = this.cand.rooms.get(roomId)!;
    const candContinent = this.candidates.continents.find((c) => c.id === where.continentId)!;
    const candArea = this.cand.areas.get(where.areaId)!.area;
    const candSubzone = candArea.subzones.find((s) => s.id === where.subzoneId)!;
    let continent = this.audited.continents.find((c) => c.id === candContinent.id);
    if (!continent) {
      continent = { id: candContinent.id, name: candContinent.name, areas: [] } satisfies Continent;
      this.audited.continents.push(continent);
    }
    let area = continent.areas.find((a) => a.id === candArea.id);
    if (!area) {
      area = { id: candArea.id, name: candArea.name, placement: candArea.placement, subzones: [] } satisfies Area;
      if (candArea.sources) area.sources = cloneJson(candArea.sources);
      continent.areas.push(area);
    }
    let subzone = area.subzones.find((s) => s.id === candSubzone.id);
    if (!subzone) {
      subzone = { id: candSubzone.id, name: candSubzone.name, kind: candSubzone.kind, rooms: [] };
      area.subzones.push(subzone);
    }
    return subzone;
  }

  private note(kind: ItemKind, id: string, status: ReviewStatus, meta: Meta, edits?: string[]): void {
    const d: Decision = { kind, id, status, at: meta.at, note: trimmed(meta.note, LIMITS.shortText) };
    if (edits && edits.length > 0) d.edits = edits;
    this.log.decisions.push(d);
  }

  private history(room: Room, meta: Meta, text: string): void {
    const note = trimmed(meta.note, LIMITS.shortText - text.length - 2);
    room.history = [...(room.history ?? []), { at: meta.at, op: 'create' as const, note: note ? `${text}: ${note}` : text }].slice(-LIMITS.maxHistory);
  }

  applyRoomEdits(room: Room, edits: RoomEdits): string[] {
    const changed: string[] = [];
    if (edits.title !== undefined && edits.title.trim() !== room.title) {
      room.title = edits.title.trim();
      changed.push('title');
    }
    if (edits.description !== undefined && edits.description !== (room.description ?? '')) {
      if (edits.description === '') delete room.description;
      else room.description = edits.description;
      changed.push('description');
    }
    if (edits.sector !== undefined && edits.sector.trim() !== (room.sector ?? '')) {
      if (edits.sector.trim() === '') delete room.sector;
      else room.sector = edits.sector.trim();
      changed.push('sector');
    }
    return changed;
  }

  /** Accept a candidate room (with changes when `edits` changes something). Fails with the reason. */
  acceptRoom(roomId: string, meta: Meta, edits?: RoomEdits): string | null {
    const found = this.cand.rooms.get(roomId);
    if (!found || found.room.aliasOf !== undefined) return 'the room is not a live room of the candidates file';
    if (this.rooms.has(roomId)) return 'the room is already in the audited file';
    if (found.room.vnum !== undefined && this.vnums.has(found.room.vnum))
      return `room number ${found.room.vnum} is already used by another room of the audited file`;
    if (edits) {
      const bad = checkRoomEdits(edits);
      if (bad) return bad;
    }
    const room: Room = cloneJson(found.room);
    // only the exits whose links are already accepted come along; acceptLink fills the others in
    room.exits = {};
    for (const dir of Object.keys(found.room.exits) as Direction[]) {
      const id = found.room.exits[dir];
      const link = id === undefined ? undefined : this.links.get(id);
      if (link && link.from === roomId && link.dir === dir) room.exits[dir] = link.id;
    }
    room.sources = this.stamp(room.sources, meta);
    const changed = edits ? this.applyRoomEdits(room, edits) : [];
    this.history(room, meta, changed.length > 0 ? `review: accepted with changes (${changed.join(', ')})` : 'review: accepted');
    this.ensureSubzone(roomId).rooms.push(room);
    this.rooms.set(roomId, room);
    if (room.vnum !== undefined) this.vnums.set(room.vnum, roomId);
    this.added.push(roomId);
    this.note('room', roomId, changed.length > 0 ? 'edited' : 'accepted', meta, changed);
    return null;
  }

  private applyLinkEdits(link: Link, edits: LinkEdits): { changed: string[]; error: string | null } {
    const changed: string[] = [];
    if (edits.to !== undefined && edits.to !== link.to) {
      if (edits.to !== null) {
        const known = this.rooms.has(edits.to) || (this.cand.rooms.has(edits.to) && this.cand.rooms.get(edits.to)!.room.aliasOf === undefined);
        if (!known) return { changed, error: 'the new target is not a live room of the audited file or the candidates' };
        link.to = edits.to;
        if (link.state === 'unknown-target' || link.state === 'conflict') {
          link.state = 'candidate';
          link.confidence = 0.6;
        }
        delete link.conflictTo;
        link.offPage = link.offPage || !this.rooms.has(edits.to);
      } else {
        link.to = null;
        link.state = 'unknown-target';
        link.confidence = 0;
        link.reverse = false;
        delete link.conflictTo;
      }
      changed.push('target');
    }
    if (edits.state !== undefined) {
      if (link.to === null) return { changed, error: 'an exit with no target cannot be made a candidate or confirmed' };
      const confidence = edits.state === 'confirmed' ? 0.95 : 0.6;
      if (link.state !== edits.state || link.confidence !== confidence) {
        link.state = edits.state;
        link.confidence = confidence;
        delete link.conflictTo;
        changed.push('state');
      }
    }
    return { changed, error: null };
  }

  /** Accept a candidate link; its starting room is accepted first when it is not in the audited file yet. */
  acceptLink(linkId: string, meta: Meta, edits?: LinkEdits): string | null {
    const source = this.cand.links.get(linkId);
    if (!source) return 'the link is not in the candidates file';
    if (this.links.has(linkId)) return 'the link is already in the audited file';
    let room = this.rooms.get(source.from);
    if (!room) {
      const failed = this.acceptRoom(source.from, meta);
      if (failed) return `its starting room cannot be accepted: ${failed}`;
      room = this.rooms.get(source.from)!;
    }
    if (room.exits[source.dir] !== undefined) return `the audited room already has an exit ${source.dir}`;
    const link: Link = cloneJson(source);
    // a link may point at a room the curator has not accepted (or a room of another file): then it leaves the page
    if (link.to !== null && !this.rooms.has(link.to)) link.offPage = true;
    const { changed, error } = edits ? this.applyLinkEdits(link, edits) : { changed: [] as string[], error: null };
    if (error) return error;
    link.sources = this.stamp(link.sources, meta);
    this.audited.links.push(link);
    this.links.set(link.id, link);
    room.exits[link.dir] = link.id;
    this.added.push(link.id);
    this.note('link', linkId, changed.length > 0 ? 'edited' : 'accepted', meta, changed);
    return null;
  }

  editRoom(roomId: string, edits: RoomEdits, meta: Meta): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'the room is not in the audited file';
    const bad = checkRoomEdits(edits);
    if (bad) return bad;
    const changed = this.applyRoomEdits(room, edits);
    if (changed.length === 0) return 'nothing changed';
    room.sources = this.stamp(room.sources, meta);
    this.history(room, meta, `review: edited (${changed.join(', ')})`);
    this.note('room', roomId, 'edited', meta, changed);
    return null;
  }

  editLink(linkId: string, edits: LinkEdits, meta: Meta): string | null {
    const link = this.links.get(linkId);
    if (!link) return 'the link is not in the audited file';
    const { changed, error } = this.applyLinkEdits(link, edits);
    if (error) return error;
    if (changed.length === 0) return 'nothing changed';
    link.sources = this.stamp(link.sources, meta);
    this.note('link', linkId, 'edited', meta, changed);
    return null;
  }

  done(): Outcome {
    return { ok: true, audited: this.audited, log: this.log, added: this.added };
  }
}

const open = (candidates: MapFile, audited: MapFile, log: ReviewLog): Work => new Work(audited, log, candidates, buildIndex(candidates));

export function acceptRoom(candidates: MapFile, audited: MapFile, log: ReviewLog, roomId: string, meta: Meta, edits?: RoomEdits): Outcome {
  const work = open(candidates, audited, log);
  const failed = work.acceptRoom(roomId, meta, edits);
  return failed ? { ok: false, reason: failed } : work.done();
}

export function acceptLink(candidates: MapFile, audited: MapFile, log: ReviewLog, linkId: string, meta: Meta, edits?: LinkEdits): Outcome {
  const work = open(candidates, audited, log);
  const failed = work.acceptLink(linkId, meta, edits);
  return failed ? { ok: false, reason: failed } : work.done();
}

/**
 * Accept many items in one pass (every pending room and link of a view). Each item that cannot be accepted is skipped with its reason
 * and the others still go through; the same working copy is used throughout, so a thousand rooms cost one copy, not a thousand.
 */
export function acceptMany(
  candidates: MapFile,
  audited: MapFile,
  log: ReviewLog,
  items: readonly { kind: ItemKind; id: string }[],
  meta: Meta,
): { audited: MapFile; log: ReviewLog; accepted: number; skipped: { kind: ItemKind; id: string; reason: string }[] } {
  const work = open(candidates, audited, log);
  const skipped: { kind: ItemKind; id: string; reason: string }[] = [];
  let accepted = 0;
  for (const item of items) {
    const failed = item.kind === 'room' ? work.acceptRoom(item.id, meta) : work.acceptLink(item.id, meta);
    if (failed) skipped.push({ ...item, reason: failed });
    else accepted += 1;
  }
  return { audited: work.audited, log: work.log, accepted, skipped };
}

/** Reject a candidate that nobody has decided on. Nothing enters the audited file; the item leaves the queue and the note is kept. */
export function rejectItem(log: ReviewLog, kind: ItemKind, id: string, meta: Meta): { ok: true; log: ReviewLog } | { ok: false; reason: string } {
  const status = statusOf(log, kind, id);
  if (status !== 'candidate') return { ok: false, reason: `the ${kind} is already ${status}` };
  return {
    ok: true,
    log: { version: 1, decisions: [...log.decisions, { kind, id, status: 'rejected', at: meta.at, note: trimmed(meta.note, LIMITS.shortText) }] },
  };
}

/** Put a rejected item back in the queue: its rejection is struck from the log (an accepted item cannot be reopened). */
export function reopenItem(log: ReviewLog, kind: ItemKind, id: string): { ok: true; log: ReviewLog } | { ok: false; reason: string } {
  if (statusOf(log, kind, id) !== 'rejected') return { ok: false, reason: `the ${kind} is not rejected` };
  const at = log.decisions.map((d) => d.kind === kind && d.id === id).lastIndexOf(true);
  return { ok: true, log: { version: 1, decisions: log.decisions.filter((_, i) => i !== at) } };
}

export function editRoom(audited: MapFile, log: ReviewLog, roomId: string, edits: RoomEdits, meta: Meta): Outcome {
  const work = new Work(audited, log, { version: 1, continents: [], links: [] }, buildIndex({ version: 1, continents: [], links: [] }));
  const failed = work.editRoom(roomId, edits, meta);
  return failed ? { ok: false, reason: failed } : work.done();
}

export function editLink(audited: MapFile, candidates: MapFile, log: ReviewLog, linkId: string, edits: LinkEdits, meta: Meta): Outcome {
  const work = open(candidates, audited, log);
  const failed = work.editLink(linkId, edits, meta);
  return failed ? { ok: false, reason: failed } : work.done();
}

/** Counts for the review panel: decisions by status, and what is left. */
export function tally(candidates: MapFile, log: ReviewLog): { pending: number; accepted: number; edited: number; rejected: number } {
  const latest = new Map<string, ReviewStatus>();
  for (const d of log.decisions) latest.set(`${d.kind}:${d.id}`, d.status);
  const counts = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
  for (const status of latest.values()) counts[status] += 1;
  counts.pending = pendingItems(candidates, log).length;
  return counts;
}
