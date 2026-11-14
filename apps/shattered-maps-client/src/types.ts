// src/types.ts

/** Directions supported by the mapper. */
export type Direction =
  | 'N' | 'NE' | 'E' | 'SE'
  | 'S' | 'SW' | 'W' | 'NW'
  | 'U' | 'D'

export const DIRECTIONS: Direction[] = [
  'N', 'NE', 'E', 'SE',
  'S', 'SW', 'W', 'NW',
  'U', 'D'
]

/** Door / lock types. */
export type Door =
  | null
  | { type: 'simple' }
  | { type: 'locked'; keyId: string }

/** Exit mapping status. */
export type ExitStatus = 'unknown' | 'created' | 'confirmed' | 'anomalous'

/** Scope kinds used by renderer/editor routing. */
export type ScopeKind = 'world' | 'continent' | 'area' | 'room'

/** Catalog entities. */
export interface CatalogWorld   { id: string; name: string }
/** `worldId` is absent while the continent is unassigned (the editor deletes it to unassign). */
export interface CatalogCont    { id: string; name: string; worldId?: string }

/** In catalog areas, allow tracking the area’s primary room vnum. */
export interface CatalogArea {
  id: string
  name: string
  /** Absent while the area is unassigned (the editor deletes both ids to unassign it). */
  worldId?: string
  continentId?: string
  primaryVnum?: string
}

/** Catalog root. */
export interface Catalog {
  worlds:     Record<string, CatalogWorld>
  continents: Record<string, CatalogCont>
  areas:      Record<string, CatalogArea>
}

/** Room classification within the catalog hierarchy. */
export interface Category {
  worldId?: string
  continentId?: string
  areaId?: string
}

export type CatalogUpsertPayload =
  | { kind: 'world';     node: CatalogWorld }
  | { kind: 'continent'; node: CatalogCont }
  | { kind: 'area';      node: CatalogArea }

export type CatalogDeletePayload = {
  kind: 'world' | 'continent' | 'area'
  id: string
  mode: 'unassign'
}

/** Alternative name kept for legacy references (same shape). */
export interface CategoryIds {
  worldId?: string
  continentId?: string
  areaId?: string
}

/** Octagon-grid coordinates (+ vertical). */
export interface Coords {
  /** Grid X */
  cx: number
  /** Grid Y */
  cy: number
  /** Vertical level */
  vz: number
  /** Legacy fields some saved documents carry (cube z, axial q and r, older z or level): read by render/coords.ts, never written. */
  cz?: number
  q?: number
  r?: number
  z?: number
  level?: number
}

/** Exit definition for a room. */
export interface ExitDef {
  /** Target vnum or null if unknown. */
  to: string | null
  /** One-way exit (no implicit back-link). */
  oneWay: boolean
  /** Door definition if present. */
  door: Door
  /** Mapping status. */
  status: ExitStatus
}

/** Arbitrary flags on rooms or objects. */
export interface RoomFlags { [key: string]: boolean | number | string }

/** Objects that can live in rooms. */
export interface RoomObject {
  id: string
  name: string
  flags?: RoomFlags
}

/** Interactive effects used by verbs (future-ready). */
export type Effect =
  | { Message: { text: string } }
  | { CreateExit: { dir: Direction, to: string | null, status: ExitStatus, oneWay?: boolean, door?: Door } }
  | { RevealExit: { dir: Direction } }
  | { UnlockDoor: { dir: Direction, keyId?: string } }
  | { ToggleDoor: { dir: Direction, state: 'open'|'closed'|'locked' } }
  | { Warp: { to: string } }
  | { SetFlag: { scope: 'room'|'object', id?: string, key: string, value: boolean | number | string } }

/** Conditions for interactions. */
export interface InteractionWhen {
  dir?: Direction | null
  roomFlags?: { key: string, equals: boolean | number | string }[]
  objectFlags?: { id: string, key: string, equals: boolean | number | string }[]
  requirements?: {
    skills?: { name: string, dc: number }[]
    tools?: { name: string, optional?: boolean }[]
    movement?: string[]
  }
}

/** Interaction/verb definition. */
export interface Interaction {
  verb: 'dig' | 'push' | 'pull' | 'shove' | string
  target?: string | null
  when?: InteractionWhen
  effects: Effect[]
}

/** Room shape. */
export interface Room {
  vnum: string
  label?: string
  sector?: TerrainKind   // strict type now
  coords: Coords
  movement?: { requires?: string[]; bans?: string[] }
  flags?: RoomFlags
  objects?: RoomObject[]
  interactions?: Interaction[]
  exits: Partial<Record<Direction, ExitDef>>
  category?: Category
}

/** Document metadata. */
export interface MapDocMeta {
  directions: Direction[]
  /** Grid configuration; now supports 'octagon'. */
  grid?: { type: 'hex' | 'octagon', orientation?: 'pointy' | 'flat', coords?: 'axial' | 'cube' }
  catalog?: Catalog
  /** For cross-tab sync/versioning. */
  revision?: number
}

/** Versioned document. */
export interface MapDocV1 {
  meta: MapDocMeta
  rooms: Record<string, Room>
}

/** Alias for convenience where code expects MapDoc. */
export type MapDoc = MapDocV1

/** Patch shape for updating a room. */
export type RoomPatch = Partial<Omit<Room, 'vnum'>>

export const enum TerrainKind {
  Unknown     = "unknown",
  Inside      = "inside",
  City        = "city",
  Desert      = "desert",
  VeryIcy     = "very_icy",
  Hills       = "hills",
  Forest      = "forest",
  Fields      = "fields",
  Tundra      = "tundra",
  Ocean       = "ocean",
  Swim        = "swim",
  Underwater  = "underwater",
  Underground = "underground"
}
export const TERRAIN_OPTIONS: TerrainKind[] = [
  TerrainKind.Unknown,
  TerrainKind.Inside,
  TerrainKind.City,
  TerrainKind.Desert,
  TerrainKind.VeryIcy,
  TerrainKind.Hills,
  TerrainKind.Forest,
  TerrainKind.Fields,
  TerrainKind.Tundra,
  TerrainKind.Ocean,
  TerrainKind.Swim,
  TerrainKind.Underwater,
  TerrainKind.Underground
];
