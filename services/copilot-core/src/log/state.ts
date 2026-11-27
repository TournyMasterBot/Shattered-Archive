import type { Vitals } from './events.js';

export interface RoomView {
  name: string;
  sector: string;
  exits: string[];
}

/** What Copilot currently knows about the game, rebuilt from the log. */
export interface GameState {
  /** False before the first connect and after the connection closes. */
  connected: boolean;
  room?: RoomView;
  vitals?: Vitals;
  inFight: boolean;
  /** Time (epoch ms) of the last event of any kind. */
  lastEventAt?: number;
  /**
   * Time of the last event of the TEXT feed (a raw line, a command echo, a connect). The game-server stops logging raw text and
   * input when its SOH gate is closed while GMCP may continue, so GMCP alone does not prove the feed is alive.
   */
  lastTextAt?: number;
}

export const INITIAL_GAME_STATE: GameState = { connected: false, inFight: false };

/**
 * True when the text feed has been silent for longer than `limitMs`, or has never produced anything (LOGTAIL-02).
 * A stale state never leads to an automatic action: the policy turns it into "ask". A clock that is behind the last event
 * (skew) is not stale.
 */
export function isStale(state: GameState, now: number, limitMs: number): boolean {
  if (state.lastTextAt === undefined) return true;
  return now - state.lastTextAt > limitMs;
}

/** Milliseconds since the last event of any kind, or undefined when there has been none. */
export function lastEventAge(state: GameState, now: number): number | undefined {
  return state.lastEventAt === undefined ? undefined : Math.max(0, now - state.lastEventAt);
}
