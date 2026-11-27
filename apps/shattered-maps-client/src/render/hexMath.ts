// src/render/hexMath.ts
// Flat-top hex geometry (so "N" is vertical).
// Axial (q,r) with neighbors: N(0,-1) S(0,1) NE(1,-1) SE(1,0) SW(-1,1) NW(-1,0)

const SQRT3 = Math.sqrt(3)

/** Flat-top axial -> pixel center */
export function axialToPixel(q: number, r: number, size: number) {
  const x = size * (1.5 * q)
  const y = size * (SQRT3 * (r + q / 2))
  return { x, y }
}

/** Flat-top corners (start angle 0° puts a flat side on top) */
function hexCorner(x: number, y: number, size: number, i: number) {
  const angle = (Math.PI / 180) * (60 * i)
  return [x + size * Math.cos(angle), y + size * Math.sin(angle)] as const
}

/** Average width of a character of the tile label (10px type), used to decide how many fit across a tile. */
const LABEL_CHAR_WIDTH = 5.4

/**
 * The label as it fits across a flat-top tile of the given size (the tile is `2 * size` wide), cut with an ellipsis; the full text is
 * kept in the tile's tooltip. Without it a long room name runs across its neighbours and the map is unreadable.
 */
export function fitLabel(label: string, size: number): string {
  const max = Math.max(3, Math.floor((2 * size - 6) / LABEL_CHAR_WIDTH))
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`
}

/** SVG polygon points string for a hex centered at (x,y) */
export function hexPoints(x: number, y: number, size: number) {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const [px, py] = hexCorner(x, y, size, i)
    pts.push(`${px},${py}`)
  }
  return pts.join(' ')
}
