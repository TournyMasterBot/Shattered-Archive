import type { AreaMapRoom } from '../../api/client.js';
import { layoutArea } from './layout.js';

type TestExit = { door: number; toVnum: number; locks?: number; external?: { file: string; name: string } };

function room(vnum: number, exits: TestExit[], warps?: AreaMapRoom['warps']): AreaMapRoom {
  return {
    vnum,
    name: `Room ${vnum}`,
    sectorType: 0,
    exits: exits.map((e) => ({ locks: 0, ...e })),
    ...(warps ? { warps } : {}),
  };
}

const at = (layout: ReturnType<typeof layoutArea>, vnum: number) => {
  const r = layout.rooms.find((p) => p.vnum === vnum)!;
  return [r.x, r.y] as const;
};

describe('layoutArea', () => {
  it('lays a linear east corridor on one row', () => {
    const layout = layoutArea([
      room(1, [{ door: 1, toVnum: 2 }]),
      room(2, [{ door: 3, toVnum: 1 }, { door: 1, toVnum: 3 }]),
      room(3, [{ door: 3, toVnum: 2 }]),
    ]);
    expect(at(layout, 1)).toEqual([0, 0]);
    expect(at(layout, 2)).toEqual([1, 0]);
    expect(at(layout, 3)).toEqual([2, 0]);
    expect(layout.width).toBe(3);
    expect(layout.height).toBe(1);
    // each reciprocal exit pair draws, but all edges are internal
    expect(layout.edges.every((e) => e.kind === 'internal')).toBe(true);
  });

  it('closes a N/E/S/W loop onto a 2x2 square', () => {
    // 1 -E-> 2 -S-> 3 -W-> 4 -N-> 1
    const layout = layoutArea([
      room(1, [{ door: 1, toVnum: 2 }]),
      room(2, [{ door: 2, toVnum: 3 }]),
      room(3, [{ door: 3, toVnum: 4 }]),
      room(4, [{ door: 0, toVnum: 1 }]),
    ]);
    expect(at(layout, 1)).toEqual([0, 0]);
    expect(at(layout, 2)).toEqual([1, 0]);
    expect(at(layout, 3)).toEqual([1, 1]);
    expect(at(layout, 4)).toEqual([0, 1]);
  });

  it('shifts a colliding room to the next free cell in the same direction', () => {
    // 1 has east exits (via two paths) that both want cell (1,0)
    const layout = layoutArea([
      room(1, [{ door: 1, toVnum: 2 }, { door: 4, toVnum: 3 }]),
      room(2, []),
      room(3, [{ door: 2, toVnum: 4 }]), // up-lane room, its south neighbor wants (1,0) too
      room(4, []),
    ]);
    const cells = layout.rooms.map((r) => `${r.x},${r.y}`);
    expect(new Set(cells).size).toBe(cells.length); // no two rooms share a cell
  });

  it('places disconnected components without overlap', () => {
    const layout = layoutArea([room(1, []), room(2, []), room(3, [])]);
    const cells = layout.rooms.map((r) => `${r.x},${r.y}`);
    expect(new Set(cells).size).toBe(3);
  });

  it('lays diagonals on corner cells (Phase 12b rose)', () => {
    // 1 -NE-> 2 -SE-> 3, and 1 -SW-> 4
    const layout = layoutArea([
      room(1, [{ door: 6, toVnum: 2 }, { door: 9, toVnum: 4 }]),
      room(2, [{ door: 8, toVnum: 3 }]),
      room(3, []),
      room(4, []),
    ]);
    const [x1, y1] = at(layout, 1);
    expect(at(layout, 2)).toEqual([x1 + 1, y1 - 1]); // northeast
    expect(at(layout, 3)).toEqual([x1 + 2, y1]); // then southeast
    expect(at(layout, 4)).toEqual([x1 - 1, y1 + 1]); // southwest
  });

  it('ring-places up/down targets without stealing compass cells', () => {
    // 1 has N, E, NE, and U exits; the U room must land in some free cell.
    const layout = layoutArea([
      room(1, [
        { door: 0, toVnum: 2 },
        { door: 1, toVnum: 3 },
        { door: 6, toVnum: 4 },
        { door: 4, toVnum: 5 },
      ]),
      room(2, []),
      room(3, []),
      room(4, []),
      room(5, []),
    ]);
    const [x1, y1] = at(layout, 1);
    expect(at(layout, 2)).toEqual([x1, y1 - 1]);
    expect(at(layout, 3)).toEqual([x1 + 1, y1]);
    expect(at(layout, 4)).toEqual([x1 + 1, y1 - 1]);
    const cells = layout.rooms.map((r) => `${r.x},${r.y}`);
    expect(new Set(cells).size).toBe(cells.length);
    // the up edge still draws
    expect(layout.edges.some((e) => e.door === 4)).toBe(true);
  });

  it('classifies exits: two-way, one-way, non-returning, loop (Phase 12b)', () => {
    const layout = layoutArea([
      // 1 -E-> 2 with 2 -W-> 1 (two-way); 1 -N-> 3 with no return (one-way);
      // 1 -S-> 4 whose north exit leads to 2 instead (non-returning);
      // 4 -E-> 4 (loop)
      room(1, [
        { door: 1, toVnum: 2 },
        { door: 0, toVnum: 3 },
        { door: 2, toVnum: 4 },
      ]),
      room(2, [{ door: 3, toVnum: 1 }]),
      room(3, []),
      room(4, [
        { door: 0, toVnum: 2 },
        { door: 1, toVnum: 4 },
      ]),
    ]);
    const byDoor = (fromVnum: number, door: number) =>
      layout.edges.find((e) => e.fromVnum === fromVnum && e.door === door)!;
    expect(byDoor(1, 1).classification).toBe('two-way');
    expect(byDoor(1, 0).classification).toBe('one-way');
    expect(byDoor(1, 2).classification).toBe('non-returning');
    expect(byDoor(4, 1).classification).toBe('loop');
  });

  it('passes lock states through and builds warp edges + warp portals (Phase 12b)', () => {
    const layout = layoutArea([
      room(
        1,
        [{ door: 1, toVnum: 2, locks: 2 }],
        [{ toVnum: 2 }, { toVnum: 999, external: { file: 'far.are', name: 'Far Side' } }],
      ),
      room(2, []),
    ]);
    expect(layout.edges.find((e) => e.door === 1)?.locks).toBe(2);
    const warpEdges = layout.edges.filter((e) => e.kind === 'warp');
    expect(warpEdges).toHaveLength(2);
    expect(warpEdges.every((e) => e.door === -1)).toBe(true);
    const warpPortal = layout.portals.find((p) => p.id === '1:w:999');
    expect(warpPortal).toMatchObject({ file: 'far.are', name: 'Far Side', toVnum: 999 });
  });

  it('turns an external exit into a portal stub with an external edge, and skips dangling exits', () => {
    const layout = layoutArea([
      room(1, [
        { door: 1, toVnum: 205, external: { file: 'neighbor.are', name: 'Neighbor Landing' } },
        { door: 2, toVnum: 999 }, // dangling: no local room, no external — nothing drawn
      ]),
    ]);
    expect(layout.portals).toHaveLength(1);
    const portal = layout.portals[0];
    expect(portal).toMatchObject({ id: '1:1', file: 'neighbor.are', name: 'Neighbor Landing', toVnum: 205 });
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].kind).toBe('external');
  });
});
