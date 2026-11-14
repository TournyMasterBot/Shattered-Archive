/**
 * Fog of war: what a player has not explored is not drawn. `applyFog` takes a map file (one area's, usually) and the ids of the rooms the player
 * may see, and returns a copy holding only those rooms. An exit that leaves a visible room towards a room that is not visible becomes an unknown
 * stub (the renderer's `?`), so the unexplored neighbour is neither shown nor named nor clickable. An exit towards a visible room elsewhere (another
 * area) stays as it was. Rooms, titles and links of unseen rooms are gone from the copy. Pure; the input is not changed.
 */

import { cloneJson, type MapFile } from './schema.js';

export function applyFog(map: MapFile, visible: ReadonlySet<string>): MapFile {
  const out = cloneJson(map);
  const kept = new Set<string>();
  for (const continent of out.continents) {
    for (const area of continent.areas) {
      for (const subzone of area.subzones) {
        subzone.rooms = subzone.rooms.filter((room) => visible.has(room.id));
        for (const room of subzone.rooms) kept.add(room.id);
      }
      area.subzones = area.subzones.filter((subzone) => subzone.rooms.length > 0);
    }
  }
  out.links = out.links
    .filter((link) => kept.has(link.from))
    .map((link) => {
      const rest = { ...link };
      delete rest.conflictTo; // it may name rooms the player has not seen
      if (link.to === null || visible.has(link.to)) return rest;
      return { ...rest, to: null, state: 'unknown-target' as const, confidence: 0, offPage: false, reverse: false };
    });
  return out;
}
