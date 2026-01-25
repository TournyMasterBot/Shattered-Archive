// apps\game-client\src\hooks\useMiscPane.ts
import { useState } from 'react';

export type MiscSection = 'bestiary' | 'archives' | 'autopilot' | 'log';

export function useMiscPane() {
  const [activeSection, setActiveSection] = useState<MiscSection>('bestiary');

  return {
    activeSection,
    setActiveSection,
  };
}
