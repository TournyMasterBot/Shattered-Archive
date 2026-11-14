// src/state/scope.ts
import type { State } from "@state/mapStore";

/**
 * Build the renderer/export scope from current selection.
 * Mirrors the logic used by the Open Renderer button.
 */
export function buildRenderScope(state: State) {
  const sel = state.selected ? state.doc.rooms[state.selected] : null;

  const worldId = sel?.category?.worldId ?? "all";
  const continentId = sel?.category?.continentId ?? "all";
  const areaId = sel?.category?.areaId ?? "all";

  return {
    worldId,
    continentId,
    areaId,
    vnum: sel?.vnum ?? null,
    cx: sel?.coords.cx ?? 0,
    cy: sel?.coords.cy ?? 0,
    vz: sel?.coords.vz ?? 0,
    level: typeof state.level === "number" ? state.level : 0,
  };
}
