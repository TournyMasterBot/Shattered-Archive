import { TerrainKind } from "../types";

// Dark-mode friendly, muted hues with clear separation.
export const TERRAIN_FILL: Record<TerrainKind, string> = {
  [TerrainKind.Unknown]: "#0f0f0fff",
  [TerrainKind.Inside]: "#6F6BA8", // muted indigo
  [TerrainKind.City]: "#7E8796", // steel
  [TerrainKind.Desert]: "#C8A15A", // soft sand
  [TerrainKind.VeryIcy]: "#6FB6D6", // icy cyan
  [TerrainKind.Hills]: "#7BA76C", // sage green
  [TerrainKind.Forest]: "#2E6B4F", // deep pine
  [TerrainKind.Fields]: "#9FC25E", // meadow
  [TerrainKind.Tundra]: "#77B5A9", // pale teal
  [TerrainKind.Ocean]: "#151B54",
  [TerrainKind.Swim]: "#0041C2",
  [TerrainKind.Underwater]: "#0C2766",
  [TerrainKind.Underground]: "#4b3300"
};

// Stable order for UI (legend, dropdowns, etc.)
export const TERRAIN_ORDER: TerrainKind[] = [
  TerrainKind.Unknown,
  TerrainKind.Inside,
  TerrainKind.City,
  TerrainKind.Desert,
  TerrainKind.VeryIcy,
  TerrainKind.Hills,
  TerrainKind.Forest,
  TerrainKind.Fields,
  TerrainKind.Tundra,
  TerrainKind.Ocean,
  TerrainKind.Swim,
  TerrainKind.Underwater,
  TerrainKind.Underground
];
