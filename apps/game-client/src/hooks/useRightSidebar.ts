// apps/game-client/src/hooks/useRightSidebar.ts
import { useState } from 'react';
import { useCharData } from './useCharData';

export function useRightSidebarViewModel() {
  const { ancillary } = useCharData();
  const [showAncillaryBar, setShowAncillaryBar] = useState(true);

  const toggleAncillaryBar = () => setShowAncillaryBar((prev) => !prev);

  return {
    ancillary,
    showAncillaryBar,
    toggleAncillaryBar,
  };
}
