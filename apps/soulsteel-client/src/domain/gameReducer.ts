import { DEFAULT_COMMAND_DELAY_MS } from './aliasScript.js';
import { BUILTIN_ROLES, countsTowardAlignment } from './roleCatalog.js';
import type { BagEntry, Player, RoleDef, RoomSettings, RoomState, TimelineEntry, WinResult } from './types.js';

const DEFAULT_SETTINGS: RoomSettings = {
  nightTimerSeconds: 180,
  discussTimerSeconds: 300,
  voteTimerSeconds: 180,
  firstNightNoKill: false,
  darkshieldBlocksUmbraseer: false,
};

function genId(): string {
  return crypto.randomUUID();
}

export function createRoom(id: string, now: string): RoomState {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    dayNumber: 1,
    phase: 'day',
    players: [],
    roles: BUILTIN_ROLES.map((r) => ({ ...r })),
    timeline: [],
    settings: { ...DEFAULT_SETTINGS },
    bagContainerKeyword: 'sack',
    bags: [],
    masterBagKeyword: 'chest',
    commandDelayMs: DEFAULT_COMMAND_DELAY_MS,
  };
}

/**
 * Builds a fresh room for a "Play again" rematch: same players (ids kept, so nothing needs
 * re-typing), role catalog, settings, and bag plan (keyword/count/mapping/delay), but a new
 * `id`/`createdAt` and every match-progression field reset to a Day 1 start — the previous
 * match's role assignments are public knowledge by the time a match ends, so they aren't carried
 * forward. Deliberately does NOT touch the source room: that finished match is left exactly as
 * it was under its own id, so it keeps showing up as its own entry on the Landing page instead of
 * being silently overwritten by the rematch.
 */
export function rematchRoom(source: RoomState, newId: string, now: string): RoomState {
  return {
    ...source,
    id: newId,
    createdAt: now,
    updatedAt: now,
    dayNumber: 1,
    phase: 'day',
    timeline: [],
    players: source.players.map((p) => ({ ...p, roleId: null, alive: true, eliminatedAt: undefined })),
  };
}

export type RoomAction =
  | { type: 'addPlayer'; name: string }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'renamePlayer'; playerId: string; name: string }
  | { type: 'assignRole'; playerId: string; roleId: string | null }
  | { type: 'addCustomRole'; role: Omit<RoleDef, 'builtin'> }
  | { type: 'removeCustomRole'; roleId: string }
  | { type: 'updateSettings'; settings: Partial<RoomSettings> }
  | { type: 'recordNightCheck'; checkerId: string; targetId: string; result: RoleDef['alignment']; roleName: string }
  | { type: 'recordNightProtect'; protectorId: string; targetId: string }
  | { type: 'recordAssassinTarget'; targetId: string }
  | { type: 'advanceToNight' }
  | { type: 'resolveNight' }
  | { type: 'recordVoteTally'; tally: Record<string, number> }
  | { type: 'executePlayer'; targetId: string | null; note?: string }
  | { type: 'setPlayerAlive'; playerId: string; alive: boolean }
  | { type: 'setBagContainerKeyword'; keyword: string }
  | { type: 'setBagCount'; count: number }
  | { type: 'assignBagRole'; number: number; roleId: string | null }
  | { type: 'setMasterBagKeyword'; keyword: string }
  | { type: 'setCommandDelayMs'; delayMs: number };

/** Replaces any existing entry of the same `kind` for the given day — these are singular
 * per-night facts (the Herald correcting a mistake overwrites, not accumulates). */
function upsertNightFact(timeline: TimelineEntry[], entry: TimelineEntry): TimelineEntry[] {
  return [...timeline.filter((e) => !(e.kind === entry.kind && 'day' in e && e.day === entry.day)), entry];
}

export function reduceRoom(state: RoomState, action: RoomAction, now: string): RoomState {
  return { ...applyAction(state, action), updatedAt: now };
}

function applyAction(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'addPlayer': {
      const player: Player = { id: genId(), name: action.name, roleId: null, alive: true };
      return { ...state, players: [...state.players, player] };
    }

    case 'removePlayer':
      return { ...state, players: state.players.filter((p) => p.id !== action.playerId) };

    case 'renamePlayer':
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, name: action.name } : p)),
      };

    case 'setPlayerAlive': {
      const player = state.players.find((p) => p.id === action.playerId);
      // No-op on a redundant toggle — nothing changed, so no timeline entry either.
      if (!player || player.alive === action.alive) return state;

      const day = state.dayNumber;
      const phase = state.phase;

      const players = state.players.map((p) =>
        p.id === action.playerId
          ? action.alive
            ? { ...p, alive: true, eliminatedAt: undefined }
            : { ...p, alive: false, eliminatedAt: { day, phase, cause: 'other' as const } }
          : p,
      );

      const entry: TimelineEntry = {
        id: genId(),
        kind: 'admin-status-change',
        day,
        phase,
        targetId: action.playerId,
        alive: action.alive,
      };

      return { ...state, players, timeline: [...state.timeline, entry] };
    }

    case 'assignRole':
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, roleId: action.roleId } : p)),
      };

    case 'addCustomRole':
      return { ...state, roles: [...state.roles, { ...action.role, builtin: false }] };

    case 'removeCustomRole':
      return {
        ...state,
        roles: state.roles.filter((r) => r.id !== action.roleId),
        players: state.players.map((p) => (p.roleId === action.roleId ? { ...p, roleId: null } : p)),
        bags: state.bags.map((b) => (b.roleId === action.roleId ? { ...b, roleId: null } : b)),
      };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'recordNightCheck': {
      if (state.phase !== 'night') return state;
      const entry: TimelineEntry = {
        id: genId(),
        kind: 'night-check',
        day: state.dayNumber,
        checkerId: action.checkerId,
        targetId: action.targetId,
        result: action.result,
        roleName: action.roleName,
      };
      return { ...state, timeline: upsertNightFact(state.timeline, entry) };
    }

    case 'recordNightProtect': {
      if (state.phase !== 'night') return state;
      const entry: TimelineEntry = {
        id: genId(),
        kind: 'night-protect',
        day: state.dayNumber,
        protectorId: action.protectorId,
        targetId: action.targetId,
      };
      return { ...state, timeline: upsertNightFact(state.timeline, entry) };
    }

    case 'recordAssassinTarget': {
      if (state.phase !== 'night') return state;
      const entry: TimelineEntry = {
        id: genId(),
        kind: 'night-assassin-target',
        day: state.dayNumber,
        targetId: action.targetId,
      };
      return { ...state, timeline: upsertNightFact(state.timeline, entry) };
    }

    case 'advanceToNight':
      return state.phase === 'day' ? { ...state, phase: 'night' } : state;

    case 'resolveNight': {
      if (state.phase !== 'night') return state;
      const day = state.dayNumber;
      const targetEntry = state.timeline.find((e) => e.kind === 'night-assassin-target' && e.day === day) as
        | Extract<TimelineEntry, { kind: 'night-assassin-target' }>
        | undefined;
      const protectEntry = state.timeline.find((e) => e.kind === 'night-protect' && e.day === day) as
        | Extract<TimelineEntry, { kind: 'night-protect' }>
        | undefined;

      let players = state.players;
      let timeline = state.timeline;

      if (targetEntry) {
        const wasProtected = protectEntry?.targetId === targetEntry.targetId;
        timeline = [
          ...timeline,
          { id: genId(), kind: 'night-elimination', day, targetId: targetEntry.targetId, protected: wasProtected },
        ];
        if (!wasProtected) {
          players = players.map((p) =>
            p.id === targetEntry.targetId
              ? { ...p, alive: false, eliminatedAt: { day, phase: 'night' as const, cause: 'assassinated' as const } }
              : p,
          );
        }
      }

      return { ...state, players, timeline, phase: 'day', dayNumber: day + 1 };
    }

    case 'recordVoteTally': {
      if (state.phase !== 'day') return state;
      const entry: TimelineEntry = { id: genId(), kind: 'day-vote-tally', day: state.dayNumber, tally: action.tally };
      return { ...state, timeline: upsertNightFact(state.timeline, entry) };
    }

    case 'executePlayer': {
      if (state.phase !== 'day') return state;
      const day = state.dayNumber;
      const timeline: TimelineEntry[] = [
        ...state.timeline,
        { id: genId(), kind: 'day-execution', day, targetId: action.targetId, note: action.note },
      ];
      const players = action.targetId
        ? state.players.map((p) =>
            p.id === action.targetId
              ? { ...p, alive: false, eliminatedAt: { day, phase: 'day' as const, cause: 'executed' as const } }
              : p,
          )
        : state.players;
      return { ...state, players, timeline };
    }

    case 'setBagContainerKeyword':
      return { ...state, bagContainerKeyword: action.keyword };

    case 'setBagCount': {
      const count = Math.max(0, Math.floor(action.count));
      const existing = new Map(state.bags.map((b) => [b.number, b.roleId]));
      const bags: BagEntry[] = Array.from({ length: count }, (_, i) => {
        const number = i + 1;
        return { number, roleId: existing.get(number) ?? null };
      });
      return { ...state, bags };
    }

    case 'assignBagRole':
      return {
        ...state,
        bags: state.bags.map((b) => (b.number === action.number ? { ...b, roleId: action.roleId } : b)),
      };

    case 'setMasterBagKeyword':
      return { ...state, masterBagKeyword: action.keyword };

    case 'setCommandDelayMs':
      return { ...state, commandDelayMs: Math.max(0, Math.floor(action.delayMs) || 0) };

    default:
      return state;
  }
}

/**
 * Automatic win-condition read. Returns `null` until both alignments have been assigned at
 * least once (so an empty/mid-setup room never falsely reads as "Dark Knights win"), and again
 * whenever neither side currently satisfies the rules' victory condition. Custom/modifier roles
 * with `countsTowardWinTally: false` are excluded from both tallies — see the MVP plan's
 * Constraints: this is a dismissible suggestion, not an automatic game-ending action.
 */
export function computeWinResult(state: RoomState): WinResult {
  const hasAssassinRole = state.players.some((p) => countsTowardAlignment(state.roles, p.roleId, 'assassin'));
  const hasDarkKnightRole = state.players.some((p) => countsTowardAlignment(state.roles, p.roleId, 'darkKnight'));
  if (!hasAssassinRole || !hasDarkKnightRole) return null;

  const alive = state.players.filter((p) => p.alive);
  const aliveAssassins = alive.filter((p) => countsTowardAlignment(state.roles, p.roleId, 'assassin')).length;
  const aliveDarkKnights = alive.filter((p) => countsTowardAlignment(state.roles, p.roleId, 'darkKnight')).length;

  if (aliveAssassins === 0) return 'darkKnights';
  if (aliveAssassins >= aliveDarkKnights) return 'assassins';
  return null;
}
