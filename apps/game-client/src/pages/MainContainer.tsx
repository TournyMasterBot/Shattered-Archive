// apps/game-client/src/pages/MainContainer.tsx (or components/MainContainer.tsx depending on your layout)
import React from 'react';
import styles from '../styles/MainContainer.module.scss';

import { BottomPane } from '../components/BottomPane';
import { UserStyleOverrideModal } from '../components/UserStyleOverrideModal';
import UserScriptSandboxModal from '../components/UserScriptSandboxModal';

import { useLayoutSizing, useMenuState, useUserCssOverrides, useMainContainer } from '../hooks/useMainContainer';

import { MainMenuBar } from '../components/MainMenuBar';
import { FocusBar } from '../components/FocusBar';
import { LayoutShell } from '../components/LayoutShell';

export const MainContainer: React.FC = () => {
  const main = useMainContainer();

  const { layoutVars, handleVerticalResizeMouseDown, handleHorizontalResizeMouseDown } = useLayoutSizing();

  const {
    openRootMenu,
    isGameSettingsOpen,
    openGameSettingsSection,
    toggleRootMenu,
    closeAllMenus,
    toggleGameSettings,
    toggleGameSettingsSection,
  } = useMenuState();

  const {
    userCssApplied,
    userCssDraft,
    setUserCssDraft,
    isStyleModalOpen,
    openStyleModal,
    closeStyleModal,
    saveUserCss,
    discardDraft,
  } = useUserCssOverrides();

  // NEW: script sandbox modal state
  const [isScriptModalOpen, setIsScriptModalOpen] = React.useState(false);

  const handleOpenCustomStyles = () => {
    closeAllMenus();
    openStyleModal();
  };

  const handleOpenScriptSandbox = () => {
    closeAllMenus();
    setIsScriptModalOpen(true);
  };

  return (
    <div className={styles.root}>
      <MainMenuBar
        openRootMenu={openRootMenu}
        isGameSettingsOpen={isGameSettingsOpen}
        openGameSettingsSection={openGameSettingsSection}
        toggleRootMenu={toggleRootMenu}
        toggleGameSettings={toggleGameSettings}
        toggleGameSettingsSection={toggleGameSettingsSection}
        onOpenCustomStyles={handleOpenCustomStyles}
        onOpenScriptSandbox={handleOpenScriptSandbox}
      />

      <FocusBar />

      <LayoutShell
        layoutVars={layoutVars}
        onVerticalResizeMouseDown={handleVerticalResizeMouseDown}
        onHorizontalResizeMouseDown={handleHorizontalResizeMouseDown}
        BottomPaneComponent={BottomPane}
      />

      {/* Custom CSS modal */}
      <UserStyleOverrideModal
        isOpen={isStyleModalOpen}
        appliedCss={userCssApplied}
        draftCss={userCssDraft}
        onChangeDraft={setUserCssDraft}
        onSave={() => {
          saveUserCss();
          closeStyleModal();
        }}
        onDiscardDraft={() => {
          discardDraft();
          closeStyleModal();
        }}
        onClose={closeStyleModal}
      />

      {/* Script Sandbox modal */}
      <UserScriptSandboxModal isOpen={isScriptModalOpen} onClose={() => setIsScriptModalOpen(false)} />
    </div>
  );
};

export default MainContainer;
