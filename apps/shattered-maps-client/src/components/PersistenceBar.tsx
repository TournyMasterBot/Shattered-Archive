/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/components/PersistenceBar.tsx
import React from 'react'
import { useMap } from '@state/mapStore'
import { exportToFile, saveToLocal, clearLocal } from '../state/persist'
import { toAsciiArea } from '../render/ascii'
import { renderAreaSVG, renderAreaSVGStacked } from '../render/svgExport'

export default function PersistenceBar() {
  const { state, dispatch } = useMap()
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null)

  // reflect autosave timestamp when doc changes
  React.useEffect(() => {
    setLastSavedAt(Date.now())
  }, [state.doc.meta?.revision])

  // -------- helpers --------
  const getAreaContext = () => {
    // Prefer selected room's area
    const sel = state.selected ? state.doc.rooms[state.selected] : null
    const areaIdFromRoom = sel?.category?.areaId
    if (areaIdFromRoom && state.doc.meta.catalog?.areas?.[areaIdFromRoom]) {
      const area = state.doc.meta.catalog.areas[areaIdFromRoom]
      return { areaId: area.id, areaName: area.name || area.id }
    }

    // Otherwise, if there's only one area, use it
    const areas = Object.values(state.doc.meta.catalog?.areas ?? {})
    if (areas.length === 1) {
      const a = areas[0]
      return { areaId: a.id, areaName: a.name || a.id }
    }

    // Fallback: prompt user to pick an area
    const names = areas.map(a => `${a.name || a.id} (${a.id})`).join('\n')
    const pick = prompt(`Which area to export?\n\n${names}\n\nEnter area id:`)?.trim()
    if (pick && state.doc.meta.catalog?.areas?.[pick]) {
      const a = state.doc.meta.catalog.areas[pick]
      return { areaId: a.id, areaName: a.name || a.id }
    }
    return null
  }

  const downloadText = (filename: string, text: string, type = 'text/plain') => {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // -------- JSON --------
  const onExportJson = () => {
    exportToFile(state.doc, `mapdoc-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
  }

  const onImport = async (file?: File) => {
    try {
      if (!file) return
      const text = await file.text()
      const doc = JSON.parse(text)
      dispatch({ type: 'HYDRATE', doc })
      saveToLocal(doc)
      setLastSavedAt(Date.now())
      alert('Import complete ✔')
    } catch (e: any) {
      alert(`Import failed: ${e?.message || e}`)
    }
  }

  const onSnapshot = () => {
    const { savedAt } = saveToLocal(state.doc)
    setLastSavedAt(savedAt)
    alert('Snapshot saved to local storage ✔')
  }

  const onClear = () => {
    if (!confirm('Clear autosave from local storage? (Your in-memory work remains until reload)')) return
    clearLocal()
    alert('Autosave cleared.')
  }

  // -------- ASCII (current area / current level) --------
  const onExportAscii = () => {
    const ctx = getAreaContext()
    if (!ctx) { alert('No area selected'); return }
    const level = typeof state.level === 'number' ? state.level : 0
    const ascii = toAsciiArea(state.doc, ctx.areaId, level)
    downloadText(`${ctx.areaName.replace(/\s+/g,'_')}-vz${level}.txt`, ascii, 'text/plain')
  }

  // -------- SVG single floor (current area / current level) --------
  const onExportSvgSingle = () => {
    const ctx = getAreaContext()
    if (!ctx) { alert('No area selected'); return }
    const level = typeof state.level === 'number' ? state.level : 0
    const svg = renderAreaSVG(state.doc, ctx.areaId, level)
    downloadText(`${ctx.areaName.replace(/\s+/g,'_')}-vz${level}.svg`, svg, 'image/svg+xml')
  }

  // -------- SVG all floors stacked (current area) --------
  const onExportSvgAllFloors = () => {
    const ctx = getAreaContext()
    if (!ctx) { alert('No area selected'); return }
    const svg = renderAreaSVGStacked(state.doc, ctx.areaId)
    downloadText(`${ctx.areaName.replace(/\s+/g,'_')}-all-floors.svg`, svg, 'image/svg+xml')
  }

  return (
    <div className="toolbar" style={{ gap: 6, borderBottom: '1px solid var(--line)' }}>
      {/* JSON */}
      <button onClick={onExportJson}>Export JSON</button>
      <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span style={{ opacity:.85 }}>Import</span>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => onImport(e.target.files?.[0])}
        />
      </label>
      <button onClick={onSnapshot}>Save Snapshot</button>
      <button onClick={onClear}>Clear Autosave</button>

      {/* ASCII / SVG */}
      <span style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 6px' }} />
      <button onClick={onExportAscii} title="Exports the current area at the current view level as ASCII">
        Export ASCII (level)
      </button>
      <button onClick={onExportSvgSingle} title="Exports the current area at the current view level as SVG">
        Export Area SVG (level)
      </button>
      <button onClick={onExportSvgAllFloors} title="Exports one SVG stacking all floors for the current area">
        Export Area SVG (all floors)
      </button>

      <div style={{ marginLeft:'auto', fontSize:12, opacity:.8 }}>
        {lastSavedAt ? `autosaved ${new Date(lastSavedAt).toLocaleTimeString()}` : '—'}
      </div>
    </div>
  )
}
