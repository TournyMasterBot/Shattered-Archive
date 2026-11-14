import {
  buildIndex,
  DIRECTIONS,
  emptyMap,
  LIMITS,
  matchRoom,
  mintId,
  normalizeTitle,
  OPPOSITE,
  recordExit,
  recordTraversal,
  resolveAlias,
  updateBaseline,
  updateRoom,
  validateMapFile,
  type BaselineConfig,
  type ContentKind,
  type Direction,
  type Link,
  type LinkState,
  type MapFile,
  type MapIndex,
  type Room,
  type RoomLocation,
  type WasRecord,
} from '@shatteredarchive/shattered-maps-core';
import { commandDirection } from './direction.js';
import type { ParsedRoomView } from './parseRoom.js';

/**
 * The walked-evidence layer: what the character has seen of the world, as a `MapFile` of shattered-maps-core.
 *
 * Every room view updates three things, with the rules of shattered-maps-core and nothing else: the room's identity (`matchRoom`), the
 * evidence for the exit that was just taken (`recordTraversal`, docs diagram D12) and what the room usually holds (`updateBaseline`,
 * diagram D13). All walked rooms live in one unplaced area, `walked`: the game's log does not say which area a room is in, so no room
 * is placed or grouped by a guess. The whole layer is one file in the data directory, replaced atomically after each visit; a visit
 * whose write fails changes nothing in memory either.
 *
 * A room's labels can include text the game printed for things standing in it. People are dropped before they get here (kind `player`),
 * but a person the heuristics take for something else would be kept as an `unknown` label until it expires: the file stays in the
 * private data directory and is never exported.
 */

export const WORLD_FILE_VERSION = 1;
export const WALKED_CONTINENT = 'walked';
export const WALKED_AREA = 'walked';
export const WALKED_SUBZONE = 'walked-main';
/** The largest file that is written (characters). A layer that would be bigger is refused, not truncated. */
export const MAX_WORLD_CHARS = 60_000_000;

export interface WorldIo {
  readText(file: string): Promise<string | undefined>;
  /** Replaces the file whole (a temporary file, then a rename). */
  writeText(file: string, text: string): Promise<void>;
}

export interface WorldMemoryDeps {
  io: WorldIo;
  /** The layer's file. */
  file: string;
  baseline: BaselineConfig;
  /** A source of numbers in [0, 1) for ids. */
  random: () => number;
  now?: () => number;
  /** Most rooms the layer holds (default: the schema's cap). Tests lower it. */
  maxRooms?: number;
  /** Largest file written, in characters (default MAX_WORLD_CHARS). Tests lower it. */
  maxChars?: number;
  /** Do not write after each view; the caller writes with `flush()`. For replaying logs only: live play keeps the default (write every view). */
  deferWrites?: boolean;
}

export interface WorldStats {
  /** Room views received. */
  views: number;
  /** By what the text could be tied to. */
  textOk: number;
  textAbsent: number;
  textDark: number;
  textDisagrees: number;
  newRooms: number;
  matched: number;
  /** Views that fit more than one known room and were kept apart as a new one. */
  ambiguous: number;
  traversals: number;
  /** Views not stored: no character, the layer is full or too big, or a bad day. */
  refused: number;
  writeFailures: number;
}

export interface ApplyContext {
  /** The play day, `YYYY-MM-DD`. */
  day: string;
  /** The play day plus the registered codename: arrival is only followed inside one session. */
  session: string;
  /** The exit the character took to get here, when exactly one movement command led to this view. */
  arrivalDir?: Direction;
}

export type ApplyResult =
  | { ok: true; roomId: string; created: boolean }
  | { ok: false; reason: 'bad-day' | 'full' | 'too-big' | 'write-failed' };

export interface ContentReport {
  label: string;
  kind: ContentKind;
  seen: number;
  observed: number;
  count: number;
  days: number;
  firstSeen: string;
  lastSeen: string;
  returns: number;
}

/** A walked room as the map window's "add this room" flow reads it: the report, and whether its exits are exactly the ones asked about. */
export interface NearRoom extends RoomReport {
  sameExits: boolean;
}

export interface RoomReport {
  id: string;
  title: string;
  sector?: string;
  vnum?: number;
  description?: string;
  visits: number;
  days: number;
  exits: {
    dir: Direction;
    state: LinkState;
    confidence: number;
    to: string | null;
    toTitle?: string;
    traversals: number;
  }[];
  /** What the room can be expected to hold. */
  fixtures: ContentReport[];
  /** Seen, but not yet often enough. */
  transient: ContentReport[];
  /** Fixtures that stopped being seen, kept so a wrong demotion can be undone. */
  was: WasRecord[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function emptyStats(): WorldStats {
  return {
    views: 0,
    textOk: 0,
    textAbsent: 0,
    textDark: 0,
    textDisagrees: 0,
    newRooms: 0,
    matched: 0,
    ambiguous: 0,
    traversals: 0,
    refused: 0,
    writeFailures: 0,
  };
}

function walkedStructure(map: MapFile): MapFile {
  if (map.continents.some((c) => c.areas.some((a) => a.subzones.some((s) => s.id === WALKED_SUBZONE)))) return map;
  return {
    ...map,
    continents: [
      ...map.continents,
      {
        id: WALKED_CONTINENT,
        name: 'Walked',
        areas: [
          {
            id: WALKED_AREA,
            name: 'Walked rooms, not placed',
            placement: null,
            subzones: [{ id: WALKED_SUBZONE, name: 'Walked', kind: 'consistent', rooms: [] }],
          },
        ],
      },
    ],
  };
}

function appendRoom(map: MapFile, room: Room): MapFile {
  const ready = walkedStructure(map);
  return {
    ...ready,
    continents: ready.continents.map((c) => ({
      ...c,
      areas: c.areas.map((a) => ({
        ...a,
        subzones: a.subzones.map((s) => (s.id === WALKED_SUBZONE ? { ...s, rooms: [...s.rooms, room] } : s)),
      })),
    })),
  };
}

function contentReport(c: {
  label: string;
  kind: ContentKind;
  seen: number;
  observed: number;
  count: number;
  days: readonly string[];
  firstSeen: string;
  lastSeen: string;
  returns: number;
}): ContentReport {
  return {
    label: c.label,
    kind: c.kind,
    seen: c.seen,
    observed: c.observed,
    count: c.count,
    days: c.days.length,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    returns: c.returns,
  };
}

export class WorldMemory {
  private map: MapFile;
  private index: MapIndex;
  private readonly stats_ = emptyStats();
  private last: { roomId: string; session: string } | undefined;
  private currentId: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly deps: WorldMemoryDeps,
    map: MapFile,
  ) {
    this.map = map;
    this.index = buildIndex(map);
  }

  /**
   * Loads the layer from its file. A missing file is a new, empty layer. A file that cannot be read as a valid map is kept beside the
   * original as `<file>.unreadable` (best effort) and the layer starts empty: nothing unreadable is ever half-used.
   */
  static async open(deps: WorldMemoryDeps): Promise<{ memory: WorldMemory; loaded: 'new' | 'ok' | 'unreadable' }> {
    const text = await deps.io.readText(deps.file);
    if (text === undefined) return { memory: new WorldMemory(deps, emptyMap()), loaded: 'new' };
    let map: MapFile | undefined;
    try {
      const parsed = JSON.parse(text) as { v?: unknown; map?: unknown };
      if (parsed.v === WORLD_FILE_VERSION) {
        const checked = validateMapFile(parsed.map);
        if (checked.ok) map = checked.map;
      }
    } catch {
      map = undefined;
    }
    if (map !== undefined) return { memory: new WorldMemory(deps, map), loaded: 'ok' };
    await deps.io.writeText(`${deps.file}.unreadable`, text).catch(() => undefined);
    return { memory: new WorldMemory(deps, emptyMap()), loaded: 'unreadable' };
  }

  get stats(): WorldStats {
    return { ...this.stats_ };
  }

  get counts(): { rooms: number; links: number } {
    return { rooms: this.index.rooms.size, links: this.map.links.length };
  }

  /** The room the character is in, as far as the memory knows. */
  get current(): { id: string; title: string } | undefined {
    const room = this.currentId === undefined ? undefined : this.index.rooms.get(this.currentId)?.room;
    return room === undefined ? undefined : { id: room.id, title: room.title };
  }

  /** The candidate layer. Treat it as read-only. */
  candidates(): MapFile {
    return this.map;
  }

  /** The login changed or the connection closed: the next view starts a new session, and where the character is is unknown. */
  endSession(): void {
    this.last = undefined;
    this.currentId = undefined;
  }

  /** The count of a view that could not be tied to a character (reported with the other refusals). */
  noteRefused(): void {
    this.stats_.refused += 1;
  }

  room(id: string): RoomReport | undefined {
    const found = this.index.rooms.get(id);
    if (!found || found.room.aliasOf !== undefined) return undefined;
    return this.reportOf(found.room);
  }

  /**
   * The walked rooms called `title` (case and spacing ignored), best first: those whose exits are also exactly `exits`, then the most
   * visited. Each comes with the titles of the rooms its walked exits lead to, which is what the map window offers as "adjacent rooms" when a
   * player files a room from their own history. At most `limit`.
   */
  near(title: string, exits: readonly string[], limit = 5): NearRoom[] {
    const key = normalizeTitle(title);
    if (key === '') return [];
    const want = new Set(exits.map((e) => e.toUpperCase()));
    const found: NearRoom[] = [];
    for (const { room } of this.index.rooms.values()) {
      if (room.aliasOf !== undefined || normalizeTitle(room.title) !== key) continue;
      const have = Object.keys(room.exits);
      const same = have.length === want.size && have.every((d) => want.has(d));
      found.push({ ...this.reportOf(room), sameExits: same });
    }
    found.sort((a, b) => Number(b.sameExits) - Number(a.sameExits) || b.visits - a.visits);
    return found.slice(0, limit);
  }

  private reportOf(room: Room): RoomReport {
    const exits: RoomReport['exits'] = [];
    for (const dir of DIRECTIONS) {
      const link = this.index.links.get(room.exits[dir] ?? '');
      if (!link) continue;
      const target = link.to === null ? undefined : this.index.rooms.get(link.to)?.room.title;
      exits.push({
        dir,
        state: link.state,
        confidence: link.confidence,
        to: link.to,
        ...(target === undefined ? {} : { toTitle: target }),
        traversals: link.traversals,
      });
    }
    const contents = room.baseline?.contents ?? [];
    const report: RoomReport = {
      id: room.id,
      title: room.title,
      visits: room.baseline?.visits ?? 0,
      days: room.baseline?.days.length ?? 0,
      exits,
      fixtures: contents.filter((c) => c.status === 'fixture').map(contentReport),
      transient: contents.filter((c) => c.status === 'transient').map(contentReport),
      was: room.baseline?.was ?? [],
    };
    if (room.sector !== undefined) report.sector = room.sector;
    if (room.vnum !== undefined) report.vnum = room.vnum;
    if (room.description !== undefined) report.description = room.description;
    return report;
  }

  /**
   * The evidence for taking `command` out of the room called `roomTitle`: the confidence of the link the walks have left on that exit
   * (0.95 walked there and back, 0.6 walked once, 0 contradicted), or null when there is none: the command is not a plain
   * movement, the memory is not in that room, or the exit has not been walked.
   */
  edgeEvidence(roomTitle: string | undefined, command: string): number | null {
    const dir = commandDirection(command);
    const here = this.current;
    if (
      dir === undefined ||
      roomTitle === undefined ||
      here === undefined ||
      normalizeTitle(here.title) !== normalizeTitle(roomTitle)
    )
      return null;
    const link = this.exitLink(this.roomOf(here.id), dir);
    if (!link || link.state === 'unknown-target') return null;
    return link.confidence;
  }

  /** A room the index holds (callers only ask for ids that came from the index). */
  private roomOf(id: string): Room {
    return (this.index.rooms.get(id) as RoomLocation).room;
  }

  private exitLink(room: Room, dir: Direction): Link | undefined {
    const slot = room.exits[dir];
    return slot === undefined ? undefined : this.index.links.get(slot);
  }

  /** Writes `map` as the layer's file: `too-big` (counted as refused) and `write-failed` (counted as a write failure) change nothing. */
  private async persist(map: MapFile): Promise<'ok' | 'too-big' | 'write-failed'> {
    const text = JSON.stringify({ v: WORLD_FILE_VERSION, map });
    if (text.length > (this.deps.maxChars ?? MAX_WORLD_CHARS)) {
      this.stats_.refused += 1;
      return 'too-big';
    }
    try {
      await this.deps.io.writeText(this.deps.file, text);
    } catch {
      this.stats_.writeFailures += 1;
      return 'write-failed';
    }
    return 'ok';
  }

  /**
   * Writes the layer now. Only needed with `deferWrites` (every `apply` writes otherwise): a replay calls it after each day so an
   * interrupted run keeps its work. Served in order with the views, so it never writes half of a view.
   */
  flush(): Promise<{ ok: true } | { ok: false; reason: 'too-big' | 'write-failed' }> {
    const run = this.queue.then(async () => {
      const written = await this.persist(this.map);
      return written === 'ok' ? ({ ok: true } as const) : ({ ok: false, reason: written } as const);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Stores one room view. Calls are served one at a time, in order. */
  apply(view: ParsedRoomView, context: ApplyContext): Promise<ApplyResult> {
    const run = this.queue.then(() => this.applyNow(view, context));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * A title match is only trusted when the way back agrees: the room it is matched to is not the room the character just left (a
   * move that ends in the same room would not have produced a new view), and its exit back must not already lead somewhere else.
   */
  private reverseAgrees(candidateId: string, arrival: { from: string; dir: Direction }): boolean {
    if (candidateId === arrival.from) return false;
    const link = this.exitLink(this.roomOf(candidateId), OPPOSITE[arrival.dir]);
    if (!link || link.to === null) return true;
    return resolveAlias(this.index, link.to) === arrival.from;
  }

  /** True when the room's exit back along the arrival already leads to the room the character came from (walked evidence). */
  private reverseLeadsBack(candidateId: string, arrival: { from: string; dir: Direction }): boolean {
    const link = this.exitLink(this.roomOf(candidateId), OPPOSITE[arrival.dir]);
    return link !== undefined && link.to !== null && resolveAlias(this.index, link.to) === arrival.from;
  }

  private async applyNow(view: ParsedRoomView, context: ApplyContext): Promise<ApplyResult> {
    const stats = this.stats_;
    stats.views += 1;
    if (!DAY.test(context.day)) {
      stats.refused += 1;
      return { ok: false, reason: 'bad-day' };
    }
    const { random } = this.deps;
    const index = this.index;

    const from = this.last !== undefined && this.last.session === context.session ? this.last.roomId : undefined;
    const arrival =
      context.arrivalDir !== undefined && from !== undefined ? { from, dir: context.arrivalDir } : undefined;
    const title = view.title.slice(0, LIMITS.shortText);
    let match = matchRoom(index, {
      title,
      areaId: index.areas.has(WALKED_AREA) ? WALKED_AREA : null,
      exits: view.exits,
      ...(arrival === undefined ? {} : { arrivedBy: arrival }),
    });
    if (arrival !== undefined) {
      if (match.kind === 'existing' && match.reason === 'title' && !this.reverseAgrees(match.id, arrival)) {
        match = { kind: 'new' };
      } else if (match.kind === 'ambiguous') {
        // several rooms fit: the one whose way back already leads to where the character came from is the room
        const agreeing = match.candidates.filter((id) => this.reverseLeadsBack(id, arrival));
        if (agreeing.length === 1) match = { kind: 'existing', id: agreeing[0], reason: 'title' };
      }
    }

    let map = this.map;
    let roomId: string;
    const created = match.kind !== 'existing';
    if (match.kind === 'existing') {
      roomId = match.id;
    } else {
      if (index.rooms.size >= (this.deps.maxRooms ?? LIMITS.maxRooms)) {
        stats.refused += 1;
        return { ok: false, reason: 'full' };
      }
      roomId = mintId('r', new Set(index.rooms.keys()), random);
      const room: Room = {
        id: roomId,
        title,
        exits: {},
        sources: [{ kind: 'walked', date: context.day }],
        history: [{ at: context.day, op: 'create' }],
      };
      if (view.sector !== '') room.sector = view.sector.slice(0, LIMITS.shortText);
      map = appendRoom(map, room);
    }

    const takenLinks = new Set(map.links.map((l) => l.id));
    const newLinkId = (): string => {
      const id = mintId('l', takenLinks, random);
      takenLinks.add(id);
      return id;
    };
    for (const dir of view.exits) {
      map = (recordExit(map, roomId, dir, newLinkId) as { map: MapFile }).map; // the room is in the map: it was just found or added
    }
    map = updateRoom(map, roomId, (room) => {
      const next: Room = { ...room };
      if (next.sector === undefined && view.sector !== '') next.sector = view.sector.slice(0, LIMITS.shortText);
      if (next.description === undefined && view.text === 'ok' && view.description !== undefined)
        next.description = view.description;
      if (view.text === 'ok')
        next.baseline = updateBaseline(room.baseline, { day: context.day, entries: view.contents }, this.deps.baseline);
      return next;
    });
    const traversed = arrival !== undefined;
    if (arrival !== undefined) {
      // both rooms are in the map: the one we came from was committed earlier, the one we are in was just found or added
      const done = recordTraversal(
        map,
        { from: arrival.from, dir: arrival.dir, to: roomId, at: context.day },
        newLinkId,
      ) as { map: MapFile };
      map = done.map;
    }
    map = { ...map, generatedAt: new Date((this.deps.now ?? Date.now)()).toISOString() };

    // a replay of years of logs defers the write to `flush()`: serializing the whole layer per view would take hours
    if (this.deps.deferWrites !== true) {
      const written = await this.persist(map);
      if (written !== 'ok') return { ok: false, reason: written };
    }

    // committed: only now does the memory change
    this.map = map;
    this.index = buildIndex(map);
    this.last = { roomId, session: context.session };
    this.currentId = roomId;
    if (created) stats.newRooms += 1;
    else stats.matched += 1;
    if (traversed) stats.traversals += 1;
    if (match.kind === 'ambiguous') stats.ambiguous += 1;
    if (view.text === 'ok') stats.textOk += 1;
    else if (view.text === 'absent') stats.textAbsent += 1;
    else if (view.text === 'dark') stats.textDark += 1;
    else stats.textDisagrees += 1;
    return { ok: true, roomId, created };
  }
}
