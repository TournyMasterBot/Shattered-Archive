import { countOverlaps, layoutContinent, type LayoutBox, type LayoutSpec, type Rect } from './continentLayout.js';

const box = (id: string, x: number, y: number, w: number, h: number, rooms = w * h): LayoutBox => ({ id, x, y, w, h, rooms });
const rect = (r: Rect | undefined): Rect => r as Rect;
const centre = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

describe('countOverlaps', () => {
  it('counts the pairs that overlap at all, and not boxes that only touch or are apart', () => {
    expect(countOverlaps([{ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 3, w: 4, h: 4 }, { x: 5, y: 2, w: 2, h: 3 }, { x: 20, y: 20, w: 1, h: 1 }])).toBe(2);
    expect(countOverlaps([])).toBe(0);
  });
});

describe('layoutContinent', () => {
  it('leaves no overlap and a gap between every pair, from a pile of boxes on top of each other', () => {
    const pile = [box('a', 0, 0, 10, 10), box('b', 2, 2, 8, 8), box('c', 4, 4, 6, 6), box('d', 5, 5, 3, 3), box('e', 0, 0, 12, 4)];
    const result = layoutContinent(pile, { center: 'a', relations: [], gap: 1 });
    expect(result.overlapsBefore).toBe(8);
    expect(result.overlapsAfter).toBe(0);
    const rects = [...result.placements.values()];
    expect(rects).toHaveLength(5);
    // the gap: no two boxes closer than one cell
    for (let i = 0; i < rects.length; i += 1)
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rect(rects[i]);
        const b = rect(rects[j]);
        const apartX = a.x >= b.x + b.w + 1 || b.x >= a.x + a.w + 1;
        const apartY = a.y >= b.y + b.h + 1 || b.y >= a.y + a.h + 1;
        expect(apartX || apartY).toBe(true);
      }
    expect(result.warnings).toEqual([]);
  });

  it('keeps the centre area where the source had it and keeps every size in the extent mode', () => {
    const result = layoutContinent([box('a', 5, 7, 10, 6), box('b', 5, 7, 4, 4)], { center: 'a', relations: [] });
    expect(result.placements.get('a')).toEqual({ x: 5, y: 7, w: 10, h: 6 });
    expect(rect(result.placements.get('b')).w).toBe(4);
    expect(rect(result.placements.get('b')).h).toBe(4);
    expect(result.moved).toBe(1);
  });

  it('puts an area in the compass direction asked, as near as the boxes allow', () => {
    const boxes = [box('city', 0, 0, 10, 10), box('port', 0, 0, 6, 6), box('north', 0, 0, 6, 6), box('east', 0, 0, 6, 6), box('south', 0, 0, 6, 6)];
    const spec: LayoutSpec = {
      center: 'city',
      gap: 1,
      relations: [
        { area: 'port', of: 'city', dir: 'W' },
        { area: 'north', of: 'city', dir: 'N' },
        { area: 'east', of: 'city', dir: 'E' },
        { area: 'south', of: 'city', dir: 'S' },
      ],
    };
    const r = layoutContinent(boxes, spec).placements;
    const [cx, cy] = centre(rect(r.get('city')));
    expect(centre(rect(r.get('port')))[0]).toBeLessThan(cx);
    expect(Math.abs(centre(rect(r.get('port')))[1] - cy)).toBeLessThanOrEqual(1);
    expect(centre(rect(r.get('north')))[1]).toBeLessThan(cy);
    expect(centre(rect(r.get('east')))[0]).toBeGreaterThan(cx);
    expect(centre(rect(r.get('south')))[1]).toBeGreaterThan(cy);
    // the nearest legal place: the gap and nothing more
    expect(rect(r.get('east')).x).toBe(rect(r.get('city')).x + 10 + 1);
  });

  it('places a diagonal relation on the right side of both axes, and chains relations through areas that were placed before', () => {
    const boxes = [box('c', 0, 0, 8, 8), box('a', 0, 0, 4, 4), box('b', 0, 0, 4, 4)];
    const r = layoutContinent(boxes, {
      center: 'c',
      relations: [
        { area: 'a', of: 'c', dir: 'NE' },
        { area: 'b', of: 'a', dir: 'SSE' },
      ],
    }).placements;
    const [cx, cy] = centre(rect(r.get('c')));
    const [ax, ay] = centre(rect(r.get('a')));
    const [bx, by] = centre(rect(r.get('b')));
    expect(ax).toBeGreaterThan(cx);
    expect(ay).toBeLessThan(cy);
    expect(by).toBeGreaterThan(ay);
    expect(bx).toBeGreaterThanOrEqual(ax);
  });

  it('moves the rest with the pinned area nearest to them, so a district stays beside its city', () => {
    // two cities far apart in the source, each with a district right beside it
    const boxes = [box('west', 0, 0, 10, 10), box('east', 100, 0, 10, 10), box('westDistrict', 11, 0, 4, 4), box('eastDistrict', 111, 0, 4, 4)];
    const r = layoutContinent(boxes, {
      center: 'west',
      relations: [{ area: 'east', of: 'west', dir: 'S' }], // the east city is moved to the south of the west one
    }).placements;
    const westD = centre(rect(r.get('westDistrict')));
    const eastD = centre(rect(r.get('eastDistrict')));
    const west = centre(rect(r.get('west')));
    const east = centre(rect(r.get('east')));
    expect(Math.hypot(westD[0] - west[0], westD[1] - west[1])).toBeLessThan(Math.hypot(westD[0] - east[0], westD[1] - east[1]));
    expect(Math.hypot(eastD[0] - east[0], eastD[1] - east[1])).toBeLessThan(Math.hypot(eastD[0] - west[0], eastD[1] - west[1]));
  });

  it('is deterministic: the same boxes and spec give the same placements whatever the input order', () => {
    const boxes = [box('a', 0, 0, 9, 9, 50), box('b', 1, 1, 7, 7, 30), box('c', 2, 2, 5, 5, 30), box('d', 3, 3, 3, 3, 5)];
    const spec: LayoutSpec = { center: 'a', relations: [{ area: 'b', of: 'a', dir: 'E' }] };
    const one = layoutContinent(boxes, spec).placements;
    const two = layoutContinent([...boxes].reverse(), spec).placements;
    for (const id of ['a', 'b', 'c', 'd']) expect(two.get(id)).toEqual(one.get(id));
  });

  it('room-count mode sizes boxes by rooms, keeps the aspect, never below the minimum side, and still has no overlap', () => {
    const boxes = [box('big', 0, 0, 30, 10, 300), box('small', 0, 0, 2, 2, 1), box('wide', 0, 0, 20, 4, 40)];
    const result = layoutContinent(boxes, { center: 'big', relations: [], sizeBy: 'rooms' });
    const big = rect(result.placements.get('big'));
    const small = rect(result.placements.get('small'));
    const wide = rect(result.placements.get('wide'));
    expect(big.w / big.h).toBeGreaterThan(2.5); // 3:1 stays about 3:1
    expect(small.w).toBeGreaterThanOrEqual(2);
    expect(small.h).toBeGreaterThanOrEqual(2);
    expect(big.w * big.h).toBeGreaterThan(wide.w * wide.h);
    expect(result.overlapsAfter).toBe(0);
  });

  it('says what it skipped instead of failing: an unknown centre, an unknown area, a repeated area, a relation from an area not placed yet', () => {
    const boxes = [box('a', 0, 0, 4, 4), box('b', 0, 0, 4, 4), box('c', 0, 0, 4, 4)];
    const noCentre = layoutContinent(boxes, { center: 'missing', relations: [] });
    expect(noCentre.warnings).toEqual(['the centre area missing is not on this continent']);
    expect(noCentre.overlapsAfter).toBe(0);
    expect(noCentre.placements.size).toBe(3);

    const result = layoutContinent(boxes, {
      center: 'a',
      relations: [
        { area: 'ghost', of: 'a', dir: 'N' },
        { area: 'a', of: 'a', dir: 'N' },
        { area: 'b', of: 'c', dir: 'E' },
        { area: 'b', of: 'a', dir: 'E' },
        { area: 'b', of: 'a', dir: 'W' },
      ],
    });
    expect(result.warnings).toEqual([
      'relation skipped: ghost is not on this continent',
      'relation skipped: a is already placed',
      'relation skipped: b is placed from c, which is not placed yet',
      'relation skipped: b is already placed',
    ]);
    expect(result.overlapsAfter).toBe(0);
  });

  it('with no pinned area at all the boxes only move apart from where the source had them', () => {
    const result = layoutContinent([box('a', 0, 0, 5, 5), box('b', 1, 1, 5, 5)], { center: 'none', relations: [] });
    expect(result.overlapsAfter).toBe(0);
    expect(result.moved).toBeGreaterThanOrEqual(1);
  });

  it('keeps the bearing when the nearest spot is taken, and falls back to the nearest free place when every place along the bearings is taken', () => {
    // the tree sits north-north-east of the port; the fortress is wanted south-south-east of the tree, where the port already is: it must go on the south-east side
    const boxes = [box('city', 0, 0, 10, 10), box('port', 0, 0, 8, 8), box('tree', 0, 0, 4, 4), box('fort', 0, 0, 6, 6)];
    const r = layoutContinent(boxes, {
      center: 'city',
      relations: [
        { area: 'port', of: 'city', dir: 'W' },
        { area: 'tree', of: 'port', dir: 'NNE' },
        { area: 'fort', of: 'tree', dir: 'SSE' },
      ],
    });
    const tree = centre(rect(r.placements.get('tree')));
    const fort = centre(rect(r.placements.get('fort')));
    expect(fort[1]).toBeGreaterThan(tree[1]); // south of the tree
    expect(fort[0]).toBeGreaterThan(tree[0]); // and east of it
    expect(r.overlapsAfter).toBe(0);

    // walls all around the centre leave no free place within reach of any bearing: the nearest free place is used and nothing overlaps
    const walled = layoutContinent(
      [box('c', 0, 0, 2, 2), box('e', 0, 0, 400, 400), box('w', 0, 0, 400, 400), box('n', 0, 0, 400, 400), box('s', 0, 0, 400, 400), box('x', 0, 0, 3, 3)],
      { center: 'c', relations: [
        { area: 'e', of: 'c', dir: 'E' }, { area: 'w', of: 'c', dir: 'W' }, { area: 'n', of: 'c', dir: 'N' }, { area: 's', of: 'c', dir: 'S' },
        { area: 'x', of: 'c', dir: 'NE' },
      ] },
    );
    expect(walled.overlapsAfter).toBe(0);
    expect(walled.warnings).toEqual([]);
  });

  it('keeps the gap at the default of one cell when none is given and honours a wider one', () => {
    const two = [box('a', 0, 0, 4, 4), box('b', 0, 0, 4, 4)];
    const tight = rect(layoutContinent(two, { center: 'a', relations: [{ area: 'b', of: 'a', dir: 'E' }] }).placements.get('b'));
    expect(tight.x).toBe(5);
    const wide = rect(layoutContinent(two, { center: 'a', relations: [{ area: 'b', of: 'a', dir: 'E' }], gap: 4 }).placements.get('b'));
    expect(wide.x).toBe(8);
  });
});
