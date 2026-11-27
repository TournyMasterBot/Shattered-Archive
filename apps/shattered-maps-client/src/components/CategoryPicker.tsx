/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
import { useMap } from '@state/mapStore'
import React from 'react'

export default function CategoryPicker({ vnum }: { vnum: string }) {
  const { state, dispatch } = useMap()
  const room = state.doc.rooms[vnum]
  if (!room) return null
  const catalog = state.doc.meta.catalog ?? { worlds:{}, continents:{}, areas:{} }
  const cat = room.category ?? {}

  const set = (key: 'worldId'|'continentId'|'areaId', value: string) => {
    dispatch({ type: 'PATCH_ROOM', vnum, patch: { category: { ...cat, [key]: value || undefined } } as any })
  }

  return (
    <fieldset style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:8 }}>
      <legend>Classification</legend>

      <label>World</label>
      <select value={cat.worldId ?? ''} onChange={e => set('worldId', e.target.value)}>
        <option value="">(none)</option>
        {Object.values(catalog.worlds).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <label>Continent</label>
      <select value={cat.continentId ?? ''} onChange={e => set('continentId', e.target.value)}>
        <option value="">(none)</option>
        {Object.values(catalog.continents).map(c => <option key={c.id} value={c.id}>{c.worldId} / {c.name}</option>)}
      </select>

      <label>Area</label>
      <select value={cat.areaId ?? ''} onChange={e => set('areaId', e.target.value)}>
        <option value="">(none)</option>
        {Object.values(catalog.areas).map(a => <option key={a.id} value={a.id}>{a.worldId}/{a.continentId} / {a.name}</option>)}
      </select>
    </fieldset>
  )
}
