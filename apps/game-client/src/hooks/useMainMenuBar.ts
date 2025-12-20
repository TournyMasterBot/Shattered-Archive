// apps/game-client/src/hooks/useMainMenuBar.ts
import { useState } from 'react';
import type React from 'react';

type GameSettingsSection = 'Controls' | null;

export function useMainMenuBar() {
  const [openRootMenu, setOpenRootMenu] = useState<string | null>(null);
  const [isGameSettingsOpen, setIsGameSettingsOpen] = useState(false);
  const [openGameSettingsSection, setOpenGameSettingsSection] = useState<GameSettingsSection>(null);

  const [isGraphicsModalOpen, setIsGraphicsModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  const [isAccessibilityModalOpen, setIsAccessibilityModalOpen] = useState(false);

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

  const openGraphicsModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    closeAllMenus();
    setIsGraphicsModalOpen(true);
  };

  const closeGraphicsModal = () => setIsGraphicsModalOpen(false);

  const openAudioModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    closeAllMenus();
    setIsAudioModalOpen(true);
  };

  const closeAudioModal = () => setIsAudioModalOpen(false);

  const openAccessibilityModal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    closeAllMenus();
    setIsAccessibilityModalOpen(true);
  };

  const closeAccessibilityModal = () => setIsAccessibilityModalOpen(false);

  return {
    openRootMenu,
    isGameSettingsOpen,
    openGameSettingsSection,

    isGraphicsModalOpen,
    openGraphicsModal,
    closeGraphicsModal,

    isAudioModalOpen,
    openAudioModal,
    closeAudioModal,

    isAccessibilityModalOpen,
    openAccessibilityModal,
    closeAccessibilityModal,

    toggleRootMenu,
    toggleGameSettings,
    toggleGameSettingsSection,
    closeAllMenus,
  };
}
