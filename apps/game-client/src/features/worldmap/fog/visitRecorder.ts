// apps/game-client/src/features/worldmap/fog/visitRecorder.ts
//
// Records exploration for fog of war, for the whole life of the page (bound once, like the trail recorder), whether or not the map window is open
// and whether or not fog is switched on (the owner asked to record always, so turning it on later shows what was already explored). A visit is
// recorded only when the position is CERTAIN: the shared map session says the room is exactly one room of the map (same title and same exits); a
// guess ("probably here"), one of several lookalikes, or a room not on the map records nothing. Nothing leaves the browser.

import { ListenEvent } from '../../event-emitter/event-dispatcher';
import type { RoomDataPayload } from '../../../hooks/useCompassBlock';
import type { WorldMapSession } from '../session';
import { sharedWorldMapSession } from '../useWorldMap';
import { activeMapWorld } from '../world';
import { currentScope, type Scope } from './identity';
import { sharedVisitStore } from '../mine/shared';
import type { VisitStore } from './visits';

const KEY = 'worldMapVisits::room-data';

export interface VisitRecorderDeps {
  store?: VisitStore;
  session?: () => WorldMapSession;
  scope?: () => Scope;
  /** Called with a room id when a visit was written (tests; nothing else). */
  onRecorded?: (roomId: string) => void;
}

/** Starts recording; the returned function stops it. */
export function startVisitRecorder(deps: VisitRecorderDeps = {}): () => void {
  const store = deps.store ?? sharedVisitStore();
  const sessionOf = deps.session ?? (() => sharedWorldMapSession());
  const scopeOf = deps.scope ?? (() => currentScope(activeMapWorld().id));
  let controller: AbortController | null = null;

  const stop = ListenEvent<RoomDataPayload>(
    'game:room-data',
    (payload) => {
      const title = String(payload.room ?? '').trim();
      if (!title) return;
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const scope = scopeOf();
      sessionOf()
        .observe({ title, exits: payload.exits ?? [] }, mine.signal)
        .then(async (location) => {
          if (location === null || mine.signal.aborted) return;
          if (location.status !== 'located' || !location.exact || location.roomIds.length !== 1) return;
          if (await store.record(scope, location.roomIds[0])) deps.onRecorded?.(location.roomIds[0]);
        })
        .catch(() => undefined); // a map that cannot be reached records nothing; the game goes on
    },
    { key: KEY },
  );
  return () => {
    stop();
    controller?.abort();
    controller = null;
  };
}
