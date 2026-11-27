import React from 'react'
import { useMap } from '@state/mapStore'

export default function OpenRendererButton() {
  const { state } = useMap()

  const openRenderer = () => {
    const { doc } = state
    const sel = state.selected ? doc.rooms[state.selected] : null

    let worldId: string | undefined = sel?.category?.worldId
    let continentId: string | undefined = sel?.category?.continentId
    let areaId: string | undefined = sel?.category?.areaId

    // If only areaId is present, derive from catalog
    if (areaId && (!worldId || !continentId)) {
      const areaMeta = doc?.meta?.catalog?.areas[areaId]
      if (areaMeta) {
        if (!worldId) worldId = areaMeta.worldId
        if (!continentId) continentId = areaMeta.continentId
      }
    }

    worldId ??= 'all'
    continentId ??= 'all'
    areaId ??= 'all'

    const level = sel?.coords.vz ?? state.level ?? 0

    const base = window.location.href.split('#')[0] // absolute base, no hash
    const search = new URLSearchParams({
      level: String(level),
      vnum: sel?.vnum ?? '',
      cx: sel ? String(sel.coords.cx) : '',
      cy: sel ? String(sel.coords.cy) : '',
    }).toString()

    const absolute = `${base}#/renderer/${encodeURIComponent(worldId)}/${encodeURIComponent(
      continentId,
    )}/${encodeURIComponent(areaId)}?${search}`

    window.open(absolute, '_blank', 'noopener')
  }

  return (
    <button type="button" onClick={openRenderer}>
      Open Renderer
    </button>
  )
}
