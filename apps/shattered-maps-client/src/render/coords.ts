import { Coords } from '../types'

// For flat-top, use axial (q = cx, r = cy)
export function cubeToAxial(cx = 0, cy = 0, _cz = 0) {
  return { q: cx, r: cy }
}
export function axialToCube(q = 0, r = 0) {
  const cx = q, cy = r, cz = -cx - cy
  return { cx, cy, cz }
}

export function deriveAxial(c: Coords | undefined) {
  if (!c) return { q: 0, r: 0 }
  // cz is redundant (cx + cy + cz = 0) and the saved documents, the seed included, store only cx and cy: requiring cz drew
  // every such room at the origin.
  const hasCube = Number.isFinite(c?.cx) && Number.isFinite(c?.cy)
  let base = { q: 0, r: 0 }
  if (hasCube) base = cubeToAxial(c!.cx!, c!.cy!, c!.cz)
  else if (Number.isFinite(c?.q) || Number.isFinite(c?.r)) base = { q: c!.q ?? 0, r: c!.r ?? 0 }

  const oq = hasCube && Number.isFinite(c?.q) ? (c!.q as number) : 0
  const or = hasCube && Number.isFinite(c?.r) ? (c!.r as number) : 0
  return { q: base.q + oq, r: base.r + or }
}

const SQRT3 = Math.sqrt(3)

/**
 * Where a room's tile is centred. Rooms placed by `cx`/`cy` sit on the compass grid that the octagon view draws (east-west neighbours
 * 4 units apart, north-south 2): axial hex maths would shear that grid, so it is laid out on a plain grid whose pitch
 * (`size / 2` by `size * sqrt(3) / 2` per unit) leaves flat-top tiles of the given size touching, never overlapping. Rooms that only
 * have the legacy axial `q`/`r` keep the axial hex layout.
 */
export function placeRoom(c: Coords | undefined, size: number): { x: number; y: number } {
  const hasGrid = Number.isFinite(c?.cx) && Number.isFinite(c?.cy)
  const { q, r } = deriveAxial(c)
  if (!hasGrid) return { x: size * (1.5 * q), y: size * (SQRT3 * (r + q / 2)) }
  // the axial offset a cube room may also carry is added on the hex lattice, as deriveAxial adds it
  const oq = Number.isFinite(c?.q) ? (c!.q as number) : 0
  const or = Number.isFinite(c?.r) ? (c!.r as number) : 0
  return {
    x: c!.cx! * (size / 2) + size * 1.5 * oq,
    y: c!.cy! * ((size * SQRT3) / 2) + size * SQRT3 * (or + oq / 2),
  }
}

export function getVz(c: Coords | undefined): number {
  // legacy fallback (the Coords type carries the old z and level fields)
  const legacy = c && (Number.isFinite(c.z) ? c.z : (Number.isFinite(c.level) ? c.level : undefined))
  return Number.isFinite(c?.vz) ? (c!.vz as number) : (Number.isFinite(legacy) ? legacy as number : 0)
}
