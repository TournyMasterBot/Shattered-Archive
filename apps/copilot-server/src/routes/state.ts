import { isStale, lastEventAge, type GameState, type Vitals } from '@shatteredarchive/copilot-core';
import type { FeedCounters } from '../tail/pipeline.js';
import type { TailStats } from '../tail/tailer.js';

/** The answer of `GET /state`: what Copilot currently knows about the game, in numbers and a room title. Never log text. */
export interface StateView {
  connected: boolean;
  /** True when the text feed has been silent past the limit (or never started): nothing may run by itself. */
  stale: boolean;
  staleAfterSeconds: number;
  /** Seconds since the last event of any kind, or null when there has been none. */
  lastEventAgeSeconds: number | null;
  /** Seconds since the last line of the TEXT feed (what staleness is measured on), or null when there has been none. */
  lastTextAgeSeconds: number | null;
  inFight: boolean;
  /** Whether the server is reading the game logs (the owner's Copilot switch). Off at every start. */
  learning: boolean;
  room: { name: string; sector: string; exits: string[] } | null;
  vitals: Vitals | null;
  feed: FeedCounters;
  tail: { files: number; lines: number; resets: number; renames: number; oversize: number; ioErrors: number; consumerErrors: number; scans: number };
}

/**
 * Builds the response from the game state and the counters. Only the fields above are copied, one by one: a new field on the game
 * state (or any raw text) can never reach the response without a change here.
 */
export function buildStateView(game: GameState, now: number, staleLimitMs: number, feed: FeedCounters, tail: TailStats, learning = false): StateView {
  const age = lastEventAge(game, now);
  return {
    connected: game.connected,
    stale: isStale(game, now, staleLimitMs),
    staleAfterSeconds: staleLimitMs / 1000,
    lastEventAgeSeconds: age === undefined ? null : Math.round(age / 1000),
    lastTextAgeSeconds: game.lastTextAt === undefined ? null : Math.round(Math.max(0, now - game.lastTextAt) / 1000),
    inFight: game.inFight,
    learning,
    room: game.room === undefined ? null : { name: game.room.name, sector: game.room.sector, exits: [...game.room.exits] },
    vitals: game.vitals === undefined ? null : { ...game.vitals },
    feed: { ...feed },
    tail: {
      files: tail.files,
      lines: tail.lines,
      resets: tail.resets,
      renames: tail.renames,
      oversize: tail.oversize,
      ioErrors: tail.ioErrors,
      consumerErrors: tail.consumerErrors,
      scans: tail.scans,
    },
  };
}
