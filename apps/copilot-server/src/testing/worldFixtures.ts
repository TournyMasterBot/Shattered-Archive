import type { FeedEvent } from '@shatteredarchive/copilot-core';
import type { WorldIo } from '../world/memory';

/** Builders for world-memory tests. The rooms, creatures and items are invented. Test helper: excluded from the build. */

export const linesEvent = (at: number, ...lines: string[]): FeedEvent => ({ type: 'lines', at, lines });
export const roomEvent = (at: number, room: string, exits: string[] = ['N', 'S'], sector = 'inside'): FeedEvent => ({
  type: 'room',
  at,
  room,
  sector,
  exits,
});
export const commandEvent = (at: number, command: string): FeedEvent => ({ type: 'command', at, command });

const PROMPT = '<100/100hp 50/50m 80/80mv 1000tnl> [Somewhere] [NS] [3:00pm]';

export interface ViewSpec {
  title: string;
  /** Description lines; the first is indented two spaces, like the game's. */
  description?: string[];
  /** The words on the `[Exits: ...]` line. */
  exitWords?: string[];
  /** Everything after the exits line, as printed (indentation included). */
  contents?: string[];
  /** The GMCP room name when it differs from the printed title. */
  gmcpName?: string;
  gmcpExits?: string[];
  sector?: string;
  /** A prompt line printed before the view (the one the previous view ended with). */
  withPromptBefore?: boolean;
}

/** The text of one room view as the reducer would hand it over, then the GMCP room event. */
export function viewEvents(at: number, spec: ViewSpec): FeedEvent[] {
  const lines: string[] = [];
  if (spec.withPromptBefore !== false) lines.push(PROMPT);
  lines.push(spec.title);
  (spec.description ?? ['  A plain room with nothing to say for itself.']).forEach((line) => lines.push(line));
  lines.push('');
  lines.push(` [Exits: ${(spec.exitWords ?? ['north', 'south']).join(' ')}  ]`);
  for (const line of spec.contents ?? []) lines.push(line);
  lines.push('');
  return [
    linesEvent(at, ...lines),
    roomEvent(at, spec.gmcpName ?? spec.title, spec.gmcpExits ?? ['N', 'S'], spec.sector ?? 'inside'),
  ];
}

/** In-memory file store for the world memory, with a switch that makes writes fail. */
export class MemoryWorldIo implements WorldIo {
  files = new Map<string, string>();
  failWrite = false;
  /** Fail only writes to a path that ends with this text. */
  failPathEnding: string | undefined;
  writes = 0;

  async readText(file: string): Promise<string | undefined> {
    return this.files.get(file);
  }
  async writeText(file: string, text: string): Promise<void> {
    if (this.failWrite || (this.failPathEnding !== undefined && file.endsWith(this.failPathEnding)))
      throw new Error('disk full: /secret/path');
    this.writes += 1;
    this.files.set(file, text);
  }
}

// ---- the same views as game-server jsonl, for the end-to-end tests ----------------------------------------------------------------

const stamp = (at: number): string => new Date(at).toISOString();

export const rawLine = (at: number, data: string): string =>
  JSON.stringify({
    type: 'game:remote-server:raw',
    subtype: 'raw',
    level: 'debug',
    timestamp: stamp(at),
    payload: { type: 'raw', data },
  });

export const gmcpLine = (at: number, data: string): string =>
  JSON.stringify({
    type: 'game:remote-server:gmcp',
    subtype: 'gmcp',
    level: 'debug',
    timestamp: stamp(at),
    payload: { type: 'gmcp', data },
  });

export const inputLine = (at: number, command: string): string =>
  JSON.stringify({
    type: 'game:client:input',
    subtype: '',
    level: 'debug',
    timestamp: stamp(at),
    payload: JSON.stringify({ type: 'data', data: command }),
  });

/** A room view as the game sends it: the text, then room_data, then the prompt. */
export function viewJsonl(at: number, spec: ViewSpec): string[] {
  const out: string[] = [];
  const print = (text: string): number => {
    out.push(rawLine(at, `${text}\r\n`));
    return at;
  };
  print(spec.title);
  for (const line of spec.description ?? ['  A plain room with nothing to say for itself.']) print(line);
  print('');
  print(` [Exits: ${(spec.exitWords ?? ['north', 'south']).join(' ')}  ]`);
  for (const line of spec.contents ?? []) print(line);
  print('');
  const exits = (spec.gmcpExits ?? ['N', 'S']).map((e) => `"${e}"`).join(', ');
  out.push(
    gmcpLine(
      at,
      `room_data {"room": "${spec.gmcpName ?? spec.title}", "sector": "${spec.sector ?? 'inside'}", "exits": [ ${exits} ]  }`,
    ),
  );
  out.push(rawLine(at, `${PROMPT}\r\n`));
  return out;
}

export const loginLine = (at: number, name: string): string =>
  gmcpLine(at, `login_data {"name": "${name}", "level": 51}`);
