// apps/game-client/src/components/MainMenuBar.tsx
import React from 'react';
import styles from '../styles/MainContainer.module.scss';

type GameSettingsSection = 'Graphics' | 'Audio' | 'Controls' | null;

interface MainMenuBarProps {
  openRootMenu: string | null;
  isGameSettingsOpen: boolean;
  openGameSettingsSection: GameSettingsSection;
  toggleRootMenu: (id: string) => void;
  toggleGameSettings: (e: React.MouseEvent) => void;
  toggleGameSettingsSection: (e: React.MouseEvent, section: Exclude<GameSettingsSection, null>) => void;
  onOpenCustomStyles: () => void;
  onOpenScriptSandbox: () => void; // NEW
}

/**
 * Top application menu bar (File / Profiles / Game / Help).
 */
export const MainMenuBar: React.FC<MainMenuBarProps> = ({
  openRootMenu,
  isGameSettingsOpen,
  openGameSettingsSection,
  toggleRootMenu,
  toggleGameSettings,
  toggleGameSettingsSection,
  onOpenCustomStyles,
  onOpenScriptSandbox,
}) => {
  return (
    <div className={styles.menuBar}>
      {/* File */}
      <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('File')}>
        File
        <div className={`${styles.subMenu} ${openRootMenu === 'File' ? styles.subMenuOpen : ''}`}>
          <div className={styles.subMenuItem}>Connect</div>

          <div
            className={styles.subMenuItem}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCustomStyles();
            }}
          >
            Custom Styles…
          </div>

          <div
            className={styles.subMenuItem}
            onClick={(e) => {
              e.stopPropagation();
              onOpenScriptSandbox();
            }}
          >
            Script Sandbox…
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
          <div className={`${styles.subMenuItem} ${styles.subMenuItemHasSubmenu}`} onClick={toggleGameSettings}>
            Settings
            <div className={`${styles.subMenuLevel2} ${isGameSettingsOpen ? styles.subMenuOpen : ''}`}>
              {/* Graphics */}
              <div
                className={`${styles.subMenuItem} ${styles.subMenuItemHasSubmenu}`}
                onClick={(e) => toggleGameSettingsSection(e, 'Graphics')}
              >
                Graphics
                <div
                  className={`${styles.subMenuLevel3} ${
                    openGameSettingsSection === 'Graphics' ? styles.subMenuOpen : ''
                  }`}
                >
                  <div className={styles.subMenuItem}>Low</div>
                  <div className={styles.subMenuItem}>Medium</div>
                  <div className={styles.subMenuItem}>High</div>
                </div>
              </div>

              {/* Audio */}
              <div
                className={`${styles.subMenuItem} ${styles.subMenuItemHasSubmenu}`}
                onClick={(e) => toggleGameSettingsSection(e, 'Audio')}
              >
                Audio
                <div
                  className={`${styles.subMenuLevel3} ${openGameSettingsSection === 'Audio' ? styles.subMenuOpen : ''}`}
                >
                  <div className={styles.subMenuItem}>Master Volume</div>
                  <div className={styles.subMenuItem}>Music Volume</div>
                  <div className={styles.subMenuItem}>SFX Volume</div>
                </div>
              </div>

              {/* Controls */}
              <div
                className={`${styles.subMenuItem} ${styles.subMenuItemHasSubmenu}`}
                onClick={(e) => toggleGameSettingsSection(e, 'Controls')}
              >
                Controls
                <div
                  className={`${styles.subMenuLevel3} ${
                    openGameSettingsSection === 'Controls' ? styles.subMenuOpen : ''
                  }`}
                >
                  <div className={styles.subMenuItem}>Keybindings</div>
                  <div className={styles.subMenuItem}>Mouse Settings</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help */}
      <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Help')}>
        Help
        <div className={`${styles.subMenu} ${openRootMenu === 'Help' ? styles.subMenuOpen : ''}`}>
          <div className={styles.subMenuItem}>About</div>
          <div className={styles.subMenuItem}>Shortcuts</div>
        </div>
      </div>
    </div>
  );
};
