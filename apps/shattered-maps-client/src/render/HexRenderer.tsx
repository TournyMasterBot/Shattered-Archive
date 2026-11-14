// src/render/HexRenderer.tsx
import React, { useMemo } from 'react'
import { MapDocV1 } from '../types'
import { fitLabel, hexPoints } from './hexMath'
import { getVz, placeRoom } from './coords'
import '../styles/renderer.scss'

export default function HexRenderer({
  doc, level, focusVnum, areaFilter, size = 34,
}: {
  doc: MapDocV1
  level: number  // <-- this is vz now
  focusVnum?: string
  areaFilter?: (room: MapDocV1['rooms'][string]) => boolean
  size?: number
}) {
  const rooms = useMemo(() => {
    return Object.values(doc.rooms).filter((r) => {
      const vz = getVz(r.coords)
      return vz === level && (!areaFilter || areaFilter(r))
    })
  }, [doc.rooms, level, areaFilter])

  const roomIndex = useMemo(
    () => Object.fromEntries(rooms.map((r) => [r.vnum, r])),
    [rooms]
  )

  const layout = useMemo(() => {
    return rooms.map((r) => {
      const { x, y } = placeRoom(r.coords, size)
      return { ...r, x, y }
    })
  }, [rooms, size])

  const focus = focusVnum && roomIndex[focusVnum]
  const pad = 64
  const minX = Math.min(...layout.map((h) => h.x), 0) - pad
  const maxX = Math.max(...layout.map((h) => h.x), 0) + pad
  const minY = Math.min(...layout.map((h) => h.y), 0) - pad
  const maxY = Math.max(...layout.map((h) => h.y), 0) + pad

  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} width="100%" height="80vh" className="hexmap">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#bbb" />
        </marker>
      </defs>

      {/* edges */}
      {layout.map((from) =>
        Object.entries(from.exits || {}).map(([dir, ex]) => {
          if (!ex || !ex.to) return null
          const to = layout.find((h) => h.vnum === ex.to)
          if (!to) return null
          return (
            <line
              key={`${from.vnum}-${dir}`}
              x1={from.x} y1={from.y}
              x2={to.x}   y2={to.y}
              className={`edge ${ex.oneWay ? 'edge--oneway' : ''} ${ex.door ? 'edge--door' : ''}`}
              markerEnd="url(#arrow)"
            />
          )
        })
      )}

      {/* nodes */}
      {layout.map((h) => (
        <g key={h.vnum} className={`hex ${focus && focus.vnum === h.vnum ? 'hex--focus' : ''} ${h.flags?.primary ? 'hex--primary' : ''}`}>
          <polygon points={hexPoints(h.x, h.y, size)} />
          <text x={h.x} y={h.y} className="hex__label">
            <title>{h.label ?? h.vnum}</title>
            {fitLabel(h.label ?? h.vnum, size)}
          </text>
          {(h.exits?.U || h.exits?.D) && (
            <g>
              {h.exits?.U && <text x={h.x} y={h.y - size * 0.9} className="badge badge--u">U</text>}
              {h.exits?.D && <text x={h.x} y={h.y + size * 0.9} className="badge badge--d">D</text>}
            </g>
          )}
        </g>
      ))}
    </svg>
  )
}
