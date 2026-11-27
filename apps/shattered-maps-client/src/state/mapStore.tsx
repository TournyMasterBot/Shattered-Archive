/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useEffect,
  useRef,
} from 'react'
import {
  MapDocV1,
  Room,
  RoomPatch,
  Direction,
  ExitDef,
  Category,
  DIRECTIONS,
} from '../types'
import { saveToLocal, loadFromLocal, STORAGE_KEY } from './persist'

// ----------------- State + Action types -----------------

export interface State {
  doc: MapDocV1
  selected: string | null
  level: number
  // history stacks
  _past: Array<{ doc: MapDocV1; selected: string | null; level: number }>
  _future: Array<{ doc: MapDocV1; selected: string | null; level: number }>
}

export type Action =
  | { type: 'HYDRATE'; doc: MapDocV1 }
  | { type: 'SELECT_ROOM'; vnum: string | null }
  | { type: 'ADD_ROOM'; vnum: string }
  | { type: 'DELETE_ROOM'; vnum: string }
  | { type: 'PATCH_ROOM'; vnum: string; patch: RoomPatch }
  | { type: 'UPSERT_EXIT'; vnum: string; dir: Direction; exit: ExitDef }
  | { type: 'DELETE_EXIT'; vnum: string; dir: Direction }
  | { type: 'SET_LEVEL'; level: number }
  | {
      type: 'CATALOG_UPSERT'
      payload: { kind: 'world' | 'continent' | 'area'; node: any }
    }
  | {
      type: 'CATALOG_DELETE'
      payload: { kind: 'world' | 'continent' | 'area'; id: string; mode: 'unassign' }
    }
  // history
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ----------------- Helpers -----------------

function bumpRevision(doc: MapDocV1) {
  doc.meta.revision = (doc.meta.revision ?? 0) + 1
}

function isRec(v: any): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Minimal normalizer (exported for callers like PersistenceBar):
 * - Keep revision as-is if present
 * - If directions missing/empty, use full DIRECTIONS
 * - Validate exits by known Direction keys and default missing fields
 * - Do not coerce/rename arbitrary fields
 */
export function normalizeDoc(raw: any): MapDocV1 {
  const metaIn = isRec(raw?.meta) ? raw.meta : {}

  // directions: if present, keep only valid ones; if none, use full set
  let directions: Direction[] = []
  if (Array.isArray(metaIn.directions)) {
    const set = new Set<string>(metaIn.directions)
    directions = (DIRECTIONS as Direction[]).filter((d) => set.has(d))
  }
  if (directions.length === 0) directions = [...DIRECTIONS]

  const catalogIn = isRec(metaIn.catalog) ? metaIn.catalog : {}
  const catalog = {
    worlds: isRec(catalogIn.worlds) ? (catalogIn.worlds as Record<string, any>) : {},
    continents: isRec(catalogIn.continents) ? (catalogIn.continents as Record<string, any>) : {},
    areas: isRec(catalogIn.areas) ? (catalogIn.areas as Record<string, any>) : {},
  }

  const outRooms: Record<string, Room> = {}
  const roomsIn = isRec(raw?.rooms) ? (raw.rooms as Record<string, any>) : {}

  for (const [vnum, rAny] of Object.entries(roomsIn)) {
    if (!isRec(rAny)) continue

    // coords (relaxed)
    const cIn: any = (rAny as any).coords ?? {}
    const coords = {
      cx: Number(cIn.cx ?? 0) || 0,
      cy: Number(cIn.cy ?? 0) || 0,
      vz: Number(cIn.vz ?? 0) || 0,
    }

    // exits: only valid Direction keys; safe defaults
    const exits: Partial<Record<Direction, ExitDef>> = {}
    if (isRec(rAny.exits)) {
      for (const [k, exAny] of Object.entries(rAny.exits as Record<string, any>)) {
        if (!(DIRECTIONS as readonly string[]).includes(k)) continue
        const dir = k as Direction
        const to = typeof exAny?.to === 'string' && exAny.to.trim() ? exAny.to : null
        const oneWay = !!(exAny as any)?.oneWay
        let door: ExitDef['door'] = null
        const dAny: any = (exAny as any)?.door
        if (isRec(dAny)) {
          if (dAny.type === 'simple') door = { type: 'simple' }
          else if (dAny.type === 'locked') door = { type: 'locked', keyId: String(dAny.keyId ?? '') }
        }
        const status: ExitDef['status'] =
          (exAny as any)?.status === 'created' ||
          (exAny as any)?.status === 'confirmed' ||
          (exAny as any)?.status === 'anomalous'
            ? (exAny as any).status
            : 'unknown'
        exits[dir] = { to, oneWay, door, status }
      }
    }

    const category: Category | undefined = isRec(rAny.category)
      ? {
          worldId: typeof (rAny.category as any).worldId === 'string' ? (rAny.category as any).worldId : undefined,
          continentId:
            typeof (rAny.category as any).continentId === 'string' ? (rAny.category as any).continentId : undefined,
          areaId: typeof (rAny.category as any).areaId === 'string' ? (rAny.category as any).areaId : undefined,
        }
      : undefined

    const room: Room = {
      vnum,
      label: typeof (rAny as any).label === 'string' ? (rAny as any).label : undefined,
      sector: typeof (rAny as any).sector === 'string' ? ((rAny as any).sector as any) : undefined,
      coords,
      exits,
      movement: isRec((rAny as any).movement) ? ((rAny as any).movement as any) : undefined,
      flags: isRec((rAny as any).flags) ? ((rAny as any).flags as any) : undefined,
      objects: Array.isArray((rAny as any).objects) ? ((rAny as any).objects as any) : undefined,
      interactions: Array.isArray((rAny as any).interactions) ? ((rAny as any).interactions as any) : undefined,
      category,
    }

    outRooms[vnum] = room
  }

  const normalized: MapDocV1 = {
    meta: {
      directions,
      catalog,
      grid: (metaIn as any).grid,
      revision: typeof (metaIn as any).revision === 'number' ? (metaIn as any).revision : 0,
    },
    rooms: outRooms,
  }

  return normalized
}

// ----------------- History helpers -----------------

const HISTORY_LIMIT = 50

function cloneDoc(doc: MapDocV1): MapDocV1 {
  return JSON.parse(JSON.stringify(doc))
}

function pushPast(state: State): State {
  const snap = { doc: cloneDoc(state.doc), selected: state.selected, level: state.level }
  const trimmed =
    state._past.length >= HISTORY_LIMIT ? [...state._past.slice(1), snap] : [...state._past, snap]
  return { ...state, _past: trimmed, _future: [] }
}

// ----------------- Reducer -----------------

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE': {
      const incoming = normalizeDoc(action.doc)
      const curRev = state.doc.meta?.revision ?? 0
      const incRev = incoming.meta?.revision ?? 0
      if (incRev <= curRev) return state
      return { ...state, doc: incoming, _past: [], _future: [] }
    }

    case 'SELECT_ROOM':
      return { ...state, selected: action.vnum }

    case 'ADD_ROOM': {
      if (state.doc.rooms[action.vnum]) {
        return { ...state, selected: action.vnum }
      }
      state = pushPast(state)
      const newRoom: Room = {
        vnum: action.vnum,
        coords: { cx: 0, cy: 0, vz: 0 },
        exits: {},
      }
      const doc = {
        ...state.doc,
        rooms: { ...state.doc.rooms, [action.vnum]: newRoom },
      }
      bumpRevision(doc)
      return { ...state, doc, selected: action.vnum }
    }

    case 'DELETE_ROOM': {
      state = pushPast(state)
      const { [action.vnum]: _drop, ...rest } = state.doc.rooms
      const doc = { ...state.doc, rooms: rest }
      bumpRevision(doc)
      return { ...state, doc, selected: state.selected === action.vnum ? null : state.selected }
    }

    case 'PATCH_ROOM': {
      const room = state.doc.rooms[action.vnum]
      if (!room) return state
      state = pushPast(state)
      const merged: Room = {
        ...room,
        ...action.patch,
        coords: { ...room.coords, ...(action.patch as any).coords },
      }
      const doc = { ...state.doc, rooms: { ...state.doc.rooms, [action.vnum]: merged } }
      bumpRevision(doc)
      return { ...state, doc }
    }

    case 'UPSERT_EXIT': {
      const r = state.doc.rooms[action.vnum]
      if (!r) return state
      state = pushPast(state)
      const exits: Partial<Record<Direction, ExitDef>> = { ...r.exits, [action.dir]: action.exit }
      const doc = { ...state.doc, rooms: { ...state.doc.rooms, [action.vnum]: { ...r, exits } } }
      bumpRevision(doc)
      return { ...state, doc }
    }

    case 'DELETE_EXIT': {
      const r = state.doc.rooms[action.vnum]
      if (!r) return state
      state = pushPast(state)
      const exits: Partial<Record<Direction, ExitDef>> = { ...r.exits }
      delete exits[action.dir]
      const doc = { ...state.doc, rooms: { ...state.doc.rooms, [action.vnum]: { ...r, exits } } }
      bumpRevision(doc)
      return { ...state, doc }
    }

    case 'SET_LEVEL':
      // not recorded in history (by design); change if you want it undoable
      return { ...state, level: action.level }

    case 'CATALOG_UPSERT': {
      state = pushPast(state)
      const { kind, node } = action.payload
      const doc = { ...state.doc, meta: { ...state.doc.meta } }
      const cat = doc.meta.catalog ?? { worlds: {}, continents: {}, areas: {} }
      if (kind === 'world') cat.worlds = { ...cat.worlds, [node.id]: node }
      if (kind === 'continent') cat.continents = { ...cat.continents, [node.id]: node }
      if (kind === 'area') cat.areas = { ...cat.areas, [node.id]: node }
      doc.meta.catalog = cat
      bumpRevision(doc)
      return { ...state, doc }
    }

    case 'CATALOG_DELETE': {
      state = pushPast(state)
      const { kind, id } = action.payload
      const doc = { ...state.doc, meta: { ...state.doc.meta } }
      const cat = doc.meta.catalog ?? { worlds: {}, continents: {}, areas: {} }
      if (kind === 'world') {
        const { [id]: _drop, ...rest } = cat.worlds
        cat.worlds = rest
      }
      if (kind === 'continent') {
        const { [id]: _drop, ...rest } = cat.continents
        cat.continents = rest
      }
      if (kind === 'area') {
        const { [id]: _drop, ...rest } = cat.areas
        cat.areas = rest
      }
      doc.meta.catalog = cat
      bumpRevision(doc)
      return { ...state, doc }
    }

    // -------- UNDO / REDO --------
    case 'UNDO': {
      if (state._past.length === 0) return state
      const prev = state._past[state._past.length - 1]
      const curSnap = { doc: cloneDoc(state.doc), selected: state.selected, level: state.level }
      return {
        ...state,
        doc: prev.doc,
        selected: prev.selected,
        level: prev.level,
        _past: state._past.slice(0, -1),
        _future: [curSnap, ...state._future].slice(0, HISTORY_LIMIT),
      }
    }

    case 'REDO': {
      if (state._future.length === 0) return state
      const next = state._future[0]
      const curSnap = { doc: cloneDoc(state.doc), selected: state.selected, level: state.level }
      return {
        ...state,
        doc: next.doc,
        selected: next.selected,
        level: next.level,
        _past: [...state._past, curSnap].slice(-HISTORY_LIMIT),
        _future: state._future.slice(1),
      }
    }

    default:
      return state
  }
}

// ----------------- Context -----------------

const MapCtx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null)

export function useMap() {
  const ctx = useContext(MapCtx)
  if (!ctx) throw new Error('useMap must be used within MapProvider')
  return ctx
}

// ----------------- Provider (autosave + cross-tab sync) -----------------

export function MapProvider({ children }: { children: React.ReactNode }) {
  const initial: State = {
    doc: {
      meta: {
        directions: [...DIRECTIONS],
        catalog: { worlds: {}, continents: {}, areas: {} },
        revision: 0,
      },
      rooms: {},
    },
    selected: null,
    level: 0,
    _past: [],
    _future: [],
  }

  const hydrated = React.useMemo(() => {
    const loaded = loadFromLocal()
    if (loaded) {
      const safe = normalizeDoc(loaded)
      return { doc: safe, selected: null, level: 0, _past: [], _future: [] } as State
    }
    return initial
  }, [])

  const [state, dispatch] = useReducer(reducer, hydrated)

  // BroadcastChannel + storage listener for live cross-tab sync
  const bcRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    const bc = new BroadcastChannel('dslmapper')
    bcRef.current = bc

    bc.onmessage = (ev) => {
      const incoming = normalizeDoc(ev?.data as MapDocV1)
      const cur = state.doc.meta?.revision ?? 0
      const inc = incoming.meta?.revision ?? 0
      if (inc > cur) dispatch({ type: 'HYDRATE', doc: incoming })
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const incoming = normalizeDoc(JSON.parse(e.newValue) as MapDocV1)
        const cur = state.doc.meta?.revision ?? 0
        const inc = incoming.meta?.revision ?? 0
        if (inc > cur) dispatch({ type: 'HYDRATE', doc: incoming })
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('storage', onStorage)
      bc.close()
      bcRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave (debounced) + broadcast after save
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        saveToLocal(state.doc)
        bcRef.current?.postMessage(state.doc)
      } catch { /* ignore */ }
    }, 250)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [state.doc])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <MapCtx.Provider value={value}>{children}</MapCtx.Provider>
}
