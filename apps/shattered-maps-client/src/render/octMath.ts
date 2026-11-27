// src/render/octMath.ts

/**
 * Geometry helpers for flat-top octagon tiling.
 *
 * Each cell is an octagon centered at (cx, cy).
 * We treat grid spacing as a simple multiplier (size).
 */

export interface Point {
  x: number
  y: number
}

/**
 * Compute the pixel center for a given grid coordinate.
 * Scale = pixel size of half an octagon edge.
 */
export function gridToPixel(cx: number, cy: number, size: number): Point {
  const x = cx * size * 1.2 // spacing adjustment
  const y = cy * size * 1.2
  return { x, y }
}

/**
 * Return the 8 points of a flat-top octagon centered at (x,y).
 * Size = half-length of an edge.
 */
export function octagonPoints(x: number, y: number, size: number): Point[] {
  const s = size
  const c = s * 0.4142 // ≈ (√2 - 1) * size for flat sides

  return [
    { x: x - c, y: y - s },
    { x: x + c, y: y - s },
    { x: x + s, y: y - c },
    { x: x + s, y: y + c },
    { x: x + c, y: y + s },
    { x: x - c, y: y + s },
    { x: x - s, y: y + c },
    { x: x - s, y: y - c },
  ]
}
