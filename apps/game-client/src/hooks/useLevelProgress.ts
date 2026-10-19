// apps/game-client/src/hooks/useLevelProgress.ts
import { useSyncExternalStore } from 'react';
import { getLevelProgress, subscribeLevelProgress, type LevelProgress } from '../features/charData/levelProgressStore';

/**
 * Progress through the current level for the compact HUD's EXP gauge. All state
 * lives in levelProgressStore (it must keep tracking across layout switches);
 * this is just the React binding.
 */
export function useLevelProgress(): LevelProgress {
  return useSyncExternalStore(subscribeLevelProgress, getLevelProgress, getLevelProgress);
}
