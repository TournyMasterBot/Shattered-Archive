// apps/game-client/src/features/worldmap/viewport.ts
//
// The geometry of the map window's pan and zoom, with no DOM and no React. A View says where the picture's own top-left corner is inside the
// viewport box (x, y, in box pixels) and how much it is magnified (scale): a point (px, py) of the picture is shown at (x + px * scale,
// y + py * scale). Every function returns a new View and keeps every number finite and the scale inside [MIN_SCALE, MAX_SCALE].

export interface View {
  scale: number;
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Small enough to fit a whole big area (a floor can be thousands of pixels across) into a small window. */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 6;
/** The life-size view with the picture's corner at the box's corner. */
export const IDENTITY: View = { scale: 1, x: 0, y: 0 };

const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, finite(scale, 1)));
}

/** Pan by a distance in box pixels. */
export function panBy(view: View, dx: number, dy: number): View {
  return { scale: view.scale, x: view.x + finite(dx, 0), y: view.y + finite(dy, 0) };
}

/** Magnify by `factor` around the box point (px, py): the picture point under it stays under it. A factor that would leave the limits stops at them. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clampScale(view.scale * finite(factor, 1));
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** A rectangle of the picture, in the picture's own pixels. */
export interface Rect extends Size, Point {}

/**
 * The view that shows all of the picture rectangle `content` inside `box` with `pad` pixels around it. Never magnifies past `maxScale` (a
 * one-room area is not blown up). A rectangle that does not start at the picture's corner (the rooms of one floor inside a frame that holds
 * every floor) is centred, not the corner.
 */
export function fit(content: Rect, box: Size, pad = 16, maxScale = 1.5): View {
  if (!(content.width > 0) || !(content.height > 0) || !(box.width > 0) || !(box.height > 0)) return IDENTITY;
  const scale = clampScale(
    Math.min(maxScale, (box.width - 2 * pad) / content.width, (box.height - 2 * pad) / content.height),
  );
  return {
    scale,
    x: (box.width - content.width * scale) / 2 - content.x * scale,
    y: (box.height - content.height * scale) / 2 - content.y * scale,
  };
}

/** Keep the scale and put the picture point `target` in the middle of the box. */
export function centerOn(view: View, target: Point, box: Size): View {
  return { scale: view.scale, x: box.width / 2 - target.x * view.scale, y: box.height / 2 - target.y * view.scale };
}

export interface PlaceInput {
  /** The picture is of another area (or drawn another way) than before: the old position means nothing. */
  areaChanged: boolean;
  current: View;
  content: Rect;
  box: Size;
  /** The picture point to look at (the player's room, or the room a neighbouring-area click was for), when it is on this floor. */
  target: Point | null;
  /** Move to the target even though the area did not change (following the player, or a click that asked for it). */
  centerOnTarget: boolean;
}

/**
 * Where the picture goes after it was drawn again. A new area is shown life-size around its target room, or fitted when there is none;
 * the same area keeps the view the person made, unless they are following the player, who is then brought back to the middle.
 */
export function placeView(input: PlaceInput): View {
  if (input.areaChanged) {
    return input.target ? centerOn(IDENTITY, input.target, input.box) : fit(input.content, input.box);
  }
  if (input.target && input.centerOnTarget) return centerOn(input.current, input.target, input.box);
  return input.current;
}

/** The middle of an SVG polygon's points attribute ("x,y x,y ..."), or null when it holds no usable point. */
export function polygonCenter(points: string | null | undefined): Point | null {
  if (!points) return null;
  const pairs = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, p) => ({ x: acc.x + p[0], y: acc.y + p[1] }), { x: 0, y: 0 });
  return { x: sum.x / pairs.length, y: sum.y / pairs.length };
}

/** Where to put a dot on an SVG polygon's tile: its middle, and a radius of about a third of the tile's width. Null when the points hold no usable point. */
export function polygonDot(points: string | null | undefined): { x: number; y: number; r: number } | null {
  const centre = polygonCenter(points);
  if (!centre) return null;
  const xs = (points as string)
    .trim()
    .split(/\s+/)
    .map((pair) => Number(pair.split(',')[0]))
    .filter(Number.isFinite);
  return { ...centre, r: Math.max(3, (Math.max(...xs) - Math.min(...xs)) / 3) };
}

/** The shortest label of a floor: G for the ground, +2 above it, -1 below it. */
export function floorLabel(z: number): string {
  return z === 0 ? 'G' : z > 0 ? `+${z}` : String(z);
}

/** The same in words, for tooltips and the status line. */
export function floorName(z: number): string {
  return z === 0 ? 'Ground floor' : z > 0 ? `Up ${z}` : `Down ${-z}`;
}
