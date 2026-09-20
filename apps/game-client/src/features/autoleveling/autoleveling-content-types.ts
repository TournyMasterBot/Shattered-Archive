// apps/game-client/src/features/autoleveling/autoleveling-content-types.ts

/**
 * Auto-leveling area content — the DTO served by the DSL C# service at
 * `GET /maps/autoleveling/areas` (proxied by web-server, cached client-side in
 * IndexedDB by `autoleveling-content.ts`). Mirrors
 * `Server.Dsl/Models/Autopilot.cs` — keep the two in sync.
 *
 * Buff checklists and per-class fight commands are NOT part of this — they are a
 * client-side overlay the user builds in the wizard's Combat step and stores in
 * `autoleveling-user-data.ts`.
 */

/**
 * Lightweight index row for the wizard's Area picker — served by
 * `GET /maps/autoleveling/areas`. The full route + targets come from the
 * per-area detail call.
 */
export interface AutoPilotAreaSummary {
  slug: string;
  areaName: string;
  continent: string;
  levelRange: [number, number];
  isExcellentLevelingArea: boolean;
  /** Route step count, for a "N steps" badge. */
  stepCount: number;
  /** Recommended-target count the detail call will return. */
  targetCount: number;
}

/** A mob the wizard offers as a kill target along an area's route. */
export interface AutoPilotTarget {
  /** The line shown when you walk into the room (encounter detection matches this). */
  lookName: string;
  /** Keyword used to engage — `kill {engageName}`. */
  engageName: string;
  /** Mob level, when known (from the Beastiary). */
  level?: number;
}

/** One curated leveling area. */
export interface AutoPilotArea {
  /** Stable kebab-case id derived from the area name, e.g. "centaur-village". */
  slug: string;
  /** Display name, e.g. "Centaur Village". */
  areaName: string;
  /** Continent the area file lives under, e.g. "Arkania". */
  continent: string;
  /** DSL area class name (IArea.AreaID). */
  areaId: string;

  /** [min, max] recommended character level. */
  levelRange: [number, number];

  /** Room the route assumes you start in ("" when the source is undefined). */
  startRoom: string;
  /** Recall → area-entrance speedwalk, semicolon-separated (may be ""). */
  speedwalkToStart: string;
  /** One-off setup commands to run once on arrival. */
  requiredActions: string[];
  /** The round route — one command per entry (already split, e.g. "open north","n"). */
  dirs: string[];

  /** Free-text guidance from the area file's Notes. */
  notes: string;
  /** Area is flagged IsExcellentLevelingArea in the DSL source. */
  isExcellentLevelingArea: boolean;

  /** Mobs worth killing along the route. May be empty — then the wizard asks the user. */
  recommendedTargets: AutoPilotTarget[];
}

export interface AutoPilotAreaIndexResponse {
  areas: AutoPilotAreaSummary[];
}

/* ----------------------------- class catalog -----------------------------
 * Served by `GET /maps/autoleveling/classes` (proxied by web-server, cached
 * client-side by `autoleveling-classes.ts`). Mirrors the C# `AutoPilotClass` /
 * `AutoPilotAbility` in `Server.Dsl/Models/Autopilot.cs`.
 *
 * `groups` are the semantic ability-group names (Protective, Attack,
 * Maladictions, Detection, …) — the DSL data does not populate
 * IAbility.AbilityUsage / Duration / Group, so the C# side projects the
 * IAbilityGroup taxonomy instead. Per-class Basics/Default groups and raw
 * help-file text are stripped server-side to keep the payload small.
 * --------------------------------------------------------------------- */

/** One skill / spell / song a class learns, with the level it becomes available. */
export interface AutoPilotAbility {
  name: string;
  type: 'skill' | 'spell' | 'song';
  /** Character level the ability is learned at. */
  level: number;
  /** Semantic ability-group names, e.g. ["Protective"] or ["Attack","Maladictions"]. */
  groups: string[];
}

/** One playable DSL class and every ability it learns. */
export interface AutoPilotClass {
  name: string;
  /** The `Constants.MortalClass` enum value. */
  mortalClass: number;
  /** True for a reclass (advanced), false for a base class. */
  isReclass: boolean;
  /** Base class this one groups under, e.g. "Warrior". */
  classGroup: string;
  abilities: AutoPilotAbility[];
}

export interface AutoPilotClassCatalogResponse {
  classes: AutoPilotClass[];
}

/* --------------------------- normalizers ---------------------------------
 * The C# service serializes with DefaultValueHandling.Ignore, so `false` bools,
 * `0` ints and empty strings are OMITTED from the JSON. Coerce rather than
 * type-guard: only the identity (slug + name + level range; + a route for the
 * detail shape) is truly required.
 * --------------------------------------------------------------------- */

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}
function levelRange(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [a, b] = v;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return [a, b];
}

/** Coerce a raw index row, or null if it lacks an identity. */
export function normalizeAreaSummary(x: unknown): AutoPilotAreaSummary | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  const lr = levelRange(a.levelRange);
  if (!str(a.slug) || !str(a.areaName) || !lr) return null;
  return {
    slug: str(a.slug),
    areaName: str(a.areaName),
    continent: str(a.continent),
    levelRange: lr,
    isExcellentLevelingArea: !!a.isExcellentLevelingArea,
    stepCount: typeof a.stepCount === 'number' ? a.stepCount : 0,
    targetCount: typeof a.targetCount === 'number' ? a.targetCount : 0,
  };
}

const ABILITY_TYPES = new Set(['skill', 'spell', 'song']);

/** A per-class group (e.g. `ClericDefault`, or the mislabelled `IllusionistDefault`) is never a useful rotation tag. */
function semanticGroups(v: unknown): string[] {
  return strArr(v).filter((g) => !/(Basics|Default)$/i.test(g.trim()) && g.trim().toLowerCase() !== 'none');
}

/** Coerce a raw ability row, or null if it has no name. */
export function normalizeAbility(x: unknown): AutoPilotAbility | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  const name = str(a.name);
  if (!name) return null;
  const type = typeof a.type === 'string' && ABILITY_TYPES.has(a.type) ? (a.type as AutoPilotAbility['type']) : 'skill';
  return {
    name,
    type,
    level: typeof a.level === 'number' && Number.isFinite(a.level) ? Math.max(0, Math.floor(a.level)) : 0,
    groups: semanticGroups(a.groups),
  };
}

/** Coerce a raw class row, or null if it has no name. */
export function normalizeClass(x: unknown): AutoPilotClass | null {
  if (!x || typeof x !== 'object') return null;
  const c = x as Record<string, unknown>;
  const name = str(c.name);
  if (!name) return null;
  return {
    name,
    mortalClass: typeof c.mortalClass === 'number' && Number.isFinite(c.mortalClass) ? c.mortalClass : 0,
    isReclass: !!c.isReclass,
    classGroup: str(c.classGroup),
    abilities: Array.isArray(c.abilities)
      ? c.abilities.map(normalizeAbility).filter((a): a is AutoPilotAbility => a !== null)
      : [],
  };
}

/** Coerce a raw detail object, or null if it lacks an identity or a route. */
export function normalizeArea(x: unknown): AutoPilotArea | null {
  if (!x || typeof x !== 'object') return null;
  const a = x as Record<string, unknown>;
  const lr = levelRange(a.levelRange);
  const dirs = strArr(a.dirs);
  if (!str(a.slug) || !str(a.areaName) || !lr || dirs.length === 0) return null;
  return {
    slug: str(a.slug),
    areaName: str(a.areaName),
    continent: str(a.continent),
    areaId: str(a.areaId),
    levelRange: lr,
    startRoom: str(a.startRoom),
    speedwalkToStart: str(a.speedwalkToStart),
    requiredActions: strArr(a.requiredActions),
    dirs,
    notes: str(a.notes),
    isExcellentLevelingArea: !!a.isExcellentLevelingArea,
    recommendedTargets: Array.isArray(a.recommendedTargets)
      ? a.recommendedTargets
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map((t) => ({
            lookName: str(t.lookName),
            engageName: str(t.engageName),
            ...(typeof t.level === 'number' ? { level: t.level } : {}),
          }))
          .filter((t) => t.lookName.length > 0 && t.engageName.length > 0)
      : [],
  };
}
