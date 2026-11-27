/**
 * Typed events from the game-server jsonl log.
 *
 * Each log line is one JSON record: `{ type, subtype, level, timestamp, payload }`. The records Copilot reads:
 *
 *   game:remote-server:raw      payload { type:'raw', data }      text from the MUD, ANSI included, NOT line-aligned
 *   game:remote-server:gmcp     payload { type:'gmcp', data }     data is `<package> { json }` (login_data, room_data, char_data, tick, ...)
 *   game:client:input           payload '{"type":"data","data":"<command>"}'  (a JSON string)
 *   game:remote-server:connect  payload { host, port }
 *   game:server:connection:client-closed  payload { code, reason }
 *
 * Everything is parsed defensively: a bad line never throws, it is reported with a reason so the caller can count it.
 */

/** Longest line (in characters) that is parsed; a longer one is skipped and counted, never parsed. */
export const MAX_LOG_LINE_CHARS = 1_000_000;

export interface Vitals {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  move: number;
  maxMove: number;
}

export type LogEvent =
  | { kind: 'raw'; at: number; data: string }
  | { kind: 'room'; at: number; room: string; sector: string; exits: string[] }
  | { kind: 'char'; at: number; vitals: Vitals; inFight?: boolean; gold?: number; silver?: number; tnl?: number }
  /** `name` is a REAL character name. Consume it at once (character registry) and never log or store it elsewhere. */
  | { kind: 'login'; at: number; name: string; level?: number }
  | { kind: 'tick'; at: number; time: string }
  | { kind: 'input'; at: number; data: string }
  /** `target` is where the game-server connected, as `host:port` (public game addresses, never a person's data); absent when the record names none. */
  | { kind: 'connect'; at: number; target?: string }
  | { kind: 'closed'; at: number; code?: number };

export type SkipReason = 'malformed' | 'oversize' | 'ignored';

export type ParsedLine = { ok: true; event: LogEvent } | { ok: false; reason: SkipReason };

const SKIP_MALFORMED: ParsedLine = { ok: false, reason: 'malformed' };
const SKIP_IGNORED: ParsedLine = { ok: false, reason: 'ignored' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Split a GMCP payload `name { json }` into the package name and its parsed body (undefined when the body is not JSON). */
function splitGmcp(data: string): { name: string; body: unknown } {
  const open = data.indexOf('{');
  const space = data.indexOf(' ');
  const name = (space < 0 ? data : data.slice(0, space)).trim();
  if (open < 0) return { name, body: undefined };
  try {
    return { name, body: JSON.parse(data.slice(open)) as unknown };
  } catch {
    return { name, body: undefined };
  }
}

function parseGmcp(at: number, data: string): ParsedLine {
  const { name, body } = splitGmcp(data);
  if (name !== 'login_data' && name !== 'room_data' && name !== 'char_data' && name !== 'tick') return SKIP_IGNORED;
  if (!isRecord(body)) return SKIP_MALFORMED;

  if (name === 'tick') {
    return typeof body.time === 'string' ? { ok: true, event: { kind: 'tick', at, time: body.time } } : SKIP_MALFORMED;
  }

  if (name === 'login_data') {
    if (typeof body.name !== 'string' || body.name.trim() === '') return SKIP_MALFORMED;
    const event: LogEvent = { kind: 'login', at, name: body.name.trim() };
    const level = finite(body.level);
    if (level !== undefined) event.level = level;
    return { ok: true, event };
  }

  if (name === 'room_data') {
    if (typeof body.room !== 'string' || body.room.trim() === '') return SKIP_MALFORMED;
    const exits = Array.isArray(body.exits) ? body.exits.filter((e): e is string => typeof e === 'string') : [];
    return {
      ok: true,
      event: { kind: 'room', at, room: body.room, sector: typeof body.sector === 'string' ? body.sector : '', exits },
    };
  }

  // char_data
  const hp = finite(body.hp);
  const maxHp = finite(body.max_hp);
  const mana = finite(body.mana);
  const maxMana = finite(body.max_mana);
  const move = finite(body.move);
  const maxMove = finite(body.max_move);
  if (
    hp === undefined ||
    maxHp === undefined ||
    mana === undefined ||
    maxMana === undefined ||
    move === undefined ||
    maxMove === undefined
  ) {
    return SKIP_MALFORMED;
  }
  const event: LogEvent = { kind: 'char', at, vitals: { hp, maxHp, mana, maxMana, move, maxMove } };
  if (typeof body.is_fighting === 'boolean') event.inFight = body.is_fighting;
  const gold = finite(body.gold);
  const silver = finite(body.silver);
  const tnl = finite(body.tnl);
  if (gold !== undefined) event.gold = gold;
  if (silver !== undefined) event.silver = silver;
  if (tnl !== undefined) event.tnl = tnl;
  return { ok: true, event };
}

function parseInput(at: number, payload: unknown): ParsedLine {
  let body: unknown = payload;
  if (typeof payload === 'string') {
    try {
      body = JSON.parse(payload) as unknown;
    } catch {
      return SKIP_MALFORMED;
    }
  }
  if (!isRecord(body)) return SKIP_MALFORMED;
  // `{"type":"connect",...}` and other control messages are not commands
  if (body.type !== 'data') return SKIP_IGNORED;
  return typeof body.data === 'string' ? { ok: true, event: { kind: 'input', at, data: body.data } } : SKIP_MALFORMED;
}

/** Parse one jsonl line and say why it was skipped when it was. Never throws. */
export function parseLogRecord(line: string): ParsedLine {
  if (line.length > MAX_LOG_LINE_CHARS) return { ok: false, reason: 'oversize' };

  let record: unknown;
  try {
    record = JSON.parse(line) as unknown;
  } catch {
    return SKIP_MALFORMED;
  }
  if (!isRecord(record) || typeof record.type !== 'string') return SKIP_MALFORMED;

  const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN;
  if (!Number.isFinite(at)) return SKIP_MALFORMED;

  const payload = record.payload;
  switch (record.type) {
    case 'game:remote-server:raw':
      return isRecord(payload) && typeof payload.data === 'string'
        ? { ok: true, event: { kind: 'raw', at, data: payload.data } }
        : SKIP_MALFORMED;
    case 'game:remote-server:gmcp':
      return isRecord(payload) && typeof payload.data === 'string' ? parseGmcp(at, payload.data) : SKIP_MALFORMED;
    case 'game:client:input':
      return parseInput(at, payload);
    case 'game:remote-server:connect': {
      const host = isRecord(payload) ? payload.host : undefined;
      const port = isRecord(payload) ? finite(payload.port) : undefined;
      return { ok: true, event: typeof host === 'string' && host !== '' && port !== undefined ? { kind: 'connect', at, target: `${host}:${port}` } : { kind: 'connect', at } };
    }
    case 'game:server:connection:client-closed': {
      const code = isRecord(payload) ? finite(payload.code) : undefined;
      return { ok: true, event: code === undefined ? { kind: 'closed', at } : { kind: 'closed', at, code } };
    }
    default:
      return SKIP_IGNORED; // server start-up records and everything else
  }
}

/** The event for a line, or null when the line is skipped for any reason. */
export function parseLogLine(line: string): LogEvent | null {
  const parsed = parseLogRecord(line);
  return parsed.ok ? parsed.event : null;
}
