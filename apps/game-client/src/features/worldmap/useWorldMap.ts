// apps/game-client/src/features/worldmap/useWorldMap.ts
//
// Follows the player: every game:room-data (room title and exits) is turned into a place on the published map by the session. One request
// chain at a time: a newer room aborts the older one, so a slow answer never replaces a newer room. Production feature, not flag-gated.

import { useEffect, useId, useRef, useState } from 'react';
import { ListenEvent } from '../event-emitter/event-dispatcher';
import { getRoomData } from '../room/roomDataStore';
import type { RoomDataPayload } from '../../hooks/useCompassBlock';
import { siteApiBase } from '../auth/siteApi';
import { createWorldMapApi, type WorldMapApi } from './api';
import { withLayer } from './mine/layeredApi';
import { sharedLayerStore } from './mine/shared';
import { createWorldMapSession, type Location, type WorldMapSession } from './session';
import { activeMapWorld, type MapWorld } from './world';

export type WorldMapView =
  | { phase: 'idle' }
  | { phase: 'loading'; title: string }
  | { phase: 'done'; title: string; location: Location };

// one client and one session per world: a world's areas never reach another world's window (a production build has only the DSL's)
const apis = new Map<string, WorldMapApi>();
const sessions = new Map<string, WorldMapSession>();

/** One client for the whole page per world: the areas it has read stay in memory while the map window is closed and opened. */
export function sharedWorldMapApi(world: MapWorld = activeMapWorld()): WorldMapApi {
  let api = apis.get(world.id);
  if (api === undefined) {
    // the player's own rooms are laid over the published map, so a room they added is found like any other
    api = withLayer(createWorldMapApi({ baseUrl: siteApiBase(), mapPrefix: world.mapPrefix }), sharedLayerStore(), world.id);
    apis.set(world.id, api);
  }
  return api;
}

/** One session for the whole page per world, over that world's client. */
export function sharedWorldMapSession(world: MapWorld = activeMapWorld()): WorldMapSession {
  let session = sessions.get(world.id);
  if (session === undefined) {
    session = createWorldMapSession(sharedWorldMapApi(world));
    sessions.set(world.id, session);
  }
  return session;
}

/** Test-only: forget the shared clients and sessions so one test cannot see another's areas. */
export function __resetWorldMapSessionForTests(): void {
  apis.clear();
  sessions.clear();
}

export function useWorldMap(session?: WorldMapSession): WorldMapView {
  const [view, setView] = useState<WorldMapView>({ phase: 'idle' });
  const instance = useId();
  const sessionRef = useRef<WorldMapSession | null>(session ?? null);

  useEffect(() => {
    const active = (sessionRef.current ??= sharedWorldMapSession());
    let controller: AbortController | null = null;

    function follow(payload: RoomDataPayload | null | undefined): void {
      const title = String(payload?.room ?? '').trim();
      if (!title) return;
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      setView({ phase: 'loading', title });
      active.observe({ title, exits: payload?.exits ?? [] }, mine.signal).then(
        (location) => {
          if (location === null || mine.signal.aborted) return;
          setView({ phase: 'done', title, location });
        },
        () => {
          if (mine.signal.aborted) return;
          setView({
            phase: 'done',
            title,
            location: { status: 'unavailable', reason: 'error', message: 'The map could not be used.' },
          });
        },
      );
    }

    follow(getRoomData());
    // a room the player just added: look again, from scratch, so the map shows it
    const stopLayer = sharedLayerStore().subscribe((changed) => {
      if (changed !== activeMapWorld().id) return;
      active.reset();
      follow(getRoomData());
    });
    const dispose = ListenEvent<RoomDataPayload>('game:room-data', follow, {
      key: `worldMap::game:room-data::${instance}`,
    });
    return () => {
      controller?.abort();
      stopLayer();
      dispose();
    };
  }, [instance]);

  return view;
}
