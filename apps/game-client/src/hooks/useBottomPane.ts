// apps/game-client/src/hooks/useBottomPane.ts
import { useState } from 'react';
import { useEnemyHudState } from './useRightPaneHud';

export type BottomTab = 'compass' | 'opponent' | 'damage' | 'chat' | 'misc';

export function useBottomPane() {
  const [activeTab, setActiveTab] = useState<BottomTab>('chat');
  const enemy = useEnemyHudState();

  const clampedPct = Math.max(0, Math.min(100, enemy.pct));

  const selectTab = (tab: BottomTab) => {
    setActiveTab(tab);
  };

  return {
    activeTab,
    selectTab,
    enemy,
    clampedPct,
  };
}
