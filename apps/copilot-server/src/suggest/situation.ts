import { stripAnsi, type FightSnapshot, type GameState, type Mode } from '@shatteredarchive/copilot-core';
import type { RingEvent } from '../tail/pipeline.js';

/** What the producer is asked about: the character, what it is doing, and what the log shows right now. */
export interface Situation {
  /** The character's `Base-G` codename. */
  character: string;
  mode: Mode;
  game: GameState;
  /** The last few lines of game text, ANSI removed and names already replaced. */
  lines: string[];
  now: number;
  /** A stable key for this kind of situation: lessons and tickets are grouped by it. */
  situationKey: string;
  /** Where the fight in progress is going (projected to `now`), when there is one: computed from the log, never by a model. */
  fight?: FightSnapshot;
}

const MAX_LINE_CHARS = 300;

/**
 * The last `max` non-empty lines of game text from the feed ring, newest last, with colour removed, every name replaced by `redact`
 * and each line cut short. This is the only game text a model is ever shown.
 */
export function recentLines(events: readonly RingEvent[], max: number, redact: (text: string) => string): string[] {
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < max; i--) {
    const event = events[i];
    if (event.type !== 'lines') continue;
    for (let j = event.lines.length - 1; j >= 0 && out.length < max; j--) {
      const text = stripAnsi(event.lines[j]).trim();
      if (text !== '') out.unshift(redact(text).slice(0, MAX_LINE_CHARS));
    }
  }
  return out;
}

/** A fight is battle; anything else the owner has not said otherwise is exploration. */
export function inferMode(game: GameState): Mode {
  return game.inFight ? 'battle' : 'exploration';
}

const MAX_KEY = 200;

/** `battle:fight`, or `<mode>:<room name in lower case, words joined by dashes>`; bounded, so one room never makes a huge key. */
export function situationKeyFor(mode: Mode, game: GameState): string {
  if (game.inFight) return `${mode}:fight`;
  const room = game.room?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ?? 'unknown-room';
  return `${mode}:${room === '' ? 'unknown-room' : room}`.slice(0, MAX_KEY);
}
