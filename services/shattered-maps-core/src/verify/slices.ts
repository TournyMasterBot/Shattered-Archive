import type { Area, Continent, Link, MapFile } from '../schema.js';

/**
 * Joins per-area slices (the way the importer and the publisher write a layer: one valid map file per area) into one map file. A continent
 * that appears in several slices becomes one continent holding all those areas; an area or a link that appears twice (the same id) is kept
 * once, the first time it is met. Pure: the inputs are not changed.
 */
export function mergeSlices(slices: readonly MapFile[], generatedAt?: string): MapFile {
  const continents = new Map<string, Continent>();
  const areaIds = new Set<string>();
  const links = new Map<string, Link>();
  for (const slice of slices) {
    for (const continent of slice.continents) {
      let into = continents.get(continent.id);
      if (into === undefined) {
        into = { id: continent.id, name: continent.name, areas: [] };
        continents.set(continent.id, into);
      }
      for (const area of continent.areas) {
        if (areaIds.has(area.id)) continue;
        areaIds.add(area.id);
        into.areas.push(area as Area);
      }
    }
    for (const link of slice.links) if (!links.has(link.id)) links.set(link.id, link);
  }
  const map: MapFile = { version: 1, continents: [...continents.values()], links: [...links.values()] };
  if (generatedAt !== undefined) map.generatedAt = generatedAt;
  return map;
}
