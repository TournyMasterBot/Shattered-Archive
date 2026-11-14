/**
 * The Shattered-Maps neutral map file, version 1.
 *
 * One JSON document: continents > areas > subzones > rooms, plus a flat list of links between rooms. It is the
 * single shape that the walked-evidence layer (Copilot world memory), the community import, the Builder export and
 * the viewer all read and write. No field is derived from another one in the file itself:
 *  - an area's placement on its continent is written down (`placement`), never computed from its room count;
 *  - a room's identity is its `id`, minted at random, never its title or its vnum (titles repeat across the world and
 *    a vnum is the game's number, which may be absent or reused);
 *  - a link says where an exit goes, how sure we are (`state`, `confidence`) and why (`traversals`, `reverse`).
 *
 * Pure types and constants. Rules live beside it: `identity.ts` (ids, links, merge and split), `baseline.ts` (what a
 * room usually holds), `validate.ts` (the strict reader).
 */

export const MAP_SCHEMA_VERSION = 1 as const;

/** The ten exit slots a room can have. */
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'U', 'D'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  N: 'S',
  NE: 'SW',
  E: 'W',
  SE: 'NW',
  S: 'N',
  SW: 'NE',
  W: 'E',
  NW: 'SE',
  U: 'D',
  D: 'U',
};

/** `consistent`: rooms keep their places. `maze`: exits shuffle. `teleport`: exits land elsewhere. `loop`: exits circle back. */
export const SUBZONE_KINDS = ['consistent', 'maze', 'teleport', 'loop'] as const;
export type SubzoneKind = (typeof SUBZONE_KINDS)[number];

/**
 * `confirmed`: walked both ways. `candidate`: walked one way, or imported. `unknown-target`: the exit is known, where it
 * goes is not. `conflict`: two views disagree about where it goes.
 */
export const LINK_STATES = ['confirmed', 'candidate', 'unknown-target', 'conflict'] as const;
export type LinkState = (typeof LINK_STATES)[number];

/** `player` entries are people, never part of a room's baseline; they exist so a producer can say so explicitly. */
export const CONTENT_KINDS = ['mob', 'item', 'unknown', 'player'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const SOURCE_KINDS = ['walked', 'azah', 'builder', 'archive', 'manual'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Ids are lower-case, start with a letter or digit, and are safe in a path, a URL and an HTML attribute. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
/** `2026-11-07` or a full UTC timestamp `2026-11-07T20:07:26Z` (optionally with milliseconds). */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;

/** Size caps the strict reader enforces and the producers keep to. */
export const LIMITS = {
  maxContinents: 16,
  maxAreas: 4_000,
  maxSubzones: 20_000,
  maxRooms: 60_000,
  maxLinks: 240_000,
  shortText: 200,
  description: 8_000,
  maxSources: 16,
  maxContents: 64,
  maxWas: 32,
  maxDays: 32,
  maxHistory: 64,
  maxConflictTargets: 8,
  maxCoord: 100_000,
  maxVnum: 2_147_483_647,
  maxTraversals: 1_000_000_000,
} as const;

export interface MapSource {
  kind: SourceKind;
  /** The source's own number for the thing (the community database's RefNum, a Builder room number). */
  ref?: string;
  /** Who made the record, when it is someone's work (the community map's author). */
  credit?: string;
  /** The date of the record in the source (`YYYY-MM-DD` or a UTC timestamp). Undated records lose to dated ones. */
  date?: string;
}

/** One thing a room usually holds, with the evidence for it. See `baseline.ts` for the rule. */
export interface ContentRecord {
  /** What the game prints for it, trimmed. */
  label: string;
  kind: ContentKind;
  /** `fixture` once it passes the rule; `transient` before. */
  status: 'transient' | 'fixture';
  /** Visits at which it was present. */
  seen: number;
  /** Visits to the room since it was first seen (including the first). `seen / observed` is the presence ratio. */
  observed: number;
  /** How many of it the latest sighting showed. */
  count: number;
  /** Distinct play days it was seen on, ascending, oldest dropped past the cap. */
  days: string[];
  firstSeen: string;
  lastSeen: string;
  /** Consecutive visits without it. */
  missed: number;
  /** How many times it was a fixture, was demoted, and came back. */
  returns: number;
}

/** A fixture that stopped being seen. Kept so a wrong demotion is reversible and the history is not lost. */
export interface WasRecord {
  label: string;
  kind: ContentKind;
  seen: number;
  observed: number;
  count: number;
  firstSeen: string;
  lastSeen: string;
  demotedOn: string;
  returns: number;
}

export interface RoomBaseline {
  /** Visits to the room, over every session. */
  visits: number;
  /** Distinct play days with a visit, ascending, oldest dropped past the cap. */
  days: string[];
  contents: ContentRecord[];
  was: WasRecord[];
}

/** Before-images that let `undoMerge` put two merged rooms back. */
export interface MergeUndo {
  absorbed: string;
  /** Links whose `from` or `to` was moved from the absorbed room to the kept room. */
  moved: { link: string; end: 'from' | 'to' }[];
  /** Links removed because the kept room already had that exit slot; full copies. */
  dropped: Link[];
  /** Kept-room links the merge changed (a slot that disagreed became a conflict); full copies from before. */
  changed: Link[];
  /** The exit slots the absorbed room had, so they can be handed back. */
  absorbedExits: Partial<Record<Direction, string>>;
  /** The kept room's baseline and exits before the merge. */
  keptBaseline: RoomBaseline | null;
  keptExits: Partial<Record<Direction, string>>;
}

export interface HistoryEvent {
  at: string;
  op: 'create' | 'merge' | 'undo-merge' | 'split';
  /** The other room (or rooms) in the operation. */
  with?: string[];
  note?: string;
  undo?: MergeUndo;
}

export interface Coords {
  x: number;
  y: number;
  z?: number;
}

export interface Room {
  id: string;
  title: string;
  sector?: string;
  /** The game's room number when known. Never used as identity; unique among live rooms of a file. */
  vnum?: number;
  description?: string;
  /** Slot -> link id. A slot with no link is an exit nobody has described. */
  exits: Partial<Record<Direction, string>>;
  /** Position inside its subzone, on that subzone's own grid. Absent until a layout places the room. */
  coords?: Coords;
  baseline?: RoomBaseline;
  sources: MapSource[];
  /** Set on a merged-away room: the id of the room that absorbed it. Such a room has no exits; it keeps its own data so a merge can be undone. */
  aliasOf?: string;
  history?: HistoryEvent[];
}

export interface Subzone {
  id: string;
  name: string;
  kind: SubzoneKind;
  rooms: Room[];
}

/** An area's box on its continent's own grid. Written by whoever lays the continent out; never derived. */
export interface AreaPlacement {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface Area {
  id: string;
  name: string;
  /** `null`: nobody has placed this area on the continent yet. */
  placement: AreaPlacement | null;
  subzones: Subzone[];
  sources?: MapSource[];
}

export interface Continent {
  id: string;
  name: string;
  areas: Area[];
}

export interface Link {
  id: string;
  from: string;
  dir: Direction;
  /** The room the exit leads to; `null` exactly when the state is `unknown-target`. */
  to: string | null;
  state: LinkState;
  /** 0 to 1. See `identity.ts` for the numbers. */
  confidence: number;
  /** The target lies outside the area the exit starts in (or outside the slice, in a slice). */
  offPage: boolean;
  /** Times the exit was walked in this direction. */
  traversals: number;
  /** The reverse exit was walked and came back. */
  reverse: boolean;
  /** Other places the same exit has been seen to lead (set while the state is `conflict`). */
  conflictTo?: string[];
  lastWalked?: string;
  sources?: MapSource[];
}

export interface MapFile {
  version: typeof MAP_SCHEMA_VERSION;
  /** When the file was written (`YYYY-MM-DD` or a UTC timestamp). */
  generatedAt?: string;
  continents: Continent[];
  links: Link[];
}

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);
}

export function emptyMap(generatedAt?: string): MapFile {
  const map: MapFile = { version: MAP_SCHEMA_VERSION, continents: [], links: [] };
  if (generatedAt !== undefined) map.generatedAt = generatedAt;
  return map;
}

export function emptyBaseline(): RoomBaseline {
  return { visits: 0, days: [], contents: [], was: [] };
}

/** A deep copy through JSON; every value in the schema is JSON, and this package has no DOM or Node `structuredClone`. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
