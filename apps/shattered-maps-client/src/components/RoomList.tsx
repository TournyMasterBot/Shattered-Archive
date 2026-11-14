/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/components/RoomList.tsx
import React from 'react'
import { useMap } from '@state/mapStore'
import CatalogManager from './CatalogManager'
import ContextMenu from './ContextMenu'

type TreeOpen = {
  worlds: Record<string, boolean>
  continents: Record<string, boolean>
  areas: Record<string, boolean>
  unassignedRooms: boolean
  unassignedCatalog: boolean
}

type TargetKind =
  | 'world'
  | 'continent'
  | 'area'
  | 'room'
  | 'unassignedRooms'
  | 'unassignedCatalog'

type CatalogKind = 'world' | 'continent' | 'area'

const sortByName = <T extends { name?: string; id: string }>(a: T, b: T) =>
  (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })

const roomLabel = (vnum: string, label?: string) => (label?.trim() || vnum)
const ID = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export default function RoomList() {
  const { state, dispatch } = useMap()
  const doc = state.doc
  const catalog = doc.meta.catalog ?? { worlds: {}, continents: {}, areas: {} }

  // -------- Build indices
  const worlds = Object.values(catalog.worlds).sort(sortByName)

  const continentsByWorld: Record<string, Array<{ id: string; name?: string; worldId?: string }>> = {}
  const unassignedContinents: Array<{ id: string; name?: string }> = []
  for (const c of Object.values(catalog.continents)) {
    if (c.worldId) (continentsByWorld[c.worldId] ||= []).push(c)
    else unassignedContinents.push({ id: c.id, name: c.name })
  }
  for (const k in continentsByWorld) continentsByWorld[k].sort(sortByName)
  unassignedContinents.sort(sortByName)

  const areasByContinent: Record<string, Array<{ id: string; name?: string; worldId?: string; continentId?: string }>> = {}
  const unassignedAreas: Array<{ id: string; name?: string }> = []
  for (const a of Object.values(catalog.areas)) {
    if (a.continentId) (areasByContinent[a.continentId] ||= []).push(a)
    else unassignedAreas.push({ id: a.id, name: a.name })
  }
  for (const k in areasByContinent) areasByContinent[k].sort(sortByName)
  unassignedAreas.sort(sortByName)

  // Rooms grouped by area (+ Unassigned)
  const UNASSIGNED_ROOMS = '_unassigned_rooms'
  const roomsByArea: Record<string, { vnum: string; label?: string }[]> = {}
  for (const r of Object.values(doc.rooms)) {
    const areaId = r.category?.areaId ?? UNASSIGNED_ROOMS
    ;(roomsByArea[areaId] ||= []).push({ vnum: r.vnum, label: r.label })
  }
  for (const k in roomsByArea) {
    roomsByArea[k].sort((a, b) =>
      roomLabel(a.vnum, a.label).localeCompare(
        roomLabel(b.vnum, b.label),
        undefined,
        { sensitivity: 'base' }
      )
    )
  }

  // -------- Expand/collapse
  const [open, setOpen] = React.useState<TreeOpen>(() => ({
    worlds: {},
    continents: {},
    areas: {},
    unassignedRooms: true,
    unassignedCatalog: true,
  }))
  const toggle = (type: keyof TreeOpen, id?: string) => {
    setOpen(prev => {
      if (type === 'unassignedRooms') return { ...prev, unassignedRooms: !prev.unassignedRooms }
      if (type === 'unassignedCatalog') return { ...prev, unassignedCatalog: !prev.unassignedCatalog }
      if (type === 'worlds' && id) return { ...prev, worlds: { ...prev.worlds, [id]: !prev.worlds[id] } }
      if (type === 'continents' && id) return { ...prev, continents: { ...prev.continents, [id]: !prev.continents[id] } }
      if (type === 'areas' && id) return { ...prev, areas: { ...prev.areas, [id]: !prev.areas[id] } }
      return prev
    })
  }
  // explicitly open (don’t toggle)
  const ensureOpen = (type: keyof TreeOpen, id?: string) => {
    setOpen(prev => {
      if (type === 'unassignedRooms') return { ...prev, unassignedRooms: true }
      if (type === 'unassignedCatalog') return { ...prev, unassignedCatalog: true }
      if (type === 'worlds' && id) return { ...prev, worlds: { ...prev.worlds, [id]: true } }
      if (type === 'continents' && id) return { ...prev, continents: { ...prev.continents, [id]: true } }
      if (type === 'areas' && id) return { ...prev, areas: { ...prev.areas, [id]: true } }
      return prev
    })
  }

  // -------- Selection
  const selectRoom = (vnum: string) => dispatch({ type: 'SELECT_ROOM', vnum })

  // -------- Context menu
  type MenuTarget =
    | { kind: 'world' | 'continent' | 'area' | 'room' | 'unassignedCatalog' | 'unassignedRooms'; id: string; label: string }

  const [menu, setMenu] = React.useState<{ open: boolean; x: number; y: number; target?: MenuTarget }>({
    open: false, x: 0, y: 0,
  })

  const openMenu = (e: React.MouseEvent, kind: MenuTarget['kind'], id: string, label: string) => {
    e.preventDefault(); e.stopPropagation()
    setMenu({ open: true, x: e.pageX, y: e.pageY, target: { kind, id, label } })
  }
  const closeMenu = () => setMenu(m => ({ ...m, open: false }))

  // ---- Helpers for catalog upsert / delete
  const upsertCatalog = (kind: CatalogKind, node: any) =>
    dispatch({ type: 'CATALOG_UPSERT', payload: { kind, node } })

  const countAffected = (kind: 'world' | 'continent' | 'area', id: string) => {
    if (kind === 'world') return Object.values(doc.rooms).filter(r => r.category?.worldId === id).length
    if (kind === 'continent') return Object.values(doc.rooms).filter(r => r.category?.continentId === id).length
    return Object.values(doc.rooms).filter(r => r.category?.areaId === id).length
  }

  // ---- Context actions (Rename/Add/Delete)
  const renameNode = (t: MenuTarget) => {
    const current = t.label
    const next = prompt(`Rename ${t.kind}`, current)?.trim()
    if (!next || next === current) return

    if (t.kind === 'world') {
      const cur = catalog.worlds[t.id]; if (!cur) return
      upsertCatalog('world', { ...cur, name: next })
    } else if (t.kind === 'continent') {
      const cur = catalog.continents[t.id]; if (!cur) return
      upsertCatalog('continent', { ...cur, name: next })
    } else if (t.kind === 'area') {
      const cur = catalog.areas[t.id]; if (!cur) return
      upsertCatalog('area', { ...cur, name: next })
    } else if (t.kind === 'room') {
      dispatch({ type: 'PATCH_ROOM', vnum: t.id, patch: { label: next } })
    }
  }

  const addUnder = (t: MenuTarget, kind: 'continent' | 'area' | 'room') => {
    if (kind === 'continent') {
      const id = ID()
      const worldId = t.kind === 'world' ? t.id : undefined
      const name = prompt('New continent name?') || 'New Continent'
      upsertCatalog('continent', { id, name, worldId })
      if (worldId) ensureOpen('worlds', worldId)
    } else if (kind === 'area') {
      const id = ID()
      const name = prompt('New area name?') || 'New Area'
      if (t.kind === 'continent') {
        const cont = catalog.continents[t.id]; if (!cont) return
        upsertCatalog('area', { id, name, worldId: cont.worldId, continentId: cont.id })
        ensureOpen('continents', cont.id)
      } else {
        upsertCatalog('area', { id, name })
        ensureOpen('unassignedCatalog')
      }
    } else if (kind === 'room') {
      const v = ID();
      // create room
      dispatch({ type: 'ADD_ROOM', vnum: v })

      if (t.kind === 'area') {
        const area = catalog.areas[t.id]
        if (area) {
          dispatch({
            type: 'PATCH_ROOM',
            vnum: v,
            patch: {
              category: {
                worldId: area.worldId,
                continentId: area.continentId,
                areaId: area.id,
              } as any,
            },
          })
        }
        ensureOpen('areas', t.id)
      } else if (t.kind === 'unassignedRooms') {
        ensureOpen('unassignedRooms')
      }

      // select & reveal
      requestAnimationFrame(() => {
        dispatch({ type: 'SELECT_ROOM', vnum: v })
        const el = document.getElementById(`room-${v}`)
        el?.scrollIntoView({ block: 'nearest' })
      })
    }
  }

  const handleDelete = () => {
    if (!menu.target) return
    const { kind, id, label } = menu.target
    if (kind === 'room') {
      const ok = confirm(`Delete room ${label}?`); if (!ok) return
      dispatch({ type: 'DELETE_ROOM', vnum: id }); return
    }
    if (kind === 'unassignedCatalog' || kind === 'unassignedRooms') return
    const n = countAffected(kind as any, id)
    const ok = confirm(
      `Delete ${kind} "${label}"?\nThis will unassign ${n} room(s) from this ${kind}${kind !== 'area' ? ' (and its descendants)' : ''}.`
    )
    if (!ok) return
    dispatch({ type: 'CATALOG_DELETE', payload: { kind: kind as any, id, mode: 'unassign' } })
  }

  // -------- Drag & drop
  const [dragOver, setDragOver] = React.useState<{ kind: TargetKind; id: string } | null>(null)

  // Rooms (existing)
  const onDragStartRoom = (e: React.DragEvent, vnum: string) => {
    e.dataTransfer.setData('text/x-room-vnum', vnum)
    e.dataTransfer.effectAllowed = 'move'
    startAutoScroll()
  }

  // Catalog sources
  const onDragStartCatalog = (e: React.DragEvent, kind: 'continent' | 'area', id: string) => {
    e.dataTransfer.setData(`text/x-${kind}-id`, id)
    e.dataTransfer.effectAllowed = 'move'
    startAutoScroll()
  }

  // ----- Auto-scroll while dragging -----
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const scrollDirRef = React.useRef<0 | 1 | -1>(0) // -1 up, 1 down
  const EDGE_PX = 48
  const SPEED_PX = 18

  const tick = () => {
    const el = scrollRef.current
    if (el && scrollDirRef.current !== 0) {
      el.scrollTop += scrollDirRef.current * SPEED_PX
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const startAutoScroll = () => {
    stopAutoScroll()
    rafRef.current = requestAnimationFrame(tick)
  }

  const stopAutoScroll = () => {
    scrollDirRef.current = 0
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const onDragOverRoot = (e: React.DragEvent) => {
    const dt = e.dataTransfer
    const hasRoom = !!dt?.types?.includes('text/x-room-vnum')
    const hasCont = !!dt?.types?.includes('text/x-continent-id')
    const hasArea = !!dt?.types?.includes('text/x-area-id')
    if (!(hasRoom || hasCont || hasArea)) return

    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const y = e.clientY

    let dir: 0 | 1 | -1 = 0
    if (y < rect.top + EDGE_PX && el.scrollTop > 0) dir = -1
    else if (y > rect.bottom - EDGE_PX && el.scrollTop < el.scrollHeight - el.clientHeight) dir = 1
    else dir = 0

    scrollDirRef.current = dir
    e.preventDefault()
  }

  React.useEffect(() => {
    const stop = () => stopAutoScroll()
    window.addEventListener('dragend', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragend', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const onDragOverTarget = (e: React.DragEvent, kind: TargetKind, id: string) => {
    onDragOverRoot(e)

    const dt = e.dataTransfer
    const hasRoom = !!dt.types?.includes('text/x-room-vnum')
    const hasCont = !!dt.types?.includes('text/x-continent-id')
    const hasArea = !!dt.types?.includes('text/x-area-id')

    const roomOK = hasRoom && (kind === 'world' || kind === 'continent' || kind === 'area' || kind === 'unassignedRooms')
    const contOK = hasCont && (kind === 'world' || kind === 'unassignedCatalog')
    const areaOK = hasArea && (kind === 'continent' || kind === 'unassignedCatalog')

    if (!(roomOK || contOK || areaOK)) return
    e.preventDefault()
    dt.dropEffect = 'move'
    setDragOver({ kind, id })
  }

  const onDragLeaveTarget = (_e: React.DragEvent, kind: TargetKind, id: string) => {
    setDragOver(prev => (prev && prev.kind === kind && prev.id === id ? null : prev))
  }

  const onDropTarget = (e: React.DragEvent, kind: TargetKind, id: string) => {
    const dt = e.dataTransfer
    setDragOver(null)
    stopAutoScroll()

    // Room move
    const vnum = dt.getData('text/x-room-vnum')
    if (vnum) {
      if (kind === 'unassignedRooms') {
        dispatch({ type: 'PATCH_ROOM', vnum, patch: { category: { worldId: undefined, continentId: undefined, areaId: undefined } as any } })
        ensureOpen('unassignedRooms')
        return
      }
      if (kind === 'world') {
        dispatch({ type: 'PATCH_ROOM', vnum, patch: { category: { worldId: id, continentId: undefined, areaId: undefined } as any } })
        ensureOpen('worlds', id)
        return
      }
      if (kind === 'continent') {
        const cont = catalog.continents[id]
        if (!cont) return
        dispatch({ type: 'PATCH_ROOM', vnum, patch: { category: { worldId: cont.worldId, continentId: id, areaId: undefined } as any } })
        ensureOpen('continents', id)
        return
      }
      if (kind === 'area') {
        const area = catalog.areas[id]
        if (!area) return
        dispatch({ type: 'PATCH_ROOM', vnum, patch: { category: { worldId: area.worldId, continentId: area.continentId, areaId: id } as any } })
        ensureOpen('areas', id)
        return
      }
      return
    }

    // Catalog move: continent
    const contId = dt.getData('text/x-continent-id')
    if (contId) {
      const cont = catalog.continents[contId]
      if (!cont) return
      if (kind === 'world') {
        upsertCatalog('continent', { ...cont, worldId: id })
        ensureOpen('worlds', id)
      } else if (kind === 'unassignedCatalog') {
        const c = { ...cont }; delete c.worldId
        upsertCatalog('continent', c)
        ensureOpen('unassignedCatalog')
      }
      return
    }

    // Catalog move: area
    const areaId = dt.getData('text/x-area-id')
    if (areaId) {
      const area = catalog.areas[areaId]
      if (!area) return
      if (kind === 'continent') {
        const cont = catalog.continents[id]; if (!cont) return
        upsertCatalog('area', { ...area, continentId: cont.id, worldId: cont.worldId })
        ensureOpen('continents', cont.id)
      } else if (kind === 'unassignedCatalog') {
        const a = { ...area }; delete a.continentId; delete a.worldId
        upsertCatalog('area', a)
        ensureOpen('unassignedCatalog')
      }
      return
    }
  }

  const dropClass = (kind: TargetKind, id: string) =>
    dragOver && dragOver.kind === kind && dragOver.id === id
      ? { background: 'rgba(255,255,255,0.06)', borderRadius: 6 }
      : undefined

  // -------- Render
  return (
    <div
      ref={scrollRef}
      onDragOver={onDragOverRoot}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflow: 'auto', height: '100%' }}
    >
      {/* Top controls */}
      <CatalogManager />

      {/* Worlds tree */}
      <div>
        {worlds.map(w => {
          const wOpen = open.worlds[w.id] ?? true
          return (
            <div key={w.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggle('worlds', w.id)}
                onContextMenu={(e) => openMenu(e, 'world', w.id, w.name || w.id)}
                onDragOver={(e) => onDragOverTarget(e, 'world', w.id)}
                onDragLeave={(e) => onDragLeaveTarget(e, 'world', w.id)}
                onDrop={(e) => onDropTarget(e, 'world', w.id)}
                style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600, padding: '2px 4px', ...dropClass('world', w.id) }}
                title={`${w.name || w.id} (${w.id})`}
              >
                {wOpen ? '▾' : '▸'} {w.name || w.id}
              </div>

              {wOpen && (
                <div style={{ marginLeft: 14 }}>
                  {(continentsByWorld[w.id] || []).map(c => {
                    const cOpen = open.continents[c.id] ?? true
                    return (
                      <div key={c.id} style={{ marginBottom: 6 }}>
                        <div
                          draggable
                          onDragStart={(e) => onDragStartCatalog(e, 'continent', c.id)}
                          onClick={() => toggle('continents', c.id)}
                          onContextMenu={(e) => openMenu(e, 'continent', c.id, c.name || c.id)}
                          onDragOver={(e) => onDragOverTarget(e, 'continent', c.id)}
                          onDragLeave={(e) => onDragLeaveTarget(e, 'continent', c.id)}
                          onDrop={(e) => onDropTarget(e, 'continent', c.id)}
                          style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 500, padding: '2px 4px', ...dropClass('continent', c.id) }}
                          title={`${c.name || c.id} (${c.id})`}
                        >
                          {cOpen ? '▾' : '▸'} {c.name || c.id}
                        </div>

                        {cOpen && (
                          <div style={{ marginLeft: 14 }}>
                            {(areasByContinent[c.id] || []).map(a => {
                              const aOpen = open.areas[a.id] ?? true
                              const areaRooms = roomsByArea[a.id] || []
                              return (
                                <div key={a.id} style={{ marginBottom: 4 }}>
                                  <div
                                    draggable
                                    onDragStart={(e) => onDragStartCatalog(e, 'area', a.id)}
                                    onClick={() => toggle('areas', a.id)}
                                    onContextMenu={(e) => openMenu(e, 'area', a.id, a.name || a.id)}
                                    onDragOver={(e) => onDragOverTarget(e, 'area', a.id)}
                                    onDragLeave={(e) => onDragLeaveTarget(e, 'area', a.id)}
                                    onDrop={(e) => onDropTarget(e, 'area', a.id)}
                                    style={{ cursor: 'pointer', userSelect: 'none', padding: '2px 4px', ...dropClass('area', a.id) }}
                                    title={`${a.name || a.id} (${a.id})`}
                                  >
                                    {aOpen ? '▾' : '▸'} {a.name || a.id}{' '}
                                    <span style={{ opacity: .7, fontSize: 12 }}>({areaRooms.length})</span>
                                  </div>

                                  {aOpen && areaRooms.length > 0 && (
                                    <ul style={{ margin: '4px 0 0 18px', padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
                                      {areaRooms.map(r => (
                                        <li key={r.vnum}>
                                          <button
                                            id={`room-${r.vnum}`}
                                            draggable
                                            onDragStart={(e) => onDragStartRoom(e, r.vnum)}
                                            onClick={() => selectRoom(r.vnum)}
                                            onContextMenu={(e) => openMenu(e, 'room', r.vnum, roomLabel(r.vnum, r.label))}
                                            style={{
                                              background: 'transparent', border: 'none', padding: '2px 0',
                                              textAlign: 'left', color: 'inherit', width: '100%', cursor: 'pointer',
                                              opacity: state.selected === r.vnum ? 1 : .9,
                                              fontWeight: state.selected === r.vnum ? 700 : 400
                                            }}
                                            title={r.vnum}
                                          >
                                            {roomLabel(r.vnum, r.label)}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Unassigned Catalog */}
        <div style={{ marginTop: 10 }}>
          <div
            onClick={() => toggle('unassignedCatalog')}
            onContextMenu={(e) => openMenu(e, 'unassignedCatalog', '_unassigned_catalog', '(Unassigned Catalog)')}
            onDragOver={(e) => onDragOverTarget(e, 'unassignedCatalog', '_unassigned_catalog')}
            onDragLeave={(e) => onDragLeaveTarget(e, 'unassignedCatalog', '_unassigned_catalog')}
            onDrop={(e) => onDropTarget(e, 'unassignedCatalog', '_unassigned_catalog')}
            style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600, padding: '2px 4px', ...dropClass('unassignedCatalog', '_unassigned_catalog') }}
            title="Continents without a world & Areas without a continent"
          >
            {open.unassignedCatalog ? '▾' : '▸'} (Unassigned Catalog){' '}
            <span style={{ opacity: .7, fontSize: 12 }}>
              ({unassignedContinents.length} continents, {unassignedAreas.length} areas)
            </span>
          </div>

          {open.unassignedCatalog && (
            <div style={{ marginLeft: 14, display: 'grid', gap: 6 }}>
              {/* continents */}
              <div>
                <div style={{ opacity: .8, fontSize: 12, marginBottom: 4 }}>Continents</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
                  {unassignedContinents.map(c => (
                    <li key={c.id}>
                      <div
                        draggable
                        onDragStart={(e) => onDragStartCatalog(e, 'continent', c.id)}
                        onContextMenu={(e) => openMenu(e, 'continent', c.id, c.name || c.id)}
                        style={{ padding: '2px 4px', cursor: 'grab' }}
                        title={`${c.name || c.id} (${c.id})`}
                      >
                        {c.name || c.id}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* areas */}
              <div>
                <div style={{ opacity: .8, fontSize: 12, marginBottom: 4 }}>Areas</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
                  {unassignedAreas.map(a => (
                    <li key={a.id}>
                      <div
                        draggable
                        onDragStart={(e) => onDragStartCatalog(e, 'area', a.id)}
                        onContextMenu={(e) => openMenu(e, 'area', a.id, a.name || a.id)}
                        style={{ padding: '2px 4px', cursor: 'grab' }}
                        title={`${a.name || a.id} (${a.id})`}
                      >
                        {a.name || a.id}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {unassignedContinents.length === 0 && unassignedAreas.length === 0 && (
                <div style={{ opacity: .7, fontSize: 12 }}>(none)</div>
              )}
            </div>
          )}
        </div>

        {/* Unassigned ROOMS drop target */}
        <div style={{ marginTop: 10 }}>
          <div
            onClick={() => toggle('unassignedRooms')}
            onContextMenu={(e) => openMenu(e, 'unassignedRooms', UNASSIGNED_ROOMS, '(Unassigned Rooms)')}
            onDragOver={(e) => onDragOverTarget(e, 'unassignedRooms', UNASSIGNED_ROOMS)}
            onDragLeave={(e) => onDragLeaveTarget(e, 'unassignedRooms', UNASSIGNED_ROOMS)}
            onDrop={(e) => onDropTarget(e, 'unassignedRooms', UNASSIGNED_ROOMS)}
            style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600, padding: '2px 4px', ...dropClass('unassignedRooms', UNASSIGNED_ROOMS) }}
          >
            {open.unassignedRooms ? '▾' : '▸'} (Unassigned Rooms){' '}
            <span style={{ opacity: .7, fontSize: 12 }}>({roomsByArea[UNASSIGNED_ROOMS]?.length ?? 0})</span>
          </div>

          {open.unassignedRooms && (roomsByArea[UNASSIGNED_ROOMS]?.length ? (
            <ul style={{ margin: '4px 0 0 18px', padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
              {roomsByArea[UNASSIGNED_ROOMS].map(r => (
                <li key={r.vnum}>
                  <button
                    id={`room-${r.vnum}`}
                    draggable
                    onDragStart={(e) => onDragStartRoom(e, r.vnum)}
                    onClick={() => selectRoom(r.vnum)}
                    onContextMenu={(e) => openMenu(e, 'room', r.vnum, roomLabel(r.vnum, r.label))}
                    style={{
                      background: 'transparent', border: 'none', padding: '2px 0',
                      textAlign: 'left', color: 'inherit', width: '100%', cursor: 'pointer',
                      opacity: state.selected === r.vnum ? 1 : .9,
                      fontWeight: state.selected === r.vnum ? 700 : 400
                    }}
                    title={r.vnum}
                  >
                    {roomLabel(r.vnum, r.label)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null)}
        </div>
      </div>

      {/* Context menu */}
      {menu.open && menu.target && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            ...(menu.target.kind === 'world'
              ? [
                  { label: 'Add Continent…', onClick: () => addUnder(menu.target!, 'continent') },
                  { label: 'Rename…', onClick: () => renameNode(menu.target!) },
                ]
              : []),
            ...(menu.target.kind === 'continent'
              ? [
                  { label: 'Add Area…', onClick: () => addUnder(menu.target!, 'area') },
                  { label: 'Rename…', onClick: () => renameNode(menu.target!) },
                ]
              : []),
            ...(menu.target.kind === 'area'
              ? [
                  { label: 'Add Room…', onClick: () => addUnder(menu.target!, 'room') },
                  { label: 'Rename…', onClick: () => renameNode(menu.target!) },
                ]
              : []),
            ...(menu.target.kind === 'room'
              ? [{ label: 'Rename…', onClick: () => renameNode(menu.target!) }]
              : []),
            ...(menu.target.kind === 'unassignedCatalog'
              ? [
                  { label: 'Add Continent…', onClick: () => addUnder(menu.target!, 'continent') },
                  { label: 'Add Area…', onClick: () => addUnder(menu.target!, 'area') },
                ]
              : []),
            ...(menu.target.kind === 'unassignedRooms'
              ? [{ label: 'Add Room…', onClick: () => addUnder(menu.target!, 'room') }]
              : []),
            ...(menu.target.kind !== 'unassignedCatalog' && menu.target.kind !== 'unassignedRooms'
              ? [{ label: 'Delete…', onClick: handleDelete, danger: true }]
              : []),
          ]}
        />
      )}
    </div>
  )
}
