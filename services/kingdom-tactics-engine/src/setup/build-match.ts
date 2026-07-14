import type { Army } from '../model/army.js';
import type { Board, Tile } from '../model/board.js';
import type { Coord, Side } from '../model/coord.js';
import type { GameModeConfig, GameModeId } from '../model/mode.js';
import type { MatchState } from '../model/match.js';
import type { Unit } from '../model/unit.js';
import type { EngineProviders } from '../engine/game-engine.js';
import type { RaceClassContext } from '../data/index.js';
import { alignmentForGod, moonSkyAt } from '../data/index.js';
import { createRng } from '../rng/index.js';

/**
 * Match-setup / deployment factory. `buildMatch` is the single source of deployment truth:
 * it turns per-side {@link ArmyRoster}s into a ready-to-play {@link MatchState} that the client
 * (local play) and, later, the server both reuse — replacing per-caller hand-built states.
 *
 * The engine stays pure/isomorphic: this module only reads data through the injected
 * {@link EngineProviders} and produces an immutable state; no DOM, no Node built-ins, no RNG
 * side effects (the seed is captured as `rngState`, exactly like the reducer expects).
 *
 * Scope: 2–4-side, individual-unit modes on a flat all-`Field` board (each side deploys on its
 * own board edge). Squadron modes (battle/siege) and authored terrain are still tracked in Part C
 * — `buildMatch` throws on `usesSquadrons` modes. The engine's turn order + rout victory are already
 * N-side, so FFA plays once deployed here.
 */

/**
 * One side's army as chosen units (the roster-level `Army` in `MatchState` holds only
 * side/name/budget — the actual picks live here until deployed into `MatchState.tokens`).
 */
export interface ArmyRoster {
  readonly side: Side;
  readonly name?: string;
  readonly picks: ReadonlyArray<{
    readonly raceKey: string;
    readonly classKey: string;
    /** Optional DSL deity (GodKey) — sets the unit's alignment, and thus which moon empowers it. */
    readonly god?: string;
  }>;
  /**
   * The army's affiliation (clan/kingdom/faction + god), used to gate CSR reclass picks.
   * Omitted for an unaffiliated army — then CSR classes are illegal (gated out by default).
   * Single-select per unit: one race + one class each; squadron blends are a future phase.
   */
  readonly context?: RaceClassContext;
}

/** Board terrain to deploy onto: a flat all-`Field` field, or an authored map from the profile. */
export type TerrainChoice = 'flat' | 'authored';

/** Total deployment cost of a roster = sum of each picked template's `cost`. */
export function rosterCost(roster: ArmyRoster, p: EngineProviders): number {
  let total = 0;
  for (const pick of roster.picks) {
    total += p.data.unitTemplate(pick.raceKey, pick.classKey).cost;
  }
  return total;
}

/**
 * Validate a roster against a mode's deployment budget and race/class legality. Every pick
 * must be a legal race×class under the army's affiliation `context` (raceRestrictions FORBID,
 * requiresRaces ALLOW, CSR affiliation gate); then `points` budgets cap the summed unit cost
 * and `units` budgets cap the pick count. Returns a reason on failure so callers (army builder,
 * `buildMatch`) can surface it. Throws only if a pick names an unknown template (via
 * `unitTemplate`), which is a programming/data error, not user input.
 */
export function validateRoster(
  roster: ArmyRoster,
  mode: GameModeConfig,
  p: EngineProviders,
): { ok: true } | { ok: false; reason: string } {
  // Legality first — an illegal race/class combo is more fundamental than budget, and this
  // runs for both budget kinds (single-select per unit).
  for (const pick of roster.picks) {
    if (!p.data.isLegalRaceClass(pick.raceKey, pick.classKey, roster.context)) {
      return {
        ok: false,
        reason: `${pick.raceKey} cannot be a ${pick.classKey} (race restriction or CSR affiliation gate)`,
      };
    }
  }
  if (mode.budgetKind === 'units') {
    if (roster.picks.length > mode.budget) {
      return {
        ok: false,
        reason: `roster has ${roster.picks.length} units but ${mode.name} allows ${mode.budget}`,
      };
    }
    return { ok: true };
  }
  const cost = rosterCost(roster, p);
  if (cost > mode.budget) {
    return {
      ok: false,
      reason: `roster costs ${cost} points but ${mode.name} budget is ${mode.budget}`,
    };
  }
  return { ok: true };
}

/**
 * Deploy rosters into an initial, in-progress `MatchState`.
 *
 * Board: a flat `mode.board`-sized grid of `Field` tiles (authored terrain ⇒ Part C).
 * Placement: each side deploys along its own edge — side 0 bottom, 1 top, 2 left, 3 right — spread
 * along that edge (rows/cols fill inward when a side has more units than the edge length). Ids are
 * deterministic (`s{side}-u{i}`) so the same rosters + seed reproduce an identical match.
 *
 * Supports 2–4-side, individual-unit modes; throws on squadron modes (Part C), >4 sides, or an
 * over-budget / out-of-range-side / unknown-template roster.
 */
export function buildMatch(
  modeId: GameModeId,
  rosters: readonly ArmyRoster[],
  p: EngineProviders,
  opts?: { seed?: number; terrain?: TerrainChoice; gameHour?: number },
): MatchState {
  const mode = p.modes.mode(modeId);
  if (mode.usesSquadrons) {
    throw new Error(`buildMatch: squadron modes are not yet supported ("${modeId}") — tracked in Part C`);
  }
  if (mode.sides < 2 || mode.sides > 4) {
    throw new Error(`buildMatch: only 2–4 sides are supported ("${modeId}" has sides=${mode.sides})`);
  }

  const { width, height } = mode.board;
  const seed = opts?.seed ?? 0;
  // The three moons run on their own clocks off an absolute game-hour; default 0 (all new/Empty).
  const gameHour = opts?.gameHour ?? 0;
  const tiles: Tile[][] =
    opts?.terrain === 'authored' ? generateTerrainTiles(mode, seed) : flatTiles(width, height);

  const tokens: Unit[] = [];
  const armies: Army[] = [];

  for (const roster of rosters) {
    if (roster.side < 0 || roster.side >= mode.sides) {
      throw new Error(`buildMatch: roster side ${roster.side} is out of range for ${modeId}`);
    }
    const valid = validateRoster(roster, mode, p);
    if (!valid.ok) throw new Error(`buildMatch: ${valid.reason}`);

    const coords = deploymentCoords(roster.picks.length, roster.side, { width, height });
    roster.picks.forEach((pick, i) => {
      const template = p.data.unitTemplate(pick.raceKey, pick.classKey);
      tokens.push({
        kind: 'unit',
        instanceId: `s${roster.side}-u${i}`,
        templateId: template.id,
        side: roster.side,
        pos: coords[i],
        hp: template.maxHp,
        statuses: [],
        hasMoved: false,
        hasActed: false,
        stance: 'normal',
        ...(pick.god ? { god: pick.god, alignment: alignmentForGod(pick.god) } : {}),
      });
    });

    armies.push({ side: roster.side, name: roster.name, budget: mode.budget });
  }

  // Guarantee every deployed unit stands on passable open ground (authored terrain never
  // blocks a starting tile, so a match is always playable regardless of the generated map).
  for (const t of tokens) tiles[t.pos.y][t.pos.x] = { terrain: 'Field', feature: null };

  const board: Board = { width, height, tiles };
  return {
    modeId,
    board,
    armies,
    tokens,
    turn: 1,
    activeSide: 0,
    moon: { gameHour, sky: moonSkyAt(gameHour) },
    rngState: createRng(seed).state(),
    status: 'in-progress',
  };
}

/** A flat `width × height` field of open `Field` tiles (no features). */
function flatTiles(width: number, height: number): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return tiles;
}

/**
 * Deterministically scatter authored terrain over the board interior from `mode.terrainProfile`,
 * keeping a 2-tile margin around every edge clear so deployment zones stay open. `arena` sprinkles
 * Forest (cover + blocks LoS); `open-field` adds Forest plus a little impassable Water; anything
 * else stays flat. Seeded, so a given (mode, seed) reproduces the same map. Terrain effects flow
 * through the movement / line-of-sight / defense rules, so the map is tactically meaningful.
 */
function generateTerrainTiles(mode: GameModeConfig, seed: number): Tile[][] {
  const { width, height } = mode.board;
  const tiles = flatTiles(width, height);
  const profile = mode.terrainProfile;
  if (profile !== 'arena' && profile !== 'open-field') return tiles;

  const margin = 2;
  const interior: { x: number; y: number }[] = [];
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) interior.push({ x, y });
  }
  if (interior.length === 0) return tiles;

  // Derive a terrain RNG offset from the match seed so maps vary but stay reproducible.
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const shuffled = [...interior].sort(() => rng.next() - 0.5);

  const forestCount = Math.max(1, Math.floor(interior.length * 0.12));
  const waterCount = profile === 'open-field' ? Math.floor(interior.length * 0.05) : 0;

  let idx = 0;
  for (let i = 0; i < forestCount && idx < shuffled.length; i++, idx++) {
    const c = shuffled[idx];
    tiles[c.y][c.x] = { terrain: 'Forest', feature: null };
  }
  for (let i = 0; i < waterCount && idx < shuffled.length; i++, idx++) {
    const c = shuffled[idx];
    tiles[c.y][c.x] = { terrain: 'Water', feature: null };
  }
  return tiles;
}

/**
 * Deterministic starting tiles for one side's `count` units. Each side owns a board edge —
 * 0 bottom, 1 top, 2 left, 3 right — and spreads its units evenly along that edge (centered,
 * collision-free for up to the edge length per line); overflow lines step inward from the edge.
 */
function deploymentCoords(
  count: number,
  side: Side,
  dims: { readonly width: number; readonly height: number },
): Coord[] {
  const coords: Coord[] = [];
  // Sides 0/1 line up along the width (a row); sides 2/3 along the height (a column).
  const horizontal = side === 0 || side === 1;
  const lineLen = horizontal ? dims.width : dims.height;
  let placed = 0;
  let lineIdx = 0;
  while (placed < count) {
    const inLine = Math.min(lineLen, count - placed);
    for (let k = 0; k < inLine; k++) {
      const along = Math.floor(((k + 1) * lineLen) / (inLine + 1));
      coords.push(edgeCoord(side, lineIdx, along, dims));
    }
    placed += inLine;
    lineIdx++;
  }
  return coords;
}

/** Map an (edge, inward line index, position-along-edge) to a board coordinate. */
function edgeCoord(
  side: Side,
  lineIdx: number,
  along: number,
  dims: { readonly width: number; readonly height: number },
): Coord {
  switch (side) {
    case 0:
      return { x: along, y: dims.height - 1 - lineIdx }; // bottom edge, stepping up
    case 1:
      return { x: along, y: lineIdx }; // top edge, stepping down
    case 2:
      return { x: lineIdx, y: along }; // left edge, stepping right
    default:
      return { x: dims.width - 1 - lineIdx, y: along }; // right edge (side 3), stepping left
  }
}
