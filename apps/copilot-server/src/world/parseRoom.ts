import { stripAnsi, type FeedEvent } from '@shatteredarchive/copilot-core';
import {
  DIRECTIONS,
  isDirection,
  LIMITS,
  type ContentKind,
  type Direction,
  type VisitEntry,
} from '@shatteredarchive/shattered-maps-core';

/**
 * Turns the feed around one room event into what the room showed.
 *
 * The game sends the room text first (title, description, an `[Exits: ...]` line, the things in the room) and then, just before
 * the prompt, the GMCP `room_data` that the feed reports as a `room` event. So a view is the text lines that came before that
 * event, after the previous prompt and the last command. The GMCP part is exact (title, sector, exits); the text is trusted only
 * when it can be tied to it: a line equal to the GMCP title, then an exits line. Otherwise the text is ignored and the view says why
 * (`text`), so a wrong parse can never put a thing into a room.
 */

export type ViewText =
  /** The title and the exits line were found; description and contents are read from between and after them. */
  | 'ok'
  /** No text came before the event (brief mode, a long run of identical rooms). */
  | 'absent'
  /** The text says the room is too dark to see, and has no exits line. */
  | 'dark'
  /** There was text, but no title line equal to the GMCP room name, or no exits line: ignored, not guessed. */
  | 'disagrees';

export interface ParsedRoomView {
  at: number;
  /** The GMCP room name: the identity key's title. */
  title: string;
  sector: string;
  /** The GMCP exits the map has a slot for, in direction order. */
  exits: Direction[];
  /** GMCP exit names that are not one of the ten slots (kept so a new kind of exit is seen, not lost). */
  unknownExits: string[];
  text: ViewText;
  description?: string;
  /** What the text listed after the exits line. `player` entries are people: callers must not store them. */
  contents: VisitEntry[];
  /** The text had a blank indented line, which the game prints for an object it does not name. */
  unlisted: boolean;
}

/** Where on the screen a line was printed: an indented object line, or an unindented line for a creature or a person. */
export type Placement = 'object' | 'creature';

/** Says what a label is. The default says nothing: every label is `unknown`. */
export type Labeler = (label: string, placement: Placement) => ContentKind;

const PROMPT = /^<\s*\d+\/\d+\s*hp\b/;
const EXITS_LINE = /^\s*\[\s*Exits:/i;
const DARK = /pitch black|too dark|it is dark|can'?t see|cannot see/i;
const LEADING_TAGS = /^(?:\([^)]*\)\s*)+/;
/** Tags only a person can carry. */
const PLAYER_TAG = /\((?:WANTED|KILLER|THIEF|AFK)\)/i;
const ARTICLE = /^(?:a|an|the|some|several|many|two|three|four|five|six)\b/i;
const NAME_SHAPED =
  /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){0,2} (?:is|stands|sits|rests|lies|sleeps|floats|hovers|waits|meditates)\b/;
/** Lines kept from before the event, at most (a very long text is cut at the start). */
const MAX_VIEW_LINES = 400;

function same(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The text lines of the view: after the last prompt, trailing blank lines dropped, ANSI removed. */
function viewLines(events: readonly FeedEvent[], roomAt: number): string[] {
  const collected: string[][] = [];
  for (let i = roomAt - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'lines') collected.unshift(event.lines);
    else if (event.type === 'command' || event.type === 'room' || event.type === 'session' || event.type === 'login')
      break;
  }
  // a line with only blanks is kept as it is (an indented blank line means something); any other line loses its trailing blanks
  let lines = collected.flat().map((line) => {
    const text = stripAnsi(line);
    return text.trim() === '' ? text : text.trimEnd();
  });
  if (lines.length > MAX_VIEW_LINES) lines = lines.slice(lines.length - MAX_VIEW_LINES);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (PROMPT.test(lines[i].trim())) {
      lines = lines.slice(i + 1);
      break;
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // an indented blank line at the end still counts
  return lines;
}

function lastIndexWhere<T>(items: readonly T[], test: (item: T) => boolean, before = items.length): number {
  for (let i = Math.min(before, items.length) - 1; i >= 0; i -= 1) if (test(items[i])) return i;
  return -1;
}

function describe(lines: readonly string[]): string | undefined {
  const out: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (text === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(text);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  const joined = out.join('\n');
  return joined === '' ? undefined : joined.slice(0, LIMITS.description);
}

function playerLike(raw: string, label: string): boolean {
  if (PLAYER_TAG.test(raw)) return true;
  return !ARTICLE.test(label) && NAME_SHAPED.test(label);
}

export function parseRoomView(
  events: readonly FeedEvent[],
  label: Labeler = () => 'unknown',
): ParsedRoomView | undefined {
  const roomAt = lastIndexWhere(events, (event) => event.type === 'room');
  if (roomAt < 0) return undefined;
  const room = events[roomAt] as Extract<FeedEvent, { type: 'room' }>;

  const wanted = new Set<string>();
  const unknownExits: string[] = [];
  for (const exit of room.exits) {
    const upper = exit.trim().toUpperCase();
    if (isDirection(upper)) wanted.add(upper);
    else unknownExits.push(exit);
  }
  const view: ParsedRoomView = {
    at: room.at,
    title: room.room,
    sector: room.sector,
    exits: DIRECTIONS.filter((d) => wanted.has(d)),
    unknownExits,
    text: 'absent',
    contents: [],
    unlisted: false,
  };

  const lines = viewLines(events, roomAt);
  if (lines.length === 0) return view;

  const exitsAt = lastIndexWhere(lines, (line) => EXITS_LINE.test(line));
  if (exitsAt < 0) {
    view.text = lines.some((line) => DARK.test(line)) ? 'dark' : 'disagrees';
    return view;
  }
  const titleAt = lastIndexWhere(lines, (line) => same(line, room.room), exitsAt);
  if (titleAt < 0) {
    view.text = 'disagrees';
    return view;
  }

  view.text = 'ok';
  const description = describe(lines.slice(titleAt + 1, exitsAt));
  if (description !== undefined) view.description = description;
  for (const raw of lines.slice(exitsAt + 1)) {
    if (raw.trim() === '') {
      if (raw.length >= 2) view.unlisted = true; // an indented line with nothing on it: an object the game does not name
      continue;
    }
    const placement: Placement = /^\s{2,}\S/.test(raw) ? 'object' : 'creature';
    const text = raw.trim().replace(LEADING_TAGS, '').trim();
    if (text === '') continue;
    let kind = label(text, placement);
    if (kind === 'unknown' && placement === 'creature' && playerLike(raw, text)) kind = 'player';
    view.contents.push({ label: text, kind });
  }
  return view;
}
