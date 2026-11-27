import type { FeedEvent } from '@shatteredarchive/copilot-core';
import type { Direction } from '@shatteredarchive/shattered-maps-core';
import { commandDirection } from './direction.js';
import type { ApplyContext } from './memory.js';
import { parseRoomView, type Labeler, type ParsedRoomView } from './parseRoom.js';

/** Where the room views go: the world memory in live play, and for a replay also the Azah tracer (core `AzahTracer`). */
export interface ViewSink {
  apply(view: ParsedRoomView, context: ApplyContext): Promise<unknown>;
  endSession(): void;
  noteRefused(): void;
}

export interface WorldFeedDeps {
  memory: ViewSink;
  /** The registered codename of the character being played (`Base-G`), or undefined when nobody is registered. */
  character: () => string | undefined;
  label: Labeler;
  /** Called on each room view so the label names can be (re)loaded in the background. */
  refreshNames?: () => void;
  /**
   * Called when a connection opens (with the `host:port` it went to, when the log said) or closes (no target), after the memory's session has
   * ended. This is how the sink learns which world the next views are from.
   */
  onSession?: (session: { state: 'connected' | 'closed'; target?: string }) => void;
}

export interface WorldFeed {
  /** Give the memory a batch of feed events. Resolves when every room view in it has been stored (or refused). */
  handle(events: readonly FeedEvent[]): Promise<void>;
}

/** Feed events kept while waiting for the room event that closes a view. Older ones are dropped. */
const MAX_WINDOW = 200;

/** The play day of an event time: the UTC calendar date. */
export function playDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Connects the log feed to the world memory. A room view is the text before a `room` event (the GMCP arrives after the room text, just
 * before the prompt), so this keeps the events since the last view and parses them when the `room` event comes.
 *
 * A move is followed (a link is recorded) only when exactly ONE movement command was typed since the previous room event. Several
 * mean a move failed or the character passed through rooms that look alike (the game sends identical room data once, and the feed
 * collapses repeats), so the way the character arrived is not known and no link is guessed.
 *
 * Nothing is stored without a registered character: the memory is per session (the play day plus the codename). A login or a closed
 * connection ends the session.
 */
export function createWorldFeed(deps: WorldFeedDeps): WorldFeed {
  let window: FeedEvent[] = [];
  let moves: Direction[] = [];
  /** The latest command was a movement (so a failed move followed by `recall` is not an arrival by that exit). */
  let lastWasMove = false;

  const reset = (): void => {
    window = [];
    moves = [];
    lastWasMove = false;
    deps.memory.endSession();
  };

  return {
    async handle(events) {
      for (const event of events) {
        switch (event.type) {
          case 'lines':
            window.push(event);
            break;
          case 'command': {
            window.push(event);
            const dir = commandDirection(event.command);
            if (dir !== undefined) moves.push(dir);
            lastWasMove = dir !== undefined;
            break;
          }
          case 'login':
            reset();
            break;
          case 'session':
            reset();
            deps.onSession?.(event.target === undefined ? { state: event.state } : { state: event.state, target: event.target });
            break;
          case 'room': {
            window.push(event);
            const view = parseRoomView(window, deps.label);
            const arrivalDir = moves.length === 1 && lastWasMove ? moves[0] : undefined;
            window = [];
            moves = [];
            lastWasMove = false;
            deps.refreshNames?.();
            const character = deps.character();
            if (view === undefined || character === undefined) {
              deps.memory.noteRefused();
              break;
            }
            const day = playDay(event.at);
            await deps.memory.apply(view, {
              day,
              session: `${day}:${character}`,
              ...(arrivalDir === undefined ? {} : { arrivalDir }),
            });
            break;
          }
          default:
            break;
        }
        if (window.length > MAX_WINDOW) window = window.slice(window.length - MAX_WINDOW);
      }
    },
  };
}
