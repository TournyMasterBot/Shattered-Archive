import React from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useMap } from '@state/mapStore'
import OctRenderer from '../render/OctRenderer'

const LVL_KEY = 'dslmapper:viewLevel'

function useQuery() {
  return new URLSearchParams(useLocation().search)
}

export default function RendererPage() {
  const { state } = useMap()
  const { worldId = 'all', continentId = 'all', areaId = 'all' } = useParams()
  const query = useQuery()

  const initialLevel = React.useMemo(() => {
    const fromUrl = query.get('level')
    if (fromUrl != null && fromUrl !== '' && !Number.isNaN(Number(fromUrl))) return Number(fromUrl)
    const raw = localStorage.getItem(LVL_KEY)
    if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) return Number(raw)
    return 0
  }, [query])

  const [level, setLevel] = React.useState<number>(initialLevel)

  React.useEffect(() => {
    const url = new URL(window.location.href)
    const cur = url.searchParams.get('level')
    if (cur !== String(level)) {
      url.searchParams.set('level', String(level))
      window.history.replaceState(null, '', url.toString())
    }
    try { localStorage.setItem(LVL_KEY, String(level)) } catch { /* storage can be unavailable (private mode): the level is then simply not remembered */ }
  }, [level])

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LVL_KEY && e.newValue != null) {
        const n = Number(e.newValue)
        if (!Number.isNaN(n)) setLevel(n)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const rooms = React.useMemo(() => {
    const all = Object.values(state.doc.rooms)
    if (worldId === 'all') return all
    if (continentId === 'all') return all.filter(r => r.category?.worldId === worldId)
    if (areaId === 'all') {
      return all.filter(r => r.category?.worldId === worldId && r.category?.continentId === continentId)
    }
    return all.filter(r =>
      r.category?.worldId === worldId &&
      r.category?.continentId === continentId &&
      r.category?.areaId === areaId
    )
  }, [state.doc.rooms, worldId, continentId, areaId])

  const primaryVnum = React.useMemo(() => {
    if (areaId !== 'all') {
      const area = state.doc.meta.catalog?.areas?.[areaId]
      if (area?.primaryVnum) return area.primaryVnum
    }
    return null
  }, [state.doc.meta.catalog, areaId])

  const cx = query.get('cx'), cy = query.get('cy'), vnum = query.get('vnum') || undefined
  const centerCx = cx != null ? Number(cx) : undefined
  const centerCy = cy != null ? Number(cy) : undefined
  const roomsAtLevel = rooms.filter(r => (r.coords?.vz ?? 0) === level)

  // IMPORTANT: fixed, inset container -> viewport-anchored; overflow gives scrollbars
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0f0f10',
        overflow: 'auto'
      }}
    >
      <OctRenderer
        rooms={roomsAtLevel}
        level={level}
        primaryVnum={primaryVnum ?? undefined}
        centerCx={centerCx}
        centerCy={centerCy}
        focusVnum={vnum}
        fit="content"
      />
    </div>
  )
}
