// apps/game-client/src/components/SimulacrumAdminWindow.tsx
import React from 'react';
import styles from '../styles/SimulacrumAdminWindow.module.scss';
import { getSimulacrumAdminRuntime, type SimulacrumAdminRuntime } from '../features/simulacrumAdmin/loader';
import type { ConnectionState } from '../features/simulacrumAdmin/runtime';
import { TABS, type TabId } from '../features/simulacrumAdmin/tabs';
import { useWorldIndex } from '../features/simulacrumAdmin/useWorldIndex';
import { readWorldBaseFrom } from '../features/simulacrumAdmin/worldConfig';
import { useFloatingPanel } from '../hooks/useFloatingPanel';
import { useWindowLayer } from '../hooks/useWindowLayer';
import ActivityTab from './simulacrumAdmin/ActivityTab';
import CommandsTab from './simulacrumAdmin/CommandsTab';
import GmcpTab from './simulacrumAdmin/GmcpTab';
import PlayersTab from './simulacrumAdmin/PlayersTab';
import ServerTab from './simulacrumAdmin/ServerTab';
import WorldTab from './simulacrumAdmin/WorldTab';

// Narrower than this the header (title, connection, close) no longer fits.
const LIMITS = { minWidth: 420, minHeight: 260 } as const;
// Starts on the left so it does not sit on top of the Copilot window, which opens at the top right.
const INITIAL = { width: 560, height: 440, x: 24, y: 96 } as const;

interface SimulacrumAdminHostProps {
  isOpen: boolean;
  onClose: () => void;
  /** Told whenever the client enters or leaves the simulacrum, so the page can show or hide the menu entry. */
  onAvailableChange: (available: boolean) => void;
  /** Tests give their own; the page uses the shared runtime. */
  runtime?: SimulacrumAdminRuntime;
}

/**
 * The page's one mount point for Simulacrum Admin: always rendered in a flagged build (it loads lazily), shows nothing until the client is
 * on the simulacrum and the owner opens it, and closes the window the moment the connection leaves the simulacrum (E2).
 * Reached only through a lazy import behind `__SIMULACRUM_ADMIN_LOCAL__`.
 */
const SimulacrumAdminHost: React.FC<SimulacrumAdminHostProps> = ({ isOpen, onClose, onAvailableChange, runtime: injected }) => {
  const runtime = React.useMemo(() => injected ?? getSimulacrumAdminRuntime(), [injected]);
  const state = React.useSyncExternalStore(runtime.connection.subscribe, runtime.connection.getState);

  React.useEffect(() => {
    onAvailableChange(state.active);
  }, [state.active, onAvailableChange]);
  // leaving the page's tree (a reload, a test) hides the menu entry rather than leaving it pointing at nothing
  React.useEffect(() => () => onAvailableChange(false), [onAvailableChange]);

  if (!isOpen || !state.active) return null;
  return <SimulacrumAdminWindow state={state} runtime={runtime} onClose={onClose} />;
};

const SimulacrumAdminWindow: React.FC<{ state: ConnectionState; runtime: SimulacrumAdminRuntime; onClose: () => void }> = ({
  state,
  runtime,
  onClose,
}) => {
  const [tab, setTab] = React.useState<TabId>('players');
  // shared by the Players tab (the target of every command) and the World tab (who "transfer" brings to the picked room)
  const [target, setTarget] = React.useState('');
  // the area list is read the first time the World tab or a room picker is opened, never for a window that does not need it
  const [worldWanted, setWorldWanted] = React.useState(false);
  const worldBase = React.useMemo(() => readWorldBaseFrom(window), []);
  const world = useWorldIndex({ base: worldBase, active: worldWanted });
  // the level from GMCP login_data; the character's name is never kept
  const character = React.useSyncExternalStore(runtime.character.subscribe, runtime.character.getState);
  const panel = useFloatingPanel({ storageKey: 'simulacrumAdmin.window.v1', initial: INITIAL, limits: LIMITS });
  const { x, y, width, height } = panel.geometry;

  const layer = useWindowLayer({ open: true, onEscape: onClose });
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className={styles.window}
      role="dialog"
      aria-label="Simulacrum Admin"
      onKeyDown={onKeyDown}
      onPointerDownCapture={layer.bringToFront}
      style={{ position: 'fixed', left: x, top: y, width, height, zIndex: layer.zIndex }}
    >
      <div className={styles.header} onPointerDown={panel.onHeaderPointerDown}>
        <span className={styles.title}>Simulacrum Admin</span>
        <span className={styles.connection} role="status">
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.connectionText}>
            Connected to {state.host}:{state.port}
          </span>
        </span>
        {/* its own element, not part of the shrinking connection text: the host name alone fills a narrow title bar */}
        {character.level !== undefined && <span className={styles.level}>Level {character.level}</span>}
        <button type="button" className={styles.close} aria-label="Close Simulacrum Admin" onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Simulacrum Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sa-admin-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`sa-admin-panel-${t.id}`}
            className={styles.tab}
            onClick={() => {
              setTab(t.id);
              if (t.id === 'world') setWorldWanted(true);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {/* every panel stays mounted: switching tabs only hides one and shows another, so nothing typed or scrolled is lost */}
        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`sa-admin-panel-${t.id}`}
            aria-labelledby={`sa-admin-tab-${t.id}`}
            className={styles.panel}
            hidden={tab !== t.id}
          >
            {t.id === 'players' && (
              <PlayersTab
                sender={runtime.sender}
                visible={tab === 'players'}
                target={target}
                onTargetChange={setTarget}
                world={world}
                onWorldNeeded={() => setWorldWanted(true)}
              />
            )}
            {t.id === 'world' && <WorldTab sender={runtime.sender} index={world} target={target} visible={tab === 'world'} />}
            {t.id === 'server' && (
              <ServerTab sender={runtime.sender} world={world} onWorldNeeded={() => setWorldWanted(true)} visible={tab === 'server'} />
            )}
            {t.id === 'gmcp' && <GmcpTab capture={runtime.gmcp} visible={tab === 'gmcp'} />}
            {t.id === 'commands' && <CommandsTab sender={runtime.sender} visible={tab === 'commands'} />}
            {t.id === 'activity' && <ActivityTab activity={runtime.activity} visible={tab === 'activity'} />}
          </div>
        ))}
      </div>

      <div className={styles.resize} onPointerDown={panel.onResizePointerDown} aria-hidden="true" title="Drag to resize" />
    </div>
  );
};

export default SimulacrumAdminHost;
