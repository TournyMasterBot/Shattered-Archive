/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
import { useParams, useSearchParams } from 'react-router-dom'
import { useMap } from '@state/mapStore'
import HexRenderer from '../render/HexRenderer'

export default function RenderAreaPage() {
  const { state } = useMap()
  const { worldId = '', continentId = '', areaId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const z = Number(sp.get('z') ?? 0)
  const setZ = (n: number) => { sp.set('z', String(n)); setSp(sp, { replace:true }) }

  const areaFilter = (room: any) =>
    room?.category?.worldId === worldId &&
    room?.category?.continentId === continentId &&
    room?.category?.areaId === areaId

  return (
    <div className="layout">
      <div className="main" style={{ gridColumn:'1 / -1' }}>
        <div className="toolbar">
          <strong>Area:</strong>&nbsp;{worldId}/{continentId}/{areaId}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            <label>Z-Level:</label>
            <input type="number" value={z} onChange={e => setZ(Number(e.target.value))} style={{ width:64 }} />
            <button onClick={() => setZ(z + 1)}>▲</button>
            <button onClick={() => setZ(z - 1)}>▼</button>
          </div>
        </div>
        <div className="content">
          <HexRenderer doc={state.doc} level={z} areaFilter={areaFilter} />
        </div>
      </div>
    </div>
  )
}
