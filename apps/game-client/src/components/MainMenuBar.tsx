import React from 'react';
import styles from '../styles/MainMenuBar.module.scss';
import { useMainMenuBar } from '../hooks/useMainMenuBar';
import GraphicsSettingsModal from './GraphicsSettingsModal';
import AudioSettingsModal from './AudioSettingsModal';

interface MainMenuBarProps {
  onOpenCustomStyles: () => void;
  onOpenScriptSandbox: () => void;
  onOpenConnect: () => void;
  onOpenPlugins: () => void;
}

export const MainMenuBar: React.FC<MainMenuBarProps> = ({
  onOpenCustomStyles,
  onOpenScriptSandbox,
  onOpenConnect,
  onOpenPlugins,
}) => {
  const {
    openRootMenu,
    isGameSettingsOpen,
    openGameSettingsSection,
    toggleRootMenu,
    toggleGameSettings,
    toggleGameSettingsSection,
    closeAllMenus,

    isGraphicsModalOpen,
    openGraphicsModal,
    closeGraphicsModal,

    isAudioModalOpen,
    openAudioModal,
    closeAudioModal,
  } = useMainMenuBar();

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleWindowClick = (ev: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      closeAllMenus();
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [closeAllMenus]);

  return (
    <>
      <div ref={rootRef} className={styles.menuBar}>
        {/* File */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('File')}>
          File
          <div className={`${styles.subMenu} ${openRootMenu === 'File' ? styles.subMenuOpen : ''}`}>
            <div
              className={styles.subMenuItem}
              onClick={(e) => {
                e.stopPropagation();
                closeAllMenus();
                onOpenConnect();
              }}
            >
              Connect…
            </div>
          </div>
        </div>

        {/* Profiles */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Profiles')}>
          Profiles
          <div className={`${styles.subMenu} ${openRootMenu === 'Profiles' ? styles.subMenuOpen : ''}`}>
            <div className={styles.subMenuItem}>Load Profile</div>
            <div className={styles.subMenuItem}>Save Profile</div>
            <div className={styles.subMenuItem}>Manage Profiles</div>
          </div>
        </div>

        {/* Game */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Game')}>
          Game
          <div className={`${styles.subMenu} ${openRootMenu === 'Game' ? styles.subMenuOpen : ''}`}>
            <div
              className={styles.subMenuItem}
              onClick={(e) => {
                e.stopPropagation();
                closeAllMenus();
                onOpenScriptSandbox();
              }}
            >
              Script Sandbox…
            </div>

            <div
              className={styles.subMenuItem}
              onClick={(e) => {
                e.stopPropagation();
                closeAllMenus();
                onOpenCustomStyles();
              }}
            >
              Custom Styles…
            </div>

            <div className={`${styles.subMenuItem} ${styles.subMenuItemHasSubmenu}`} onClick={toggleGameSettings}>
              Settings
              <div className={`${styles.subMenuLevel2} ${isGameSettingsOpen ? styles.subMenuOpen : ''}`}>
                {/* NEW: Graphics is now an action that opens a modal */}
                <div className={styles.subMenuItem} onClick={openGraphicsModal}>
                  Graphics…
                </div>

                <div className={styles.subMenuItem} onClick={openAudioModal}>
                  Audio…
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plugins */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Plugins')}>
          Plugins
          <div className={`${styles.subMenu} ${openRootMenu === 'Plugins' ? styles.subMenuOpen : ''}`}>
            <div
              className={styles.subMenuItem}
              onClick={(e) => {
                e.stopPropagation();
                closeAllMenus();
                onOpenPlugins();
              }}
            >
              Manage Plugins…
            </div>
          </div>
        </div>

        {/* External */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('External')}>
          External
          <div className={`${styles.subMenu} ${openRootMenu === 'External' ? styles.subMenuOpen : ''}`}>
            <a
              className={`${styles.subMenuItem} ${styles.subMenuLink}`}
              href="https://shatteredarchive.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Open Shattered Archive
            </a>
            <div className={styles.subMenuItem}>Sync Data (TODO)</div>
            <div className={styles.subMenuItem}>Load Data (TODO)</div>
            <a
              className={`${styles.subMenuItem} ${styles.subMenuLink}`}
              href="https://github.com/TournyMasterBot/Shattered-Archive"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Github
            </a>
          </div>
        </div>

        {/* Help */}
        <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Help')}>
          Help
          <div className={`${styles.subMenu} ${openRootMenu === 'Help' ? styles.subMenuOpen : ''}`}>
            <div className={styles.subMenuItem}>About</div>
            <a
              className={`${styles.subMenuItem} ${styles.subMenuLink}`}
              href="https://github.com/sponsors/TournyMasterBot"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Sponsor
            </a>
            <a
              className={`${styles.subMenuItem} ${styles.subMenuLink}`}
              href="https://github.com/TournyMasterBot/Shattered-Archive/issues"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Report Bug
            </a>
            <a
              className={`${styles.subMenuItem} ${styles.subMenuLink}`}
              href="https://github.com/TournyMasterBot/Shattered-Archive/issues"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Request Feature
            </a>
          </div>
        </div>
      </div>

      {/* Render modal outside the menu DOM so it isn't clipped */}
      <GraphicsSettingsModal isOpen={isGraphicsModalOpen} onClose={closeGraphicsModal} />
      <AudioSettingsModal isOpen={isAudioModalOpen} onClose={closeAudioModal} />
    </>
  );
};
