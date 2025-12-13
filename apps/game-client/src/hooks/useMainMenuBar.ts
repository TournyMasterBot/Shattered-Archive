// apps/game-client/src/hooks/useMainMenuBar.ts
import { useState } from 'react';
import type React from 'react';

type GameSettingsSection = 'Graphics' | 'Audio' | 'Controls' | null;

export function useMainMenuBar() {
  const [openRootMenu, setOpenRootMenu] = useState<string | null>(null);
  const [isGameSettingsOpen, setIsGameSettingsOpen] = useState(false);
  const [openGameSettingsSection, setOpenGameSettingsSection] = useState<GameSettingsSection>(null);

  const toggleRootMenu = (id: string) => {
    setOpenRootMenu((prev) => (prev === id ? null : id));
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  const closeAllMenus = () => {
    setOpenRootMenu(null);
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  const toggleGameSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGameSettingsOpen((prev) => !prev);
    setOpenGameSettingsSection(null);
  };

  const toggleGameSettingsSection = (e: React.MouseEvent, section: Exclude<GameSettingsSection, null>) => {
    e.stopPropagation();
    setOpenGameSettingsSection((prev) => (prev === section ? null : section));
  };

  return {
    openRootMenu,
    isGameSettingsOpen,
    openGameSettingsSection,
    toggleRootMenu,
    toggleGameSettings,
    toggleGameSettingsSection,
    closeAllMenus,
  };
}
