/**
 * A layout spec derived from the map itself, for a continent whose owner has not written one.
 *
 * The owner's own geography (`layout/arkane.json`) always wins. For every other continent the cross-area links already say where areas lie: an exit
 * east out of area A into area B puts B east of A. This walks the area graph from the biggest connected area, outward, strongest connection first, and
 * writes one relation per area (placed east/west/... of the area it was first reached from). The result is a `LayoutSpec` for `layoutContinent`, so the
 * same no-overlap packing, bearing-aware placement and room-count sizing apply. Areas no link connects are left out: they keep their place near the
 * source position.
 *
 * Pure and deterministic: ties are broken by id.
 */
import type { Compass, LayoutSpec, LayoutRelation } from './continentLayout.js';
import type { Direction, MapFile } from './schema.js';

type Dir8 = Exclude<Compass, 'NNE' | 'ENE' | 'ESE' | 'SSE' | 'SSW' | 'WSW' | 'WNW' | 'NNW'>;

const OPPOSITE: Readonly<Record<Dir8, Dir8>> = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };
const ORDER: readonly Dir8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The compass direction an exit points; up and down have none on the plane, so they count as north and south (a stair is a way to somewhere else). */
function compassOf(dir: Direction): Dir8 {
  if (dir === 'U') return 'N';
  if (dir === 'D') return 'S';
  return dir;
}

export interface AutoSpecOptions {
  gap?: number;
  sizeBy?: 'extent' | 'rooms';
  cellsPerRoom?: number;
  /**
   * An owner-written spec to build on: its relations are kept exactly (the owner's geography wins) and the areas it does not place are related by their
   * links, outward from the areas it does place.
   */
  base?: LayoutSpec;
}

/** The spec for one continent, or `null` when the continent is not in the map or no link joins two of its areas (and there is no base to return). */
export function autoSpec(map: MapFile, continentId: string, options: AutoSpecOptions = {}): LayoutSpec | null {
  const continent = map.continents.find((c) => c.id === continentId);
  if (!continent) return null;
  const areaOf = new Map<string, string>();
  const rooms = new Map<string, number>();
  for (const area of continent.areas)
    for (const subzone of area.subzones)
      for (const room of subzone.rooms) {
        areaOf.set(room.id, area.id);
        rooms.set(area.id, (rooms.get(area.id) ?? 0) + 1);
      }

  // votes[a][b][dir]: exits out of a into b, pointing dir; and the reverse (b into a, pointing opposite) counts for the same pair
  const votes = new Map<string, Map<string, Map<Dir8, number>>>();
  const vote = (a: string, b: string, dir: Dir8): void => {
    const row = votes.get(a) ?? votes.set(a, new Map()).get(a)!;
    const cell = row.get(b) ?? row.set(b, new Map()).get(b)!;
    cell.set(dir, (cell.get(dir) ?? 0) + 1);
  };
  for (const link of map.links) {
    if (link.to === null) continue;
    const a = areaOf.get(link.from);
    const b = areaOf.get(link.to);
    if (a === undefined || b === undefined || a === b) continue;
    const dir = compassOf(link.dir);
    vote(a, b, dir);
    vote(b, a, OPPOSITE[dir]);
  }
  const base = options.base;
  const known = new Set(areaOf.values());
  const settings = (): Pick<LayoutSpec, 'gap' | 'sizeBy'> & { cellsPerRoom?: number } => ({
    gap: options.gap ?? base?.gap ?? 1,
    sizeBy: options.sizeBy ?? base?.sizeBy ?? 'rooms',
    ...(options.cellsPerRoom !== undefined ? { cellsPerRoom: options.cellsPerRoom } : base?.cellsPerRoom !== undefined ? { cellsPerRoom: base.cellsPerRoom } : {}),
  });
  if (votes.size === 0) return base ? { ...base, ...settings() } : null;

  const strength = (a: string, b: string): number => [...(votes.get(a) as Map<string, Map<Dir8, number>>).get(b)!.values()].reduce((s, n) => s + n, 0);
  const bearing = (a: string, b: string): Dir8 => {
    const cell = (votes.get(a) as Map<string, Map<Dir8, number>>).get(b) as Map<Dir8, number>;
    return [...ORDER].sort((x, y) => (cell.get(y) ?? 0) - (cell.get(x) ?? 0) || ORDER.indexOf(x) - ORDER.indexOf(y))[0];
  };

  // the biggest connected area is the centre: it keeps its source place (an owner's spec names its own centre)
  const center = base && known.has(base.center) ? base.center : [...votes.keys()].sort((a, b) => (rooms.get(b) as number) - (rooms.get(a) as number) || a.localeCompare(b))[0];
  const seen = new Set<string>([center]);
  const relations: LayoutRelation[] = [];
  const queue = [center];
  // the owner's relations first, kept as they are; the areas they place are where the walk outward starts
  for (const relation of base && known.has(base.center) ? base.relations : []) {
    if (!known.has(relation.area) || !known.has(relation.of) || seen.has(relation.area)) continue;
    seen.add(relation.area);
    relations.push(relation);
    queue.push(relation.area);
  }
  while (queue.length > 0) {
    const from = queue.shift() as string;
    const reach = votes.get(from);
    if (reach === undefined) continue;
    const next = [...reach.keys()].filter((b) => !seen.has(b)).sort((x, y) => strength(from, y) - strength(from, x) || x.localeCompare(y));
    for (const area of next) {
      seen.add(area);
      relations.push({ area, of: from, dir: bearing(from, area) });
      queue.push(area);
    }
  }
  return { center, relations, ...settings() };
}
