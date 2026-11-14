import { useParams, useSearchParams } from 'react-router-dom'
import { useMap } from '@state/mapStore'
import HexRenderer from '../render/HexRenderer'

export default function RenderRoomPage() {
  const { state } = useMap()
  const { vnum = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const z = Number(sp.get('z') ?? 0)
  const setZ = (n: number) => { sp.set('z', String(n)); setSp(sp, { replace:true }) }

  return (
    <div className="layout">
      <div className="main" style={{ gridColumn:'1 / -1' }}>
        <div className="toolbar">
          <strong>Room:</strong>&nbsp;{vnum}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            <label>Z-Level:</label>
            <input type="number" value={z} onChange={e => setZ(Number(e.target.value))} style={{ width:64 }} />
            <button onClick={() => setZ(z + 1)}>▲</button>
            <button onClick={() => setZ(z - 1)}>▼</button>
          </div>
        </div>
        <div className="content">
          <HexRenderer doc={state.doc} level={z} focusVnum={vnum} />
        </div>
      </div>
    </div>
  )
}
