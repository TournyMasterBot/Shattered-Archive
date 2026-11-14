import { Direction } from '../types';
import { axialToCube, cubeToAxial, deriveAxial, getVz, placeRoom } from './coords';
import { dirToGrid, dirUnit, reverseDir } from './dir';
import { axialToPixel, fitLabel, hexPoints } from './hexMath';
import { gridToPixel, octagonPoints } from './octMath';

const ALL: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'U', 'D'];

describe('dir.ts', () => {
  it('reverses each of the ten directions, and the reverse of the reverse is the start', () => {
    const expected: Record<string, string> = {
      N: 'S',
      NE: 'SW',
      E: 'W',
      SE: 'NW',
      S: 'N',
      SW: 'NE',
      W: 'E',
      NW: 'SE',
      U: 'D',
      D: 'U',
    };
    for (const d of ALL) {
      expect(reverseDir(d)).toBe(expected[d]);
      expect(reverseDir(reverseDir(d))).toBe(d);
    }
  });

  it('leaves a direction it does not know as it is', () => {
    expect(reverseDir('sideways' as Direction)).toBe('sideways');
  });

  it('turns a direction into a step on the grid: y grows southward, up and down change only the level', () => {
    expect(dirToGrid('N')).toEqual([0, -1, 0]);
    expect(dirToGrid('NE')).toEqual([1, -1, 0]);
    expect(dirToGrid('E')).toEqual([1, 0, 0]);
    expect(dirToGrid('SE')).toEqual([1, 1, 0]);
    expect(dirToGrid('S')).toEqual([0, 1, 0]);
    expect(dirToGrid('SW')).toEqual([-1, 1, 0]);
    expect(dirToGrid('W')).toEqual([-1, 0, 0]);
    expect(dirToGrid('NW')).toEqual([-1, -1, 0]);
    expect(dirToGrid('U')).toEqual([0, 0, 1]);
    expect(dirToGrid('D')).toEqual([0, 0, -1]);
  });

  it('a step to the reverse direction undoes the step', () => {
    for (const d of ALL) {
      const [x, y, z] = dirToGrid(d);
      const [rx, ry, rz] = dirToGrid(reverseDir(d));
      expect([x + rx, y + ry, z + rz]).toEqual([0, 0, 0]);
    }
  });

  it('gives no step for a direction it does not know', () => {
    expect(dirToGrid('sideways' as Direction)).toEqual([0, 0, 0]);
  });

  it('makes a unit vector, and a zero vector stays zero instead of dividing by zero', () => {
    expect(dirUnit(3, 4)).toEqual({ ux: 0.6, uy: 0.8 });
    expect(dirUnit(-5, 0)).toEqual({ ux: -1, uy: 0 });
    expect(dirUnit(0, 0)).toEqual({ ux: 0, uy: 0 });
    const { ux, uy } = dirUnit(1, 1);
    expect(Math.hypot(ux, uy)).toBeCloseTo(1, 12);
  });
});

describe('coords.ts', () => {
  it('flat-top axial is q = cx, r = cy, and the cube z is -cx - cy', () => {
    expect(cubeToAxial(3, -2, -1)).toEqual({ q: 3, r: -2 });
    expect(cubeToAxial()).toEqual({ q: 0, r: 0 });
    expect(axialToCube(3, -2)).toEqual({ cx: 3, cy: -2, cz: -1 });
    expect(axialToCube()).toMatchObject({ cx: 0, cy: 0 });
    expect(Math.abs(axialToCube().cz)).toBe(0); // the code returns -0 here (-cx - cy); the sign of zero is not part of the contract
    const cube = axialToCube(-4, 7);
    expect(cube.cx + cube.cy + cube.cz).toBe(0);
    expect(cubeToAxial(cube.cx, cube.cy, cube.cz)).toEqual({ q: -4, r: 7 });
  });

  it('derives axial from cube coordinates, from axial ones, or as zero', () => {
    expect(deriveAxial(undefined)).toEqual({ q: 0, r: 0 });
    expect(deriveAxial({ cx: 2, cy: -1, vz: 0, cz: -1 })).toEqual({ q: 2, r: -1 });
    expect(deriveAxial({ cx: 2, cy: -1, vz: 0 })).toEqual({ q: 2, r: -1 }); // no cz (the saved documents store only cx and cy): still placed
    expect(deriveAxial({ cx: 2, vz: 0 })).toEqual({ q: 0, r: 0 }); // no cy: not a cube
    expect(deriveAxial({ q: 5, r: -3 } as never)).toEqual({ q: 5, r: -3 });
    expect(deriveAxial({ q: 5 } as never)).toEqual({ q: 5, r: 0 });
    expect(deriveAxial({ r: -3 } as never)).toEqual({ q: 0, r: -3 });
    expect(deriveAxial({ cx: Number.NaN, cy: 0, cz: 0, vz: 0 } as never)).toEqual({ q: 0, r: 0 });
  });

  it('adds q and r as an offset to cube coordinates', () => {
    expect(deriveAxial({ cx: 2, cy: -1, cz: -1, q: 1, r: 4, vz: 0 })).toEqual({ q: 3, r: 3 });
    expect(deriveAxial({ cx: 2, cy: -1, cz: -1, q: Number.NaN, vz: 0 } as never)).toEqual({ q: 2, r: -1 });
  });

  it('places cx/cy rooms on the compass grid, and legacy q/r rooms on the hex lattice', () => {
    const s = 28;
    const unitY = (s * Math.sqrt(3)) / 2;
    expect(placeRoom(undefined, s)).toEqual({ x: 0, y: 0 });
    expect(placeRoom({ cx: 0, cy: 0, vz: 0 }, s)).toEqual({ x: 0, y: 0 });
    // east-west neighbours are 4 units apart: exactly one tile width (2 * size), so flat-top tiles touch and never overlap
    expect(placeRoom({ cx: 4, cy: 0, vz: 0 }, s).x - placeRoom({ cx: 0, cy: 0, vz: 0 }, s).x).toBe(2 * s);
    // north-south neighbours are 2 units apart: exactly one tile height; and no shear, unlike the axial lattice
    expect(placeRoom({ cx: 0, cy: 2, vz: 0 }, s)).toEqual({ x: 0, y: 2 * unitY });
    expect(placeRoom({ cx: -4, cy: -3, vz: 0 }, s)).toEqual({ x: -2 * s, y: -3 * unitY });
    // a cube room with an axial offset adds that offset on the hex lattice
    const withOffset = placeRoom({ cx: 2, cy: 2, q: 1, r: 0, vz: 0 }, s);
    expect(withOffset.x).toBeCloseTo(s + 1.5 * s);
    expect(withOffset.y).toBeCloseTo(2 * unitY + s * Math.sqrt(3) * 0.5);
    // legacy axial rooms keep the hex lattice
    expect(placeRoom({ q: 2, r: 1 } as never, s)).toEqual(axialToPixel(2, 1, s));
    expect(placeRoom({ q: 5 } as never, s)).toEqual(axialToPixel(5, 0, s));
  });

  it('reads the floor from vz, then from the older z and level fields, else 0', () => {
    expect(getVz(undefined)).toBe(0);
    expect(getVz({ cx: 0, cy: 0, vz: 3 })).toBe(3);
    expect(getVz({ cx: 0, cy: 0, vz: -2 })).toBe(-2);
    expect(getVz({ cx: 0, cy: 0, vz: 0 })).toBe(0);
    expect(getVz({ z: 4 } as never)).toBe(4);
    expect(getVz({ level: 5 } as never)).toBe(5);
    expect(getVz({ z: 4, level: 5 } as never)).toBe(4);
    expect(getVz({ vz: 1, z: 9 } as never)).toBe(1); // vz wins over the legacy fields
    expect(getVz({ vz: Number.NaN, z: 9 } as never)).toBe(9);
    expect(getVz({} as never)).toBe(0);
  });
});

describe('hexMath.ts fitLabel', () => {
  it('keeps a label that fits across the tile, and cuts a longer one with an ellipsis', () => {
    expect(fitLabel('Alpha', 34)).toBe('Alpha');
    expect(fitLabel('Main Road', 34)).toBe('Main Road'); // 9 characters
    const cut = fitLabel('Western Field (3)', 34);
    expect(cut).toBe('Western Fi…'); // 11 fit across a tile of size 34: 10 characters and the ellipsis
    expect(cut.length).toBe(11);
  });

  it('never cuts a label to less than three characters, however small the tile', () => {
    expect(fitLabel('Abcdefgh', 1)).toBe('Ab…');
    expect(fitLabel('Ab', 1)).toBe('Ab');
  });

  it('does not leave a space before the ellipsis', () => {
    expect(fitLabel('Western   Fields', 34)).toBe('Western…');
  });
});

describe('hexMath.ts (flat-top hexes, axial q and r)', () => {
  it('puts the origin at the origin and steps 1.5 sizes right per q, half a hex down per q', () => {
    expect(axialToPixel(0, 0, 10)).toEqual({ x: 0, y: 0 });
    const q1 = axialToPixel(1, 0, 10);
    expect(q1.x).toBe(15);
    expect(q1.y).toBeCloseTo(Math.sqrt(3) * 5, 12);
    const r1 = axialToPixel(0, 1, 10);
    expect(r1.x).toBe(0);
    expect(r1.y).toBeCloseTo(Math.sqrt(3) * 10, 12);
  });

  it('works for negative coordinates and scales with the size', () => {
    const p = axialToPixel(-2, 3, 4);
    expect(p.x).toBe(-12);
    expect(p.y).toBeCloseTo(4 * Math.sqrt(3) * (3 + -2 / 2), 12);
    expect(axialToPixel(1, 1, 20).x).toBe(2 * axialToPixel(1, 1, 10).x);
  });

  it('writes six corners, the first straight to the right of the centre', () => {
    const pts = hexPoints(0, 0, 10).split(' ');
    expect(pts).toHaveLength(6);
    expect(pts[0]).toBe('10,0');
    const [x3, y3] = pts[3].split(',').map(Number);
    expect(x3).toBeCloseTo(-10, 9);
    expect(Math.abs(y3)).toBeLessThan(1e-9);
  });

  it('moves with the centre and keeps every corner one size away', () => {
    const pts = hexPoints(100, -50, 8)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    for (const [x, y] of pts) expect(Math.hypot(x - 100, y + 50)).toBeCloseTo(8, 9);
  });
});

describe('octMath.ts (octagon tiles)', () => {
  it('spaces cells by the size and a fixed 1.2 gap factor', () => {
    expect(gridToPixel(0, 0, 10)).toEqual({ x: 0, y: 0 });
    expect(gridToPixel(2, 3, 10)).toEqual({ x: 24, y: 36 });
    expect(gridToPixel(-1, -1, 5)).toEqual({ x: -6, y: -6 });
  });

  it('draws eight corners around the centre, clockwise from the top left of the flat top', () => {
    const p = octagonPoints(100, 100, 10);
    expect(p).toHaveLength(8);
    const c = 10 * 0.4142;
    expect(p[0]).toEqual({ x: 100 - c, y: 90 });
    expect(p[1]).toEqual({ x: 100 + c, y: 90 });
    expect(p[2]).toEqual({ x: 110, y: 100 - c });
    expect(p[3]).toEqual({ x: 110, y: 100 + c });
    expect(p[4]).toEqual({ x: 100 + c, y: 110 });
    expect(p[5]).toEqual({ x: 100 - c, y: 110 });
    expect(p[6]).toEqual({ x: 90, y: 100 + c });
    expect(p[7]).toEqual({ x: 90, y: 100 - c });
  });

  it('is symmetric about its centre', () => {
    const p = octagonPoints(0, 0, 7);
    for (const q of p) expect(p.some((o) => Math.abs(o.x + q.x) < 1e-9 && Math.abs(o.y + q.y) < 1e-9)).toBe(true);
  });
});
