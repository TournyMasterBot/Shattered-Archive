// apps/game-client/src/features/worldmap/fog/useVisited.ts
//
// The rooms the map window may show while fog of war is on: the visited rooms of the account (user level) or of the character being played, kept
// current as visits are recorded and when the game names a different character. Null while fog is off (nothing is hidden then).

import { useEffect, useId, useMemo, useState } from 'react';
import { ListenEvent } from '../../event-emitter/event-dispatcher';
import type { FogMode } from '../settings';
import { sharedVisitStore } from '../mine/shared';
import { currentScope } from './identity';
import type { VisitStore } from './visits';

export function useVisited(fog: FogMode, worldId: string, store: VisitStore = sharedVisitStore()): ReadonlySet<string> | null {
  const [tick, setTick] = useState(0);
  const instance = useId();

  useEffect(() => {
    if (fog === 'off') return;
    let live = true;
    const refresh = (): void => void store.load(currentScope(worldId)).then(() => live && setTick((t) => t + 1));
    refresh();
    const off = store.subscribe(() => setTick((t) => t + 1));
    // the game names the character a moment after connecting: the character level changes with it
    const offIdentity = ListenEvent('shatteredarchive:identity-updated', refresh, { key: `worldMapFog::identity::${instance}` });
    return () => {
      live = false;
      off();
      offIdentity();
    };
  }, [fog, worldId, store, instance]);

  // `tick` is what makes this read again after a visit or a character change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (fog === 'off' ? null : store.visited(currentScope(worldId), fog)), [fog, worldId, store, tick]);
}
