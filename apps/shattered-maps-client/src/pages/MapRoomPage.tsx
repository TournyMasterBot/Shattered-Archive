import { useCallback } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { useMap } from '@state/mapStore'
import type { MapDocV1 } from '../types'
import { getVz } from '../render/coords'
import HexRenderer from '../render/HexRenderer'

export default function MapRoomPage() {
  const { state } = useMap()
  const { vnum = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const focus = state.doc.rooms[vnum]
  // Show the focused room's own area on its own floor (areas have separate origins); without a ?level the room's floor is used.
  const level = sp.has('level') ? Number(sp.get('level')) : getVz(focus?.coords)
  const focusArea = focus?.category?.areaId
  const areaFilter = useCallback(
    (room: MapDocV1['rooms'][string]) => (focusArea ? room.category?.areaId === focusArea : room.vnum === vnum),
    [focusArea, vnum],
  )
  const setLevel = (n: number) => { sp.set('level', String(n)); setSp(sp, { replace: true }) }

  return (
    <div className="layout">
      <div className="main" style={{ gridColumn: '1 / -1' }}>
        <div className="toolbar">
          <strong>Room:</strong>&nbsp;{vnum}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <label>Level:</label>
            <input type="number" value={level} onChange={e => setLevel(Number(e.target.value))} style={{ width: 64 }} />
            <button onClick={() => setLevel(level + 1)}>▲</button>
            <button onClick={() => setLevel(level - 1)}>▼</button>
          </div>
        </div>
        <div className="content">
          <HexRenderer doc={state.doc} level={level} focusVnum={vnum} areaFilter={areaFilter} />
        </div>
      </div>
    </div>
  )
}
