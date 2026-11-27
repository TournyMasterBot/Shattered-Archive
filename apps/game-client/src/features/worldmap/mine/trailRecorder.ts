// apps/game-client/src/features/worldmap/mine/trailRecorder.ts
//
// Feeds the trail from the game's own events, for the whole life of the page (bound once, like the movement tracker): every game:room-data is a
// room seen, and every successful move (shatteredarchive:movement-succeeded) says where the exit that was taken led. The record goes to the
// world the client is connected to at that moment. Writes are batched: a flush a moment after the last change, and when the recorder stops.

import { ListenEvent } from '../../event-emitter/event-dispatcher';
import { activeMapWorld } from '../world';
import { registerHistorySource } from './history';
import { sharedMineKv } from './shared';
import { createTrail, type SeenRoom, type Trail } from './trail';

export const FLUSH_AFTER_MS = 1500;
const KEY_ROOM = 'worldMapTrail::room-data';
const KEY_MOVED = 'worldMapTrail::movement-succeeded';

let shared: Trail | undefined;

/** The one trail of the page, kept in the page's mine store (shared.ts). */
export function sharedTrail(): Trail {
  shared ??= createTrail(sharedMineKv());
  return shared;
}

/** Test-only: forget the shared trail. */
export function __resetSharedTrailForTests(): void {
  shared = undefined;
}

interface MovedPayload {
  dir?: string;
  room?: SeenRoom;
}

/** Starts recording; the returned function stops it and writes what is left. */
export function startTrailRecorder(trail: Trail = sharedTrail(), world: () => string = () => activeMapWorld().id): () => void {
  // what this browser has seen is the add-room flow's last resort for history: asked after any source a local build adds
  const unregister = registerHistorySource(trail, { fallback: true });
  let current: SeenRoom | undefined;
  let previous: SeenRoom | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (): void => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void trail.flush().catch(() => undefined);
    }, FLUSH_AFTER_MS);
  };

  const stopRoom = ListenEvent<SeenRoom>(
    'game:room-data',
    (payload) => {
      const snapshot = payload;
      if (!snapshot.room || snapshot.room === 'darkness') return;
      previous = current;
      current = snapshot;
      trail.seen(world(), snapshot);
      schedule();
    },
    { key: KEY_ROOM },
  );

  const stopMoved = ListenEvent<MovedPayload>(
    'shatteredarchive:movement-succeeded',
    (payload) => {
      const to = payload?.room;
      if (!payload?.dir || !to?.room) return;
      // the tracker may answer before or after the room-data listener above: the room the move started in is the one before the arrival
      const from = current?.room === to.room && previous !== undefined ? previous : current;
      if (from === undefined) return;
      trail.moved(world(), from, payload.dir, to);
      schedule();
    },
    { key: KEY_MOVED },
  );

  return () => {
    stopRoom();
    stopMoved();
    unregister();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    void trail.flush().catch(() => undefined);
  };
}
