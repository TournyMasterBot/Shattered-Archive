// apps/game-client/src/hooks/useEquipmentState.ts
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  getEquipmentPrefs,
  getEquipmentProfile,
  getEquipmentState,
  hydrateEquipment,
  subscribeEquipment,
} from '../features/equipment/equipment-store';

export function useEquipmentState(connectionId: string) {
  useEffect(() => {
    void hydrateEquipment(connectionId);
  }, [connectionId]);

  const state = useSyncExternalStore(
    subscribeEquipment,
    () => getEquipmentState(connectionId),
    () => getEquipmentState(connectionId),
  );

  const prefs = useSyncExternalStore(
    subscribeEquipment,
    () => getEquipmentPrefs(connectionId),
    () => getEquipmentPrefs(connectionId),
  );

  const profile = useSyncExternalStore(
    subscribeEquipment,
    () => getEquipmentProfile(connectionId),
    () => getEquipmentProfile(connectionId),
  );

  return useMemo(() => ({ state, prefs, profile }), [state, prefs, profile]);
}
