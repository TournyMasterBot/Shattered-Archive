// src/render/dir.ts
import { Direction } from '../types'

/**
 * Octagon grid deltas (8-way movement).
 * Interprets coords as: cx = grid X, cy = grid Y, vz = vertical level.
 *
 * Cardinal neighbors move along the grid axes.
 * Diagonals move one step on both axes.
 */
const DELTA: Record<
  'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW',
  [number, number]
> = {
  N:  [ 0, -1],
  NE: [ 1, -1],
  E:  [ 1,  0],
  SE: [ 1,  1],
  S:  [ 0,  1],
  SW: [-1,  1],
  W:  [-1,  0],
  NW: [-1, -1],
}

// Map reverse directions (cardinals/diagonals + U/D)
export function reverseDir(d: Direction): Direction {
  switch (d) {
    case 'N':  return 'S'
    case 'NE': return 'SW'
    case 'E':  return 'W'
    case 'SE': return 'NW'
    case 'S':  return 'N'
    case 'SW': return 'NE'
    case 'W':  return 'E'
    case 'NW': return 'SE'
    case 'U':  return 'D'
    case 'D':  return 'U'
    default:   return d
  }
}

// Unit-ish direction vector in screen (grid) space for drawing offsets
// Uses the same dx/dy notion as your dirToGrid (flat-top oct octants)
export function dirUnit(dx: number, dy: number): { ux: number; uy: number } {
  const len = Math.hypot(dx, dy) || 1
  return { ux: dx / len, uy: dy / len }
}

/**
 * Convert a direction into a coordinate delta [dx, dy, dz].
 * U/D change vertical level only.
 */
export function dirToGrid(d: Direction): [number, number, number] {
  if (d === 'U') return [0, 0, +1]
  if (d === 'D') return [0, 0, -1]
  const v = DELTA[d as keyof typeof DELTA]
  return v ? [v[0], v[1], 0] : [0, 0, 0]
}
