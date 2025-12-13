import React from 'react';
import styles from '../styles/MainMenuBar.module.scss';
import { useMainMenuBar } from '../hooks/useMainMenuBar';

interface MainMenuBarProps {
  onOpenCustomStyles: () => void;
  onOpenScriptSandbox: () => void;
  onOpenConnect: () => void;
  onOpenPlugins: () => void;
}

/**
 * Top application menu bar (File / Profiles / Game / Plugins / External / Help).
 */
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
  } = useMainMenuBar();

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside the menu bar
  React.useEffect(() => {
    const handleWindowClick = (ev: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;

      // If click is inside the menu bar, ignore
      if (ev.target instanceof Node && root.contains(ev.target)) {
        return;
      }

      closeAllMenus();
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [closeAllMenus]);

  return (
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
          <div className={styles.subMenuItem}>Open Shattered Archive</div>
          <div className={styles.subMenuItem}>Sync Data</div>
          <div className={styles.subMenuItem}>Load Data</div>
        </div>
      </div>

      {/* Help */}
      <div className={`${styles.menuItem} ${styles.menuItemHasSubmenu}`} onClick={() => toggleRootMenu('Help')}>
        Help
        <div className={`${styles.subMenu} ${openRootMenu === 'Help' ? styles.subMenuOpen : ''}`}>
          <div className={styles.subMenuItem}>About</div>
          <div className={styles.subMenuItem}>Sponsor</div>
          <div className={styles.subMenuItem}>Report Bug</div>
          <div className={styles.subMenuItem}>Request Feature</div>
        </div>
      </div>
    </div>
  );
};
