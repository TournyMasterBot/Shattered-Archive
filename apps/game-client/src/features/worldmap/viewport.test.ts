import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  centerOn,
  clampScale,
  fit,
  floorLabel,
  floorName,
  panBy,
  placeView,
  polygonCenter,
  polygonDot,
  zoomAt,
  type View,
} from './viewport';

const shown = (view: View, p: { x: number; y: number }) => ({
  x: view.x + p.x * view.scale,
  y: view.y + p.y * view.scale,
});

describe('clampScale', () => {
  it('keeps the scale inside the limits and replaces a number that is not finite by 1', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('panBy', () => {
  it('moves the picture by the distance and keeps the scale; a distance that is not finite is no move', () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, 5, -7)).toEqual({ scale: 2, x: 15, y: 13 });
    expect(panBy(IDENTITY, Number.NaN, Number.POSITIVE_INFINITY)).toEqual(IDENTITY);
  });
});

describe('zoomAt', () => {
  it('keeps the picture point under the cursor where it was', () => {
    const view: View = { scale: 1.5, x: 30, y: -20 };
    const cursor = { x: 200, y: 120 };
    const underCursor = { x: (cursor.x - view.x) / view.scale, y: (cursor.y - view.y) / view.scale };
    const zoomed = zoomAt(view, 1.6, cursor.x, cursor.y);
    expect(zoomed.scale).toBeCloseTo(2.4);
    expect(shown(zoomed, underCursor).x).toBeCloseTo(cursor.x);
    expect(shown(zoomed, underCursor).y).toBeCloseTo(cursor.y);
  });

  it('stops at the limits without moving the picture away from the cursor', () => {
    const maxed = zoomAt({ scale: MAX_SCALE, x: 5, y: 5 }, 2, 50, 50);
    expect(maxed).toEqual({ scale: MAX_SCALE, x: 5, y: 5 });
    const mined = zoomAt({ scale: MIN_SCALE, x: 5, y: 5 }, 0.1, 50, 50);
    expect(mined.scale).toBe(MIN_SCALE);
    expect(zoomAt(IDENTITY, Number.NaN, 10, 10)).toEqual(IDENTITY);
  });

  it('zooming in and then out by the same factor is back where it started', () => {
    const view: View = { scale: 1, x: 40, y: 60 };
    const back = zoomAt(zoomAt(view, 1.25, 100, 80), 1 / 1.25, 100, 80);
    expect(back.scale).toBeCloseTo(1);
    expect(back.x).toBeCloseTo(40);
    expect(back.y).toBeCloseTo(60);
  });
});

describe('fit', () => {
  it('shows the whole picture centred with the padding around it', () => {
    const view = fit({ x: 0, y: 0, width: 800, height: 400 }, { width: 400, height: 300 }, 20);
    expect(view.scale).toBeCloseTo(360 / 800);
    expect(view.x).toBeCloseTo((400 - 800 * view.scale) / 2);
    expect(view.y).toBeCloseTo((300 - 400 * view.scale) / 2);
  });

  it('does not magnify a small picture past 1.5', () => {
    expect(fit({ x: 0, y: 0, width: 50, height: 50 }, { width: 800, height: 600 }).scale).toBe(1.5);
  });

  it('is the identity for a picture or a box without a size', () => {
    expect(fit({ x: 0, y: 0, width: 0, height: 10 }, { width: 100, height: 100 })).toEqual(IDENTITY);
    expect(fit({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 100 })).toEqual(IDENTITY);
    expect(fit({ x: 0, y: 0, width: Number.NaN, height: 10 }, { width: 100, height: 100 })).toEqual(IDENTITY);
  });

  it('never goes below the smallest scale for a huge picture', () => {
    expect(fit({ x: 0, y: 0, width: 1_000_000, height: 1_000_000 }, { width: 400, height: 300 }).scale).toBe(MIN_SCALE);
  });
});

describe('fit: a rectangle that does not start at the corner', () => {
  it('centres the rectangle, not the corner of the picture', () => {
    const rect = { x: 300, y: 200, width: 400, height: 200 };
    const view = fit(rect, { width: 500, height: 300 }, 50, 10);
    expect(view.scale).toBeCloseTo(1); // (500 - 100) / 400
    // the middle of the rectangle (500, 300) lands in the middle of the box (250, 150)
    expect(shown(view, { x: 500, y: 300 }).x).toBeCloseTo(250);
    expect(shown(view, { x: 500, y: 300 }).y).toBeCloseTo(150);
  });
});

describe('centerOn', () => {
  it('puts the picture point in the middle of the box and keeps the scale', () => {
    const view = centerOn({ scale: 2, x: 999, y: 999 }, { x: 100, y: 50 }, { width: 400, height: 300 });
    expect(view.scale).toBe(2);
    expect(shown(view, { x: 100, y: 50 })).toEqual({ x: 200, y: 150 });
  });
});

describe('placeView', () => {
  const content = { x: 0, y: 0, width: 1000, height: 800 };
  const box = { width: 400, height: 300 };
  const current: View = { scale: 2, x: -50, y: -60 };

  it('shows a new area life-size around its target room', () => {
    const view = placeView({
      areaChanged: true,
      current,
      content,
      box,
      target: { x: 500, y: 400 },
      centerOnTarget: false,
    });
    expect(view.scale).toBe(1);
    expect(shown(view, { x: 500, y: 400 })).toEqual({ x: 200, y: 150 });
  });

  it('fits a new area that has no target room', () => {
    expect(placeView({ areaChanged: true, current, content, box, target: null, centerOnTarget: true })).toEqual(
      fit(content, box),
    );
  });

  it('keeps the view the person made in the same area', () => {
    expect(
      placeView({ areaChanged: false, current, content, box, target: { x: 1, y: 1 }, centerOnTarget: false }),
    ).toBe(current);
    expect(placeView({ areaChanged: false, current, content, box, target: null, centerOnTarget: true })).toBe(current);
  });

  it('brings the target to the middle, keeping the zoom, when following', () => {
    const view = placeView({
      areaChanged: false,
      current,
      content,
      box,
      target: { x: 300, y: 200 },
      centerOnTarget: true,
    });
    expect(view.scale).toBe(2);
    expect(shown(view, { x: 300, y: 200 })).toEqual({ x: 200, y: 150 });
  });
});

describe('polygonCenter', () => {
  it('averages the points of a polygon', () => {
    expect(polygonCenter('0,0 10,0 10,10 0,10')).toEqual({ x: 5, y: 5 });
    expect(polygonCenter(' 4,8 ')).toEqual({ x: 4, y: 8 });
  });

  it('is null for nothing usable, and skips a pair that is not two numbers', () => {
    expect(polygonCenter(null)).toBeNull();
    expect(polygonCenter(undefined)).toBeNull();
    expect(polygonCenter('')).toBeNull();
    expect(polygonCenter('a,b c,d')).toBeNull();
    expect(polygonCenter('1,2,3 6,8')).toEqual({ x: 6, y: 8 });
    expect(polygonCenter('1,Infinity 6,8')).toEqual({ x: 6, y: 8 });
  });
});

describe('polygonDot', () => {
  it('puts the dot in the middle of the tile with a radius of a third of its width', () => {
    expect(polygonDot('0,0 30,0 30,30 0,30')).toEqual({ x: 15, y: 15, r: 10 });
  });

  it('never makes a dot smaller than 3', () => {
    expect(polygonDot('0,0 3,0 3,3 0,3')).toEqual({ x: 1.5, y: 1.5, r: 3 });
  });

  it('is null for nothing usable, and ignores a pair that is not two numbers', () => {
    expect(polygonDot(null)).toBeNull();
    expect(polygonDot('')).toBeNull();
    expect(polygonDot('a,b c,d')).toBeNull();
    expect(polygonDot('x,y 0,0 30,0 30,30 0,30')).toEqual({ x: 15, y: 15, r: 10 });
  });
});

describe('floor names', () => {
  it('label the ground G, floors above +n and floors below -n, and say them in words', () => {
    expect([floorLabel(0), floorLabel(3), floorLabel(-2)]).toEqual(['G', '+3', '-2']);
    expect([floorName(0), floorName(3), floorName(-2)]).toEqual(['Ground floor', 'Up 3', 'Down 2']);
  });
});
