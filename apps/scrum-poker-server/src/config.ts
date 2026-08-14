import path from 'node:path';

/** Runtime knobs for scrum-poker-server, all with defaults that work with no env at all. */
export interface ScrumPokerConfig {
  /** Directory holding `rooms.json`. A docker named volume in the deployed stack. */
  readonly dataDir: string;
  /** A participant idle longer than this drops off the roster (default 1 hour). */
  readonly idleTimeoutMs: number;
  /** A room untouched for longer than this is deleted outright (default 30 days). */
  readonly roomTtlMs: number;
  /**
   * How long a room NOBODY EVER JOINED survives (default 24h).
   *
   * `POST /api/scrum/rooms` is unauthenticated by design, so without this a drive-by script
   * could mint `maxRooms` rooms and every subsequent creation would 503 for a month. This
   * reclaims exactly the abandoned ones: a room is "never joined" only while its
   * `lastActiveAt` still equals its `createdAt`, which stops being true the instant the first
   * person joins — so a real team's room is never caught by it, even if everyone has since
   * idled out of the roster.
   */
  readonly emptyRoomTtlMs: number;
  /** How often the sweeper runs. */
  readonly sweepIntervalMs: number;
  /**
   * Backstop on stored rooms (default 10,000) — a ceiling, not a quota.
   *
   * Real use is nowhere near it: a team makes a handful of rooms a week and unjoined ones are
   * reclaimed within `emptyRoomTtlMs`. What it actually bounds is the persist path, which
   * rewrites the WHOLE room file on every flush — so total room count, not active room count,
   * sets the cost of a single vote. At the default that worst case is a few MB per flush,
   * which is fine; raising it much further means changing how persistence works (per-room
   * files or an append log) rather than just moving this number.
   *
   * Abuse is better answered at the edge — nginx rate-limits room creation per IP — because
   * this cap can only refuse EVERYONE once it is reached.
   */
  readonly maxRooms: number;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function getScrumPokerConfig(): ScrumPokerConfig {
  return {
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? './data'),
    idleTimeoutMs: readInt('SCRUM_IDLE_TIMEOUT_MS', HOUR),
    roomTtlMs: readInt('SCRUM_ROOM_TTL_MS', 30 * DAY),
    emptyRoomTtlMs: readInt('SCRUM_EMPTY_ROOM_TTL_MS', DAY),
    sweepIntervalMs: readInt('SCRUM_SWEEP_INTERVAL_MS', 60_000),
    maxRooms: readInt('SCRUM_MAX_ROOMS', 10_000),
  };
}
