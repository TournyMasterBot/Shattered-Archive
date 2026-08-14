import { BUILTIN_ROLES, countsTowardAlignment } from './roleCatalog.js';
import type { Player, RoleDef, RoomSettings, RoomState, TimelineEntry, WinResult } from './types.js';

const DEFAULT_SETTINGS: RoomSettings = {
  nightTimerSeconds: 180,
  discussTimerSeconds: 300,
  voteTimerSeconds: 180,
  firstNightNoKill: false,
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
  | { type: 'recordNightCheck'; checkerId: string; targetId: string; result: RoleDef['alignment'] }
  | { type: 'recordNightProtect'; protectorId: string; targetId: string }
  | { type: 'recordAssassinTarget'; targetId: string }
  | { type: 'advanceToNight' }
  | { type: 'resolveNight' }
  | { type: 'recordVoteTally'; tally: Record<string, number> }
  | { type: 'executePlayer'; targetId: string | null; note?: string };

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
