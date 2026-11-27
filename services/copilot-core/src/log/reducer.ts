import type { LogEvent, Vitals } from './events.js';
import { INITIAL_GAME_STATE, type GameState } from './state.js';

/** What the rest of Copilot sees: a compact, ordered feed instead of the raw log. */
export type FeedEvent =
  | { type: 'room'; at: number; room: string; sector: string; exits: string[] }
  | { type: 'vitals'; at: number; vitals: Vitals; inFight: boolean }
  /** Whole lines (ANSI still in them) that were completed in this batch, in order. */
  | { type: 'lines'; at: number; lines: string[] }
  | { type: 'command'; at: number; command: string }
  /** `name` is a REAL character name; consume it at once. */
  | { type: 'login'; at: number; name: string; level?: number }
  /** `target` (`host:port`) is set on `connected` when the log said where the connection went. */
  | { type: 'session'; at: number; state: 'connected' | 'closed'; code?: number; target?: string };

export interface ReducerState {
  game: GameState;
  /** The unfinished last line of the raw text (payloads are not line-aligned). */
  partial: string;
  roomKey?: string;
  vitalsKey?: string;
}

export const MAX_PARTIAL_CHARS = 100_000;

export function initialReducerState(): ReducerState {
  return { game: { ...INITIAL_GAME_STATE }, partial: '' };
}

/**
 * Fold a batch of events into the state and return the compact feed.
 *
 * - events are put in timestamp order first (stable, so equal times keep their file order);
 * - `tick` is dropped, and identical `room_data` / `char_data` are collapsed (the game sends both before EVERY prompt);
 * - raw fragments are joined into whole lines, and the unfinished tail is carried to the next call;
 * - command echoes are kept; a connect or close resets the unfinished line.
 *
 * Pure: the same state and events always give the same result, and the input state is not modified.
 */
export function reduceEvents(
  previous: ReducerState,
  events: readonly LogEvent[],
): { state: ReducerState; out: FeedEvent[] } {
  const ordered = [...events].sort((a, b) => a.at - b.at);
  const out: FeedEvent[] = [];
  let state: ReducerState = { ...previous, game: { ...previous.game } };
  let pendingLines: string[] = [];
  let pendingAt = 0;

  const flushLines = (): void => {
    if (pendingLines.length > 0) {
      out.push({ type: 'lines', at: pendingAt, lines: pendingLines });
      pendingLines = [];
    }
  };
  const touch = (at: number, text: boolean): void => {
    state.game.lastEventAt = Math.max(state.game.lastEventAt ?? at, at);
    if (text) state.game.lastTextAt = Math.max(state.game.lastTextAt ?? at, at);
  };

  for (const event of ordered) {
    switch (event.kind) {
      case 'tick':
        touch(event.at, false);
        break;

      case 'raw': {
        touch(event.at, true);
        const joined = state.partial + event.data;
        const lastBreak = joined.lastIndexOf('\n');
        const complete = lastBreak < 0 ? [] : joined.slice(0, lastBreak).split('\n');
        let tail = joined.slice(lastBreak + 1);
        if (tail.length > MAX_PARTIAL_CHARS) {
          complete.push(tail); // an endless line is flushed rather than grown without bound
          tail = '';
        }
        state.partial = tail;
        if (complete.length > 0) {
          pendingLines.push(...complete.map((line) => line.replace(/\r$/, '')));
          pendingAt = event.at;
        }
        break;
      }

      case 'room': {
        touch(event.at, false);
        const key = JSON.stringify([event.room, event.sector, event.exits]);
        if (key !== state.roomKey) {
          flushLines();
          state.roomKey = key;
          state.game.room = { name: event.room, sector: event.sector, exits: event.exits };
          out.push({ type: 'room', at: event.at, room: event.room, sector: event.sector, exits: event.exits });
        }
        break;
      }

      case 'char': {
        touch(event.at, false);
        if (event.inFight !== undefined) state.game.inFight = event.inFight;
        const key = JSON.stringify([event.vitals, state.game.inFight]);
        if (key !== state.vitalsKey) {
          flushLines();
          state.vitalsKey = key;
          state.game.vitals = event.vitals;
          out.push({ type: 'vitals', at: event.at, vitals: event.vitals, inFight: state.game.inFight });
        }
        break;
      }

      case 'input': {
        touch(event.at, true);
        flushLines();
        out.push({ type: 'command', at: event.at, command: event.data.replace(/[\r\n]+$/, '') });
        break;
      }

      case 'login': {
        touch(event.at, false);
        flushLines();
        const login: FeedEvent = { type: 'login', at: event.at, name: event.name };
        if (event.level !== undefined) login.level = event.level;
        out.push(login);
        break;
      }

      case 'connect':
        touch(event.at, true);
        flushLines();
        state.partial = '';
        state.roomKey = undefined; // a new connection announces its room again: that is a new view even if the room is the same
        state.game.connected = true;
        out.push(event.target === undefined ? { type: 'session', at: event.at, state: 'connected' } : { type: 'session', at: event.at, state: 'connected', target: event.target });
        break;

      case 'closed': {
        touch(event.at, false);
        flushLines();
        state.partial = '';
        state.roomKey = undefined;
        state.game.connected = false;
        state.game.inFight = false;
        const closed: FeedEvent = { type: 'session', at: event.at, state: 'closed' };
        if (event.code !== undefined) closed.code = event.code;
        out.push(closed);
        break;
      }
    }
  }

  flushLines();
  state = { ...state, game: { ...state.game } };
  return { state, out };
}
