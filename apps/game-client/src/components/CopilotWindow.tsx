// apps/game-client/src/components/CopilotWindow.tsx
import React from 'react';
import type { Mode } from '@shatteredarchive/copilot-core';
import styles from '../styles/CopilotWindow.module.scss';
import CopilotFocus from './CopilotFocus';
import CopilotHelp from './CopilotHelp';
import CopilotReview from './CopilotReview';
import CopilotSettings from './CopilotSettings';
import HelpInfoButton from './HelpInfoButton';
import { createCopilotApi } from '../features/copilot/api';
import { resolveApiBase } from '../features/copilot/config';
import type { EnabledStore } from '../features/copilot/enabled';
import type { FocusStore } from '../features/copilot/focus';
import type { CommandGate } from '../features/copilot/gate';
import { getCopilotRuntime } from '../features/copilot/loader';
import { MODES, MODE_LABELS, loadMode, saveMode } from '../features/copilot/mode';
import type { SettingsStore } from '../features/copilot/settings';
import { useServerStatus, type ServerStatus } from '../features/copilot/useServerStatus';
import { useTraining } from '../features/copilot/useTraining';
import { useFloatingPanel } from '../hooks/useFloatingPanel';
import { useWindowLayer } from '../hooks/useWindowLayer';

interface CopilotWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tests give their own; the page uses the shared runtime's gate. */
  gate?: CommandGate;
  /** Likewise for the settings store (the page's one is kept in step with other tabs). */
  settings?: SettingsStore;
  /** Likewise for the on/off switch. */
  enabled?: EnabledStore;
  /** Likewise for the focus (Training or AI agent). */
  focus?: FocusStore;
}

type Tab = 'review' | 'settings';

const STATUS_TEXT: Record<ServerStatus, string> = {
  off: 'Off',
  checking: 'Checking…',
  online: 'Online',
  stale: 'Online, game quiet',
  offline: 'Offline',
};

// Narrower than this the header (title, mode, status, close) no longer fits.
const LIMITS = { minWidth: 360, minHeight: 220 } as const;
const INITIAL = { width: 420, height: 360 } as const;

/**
 * The Copilot window: movable and resizable, with no backdrop, no focus trap and no modal semantics, so the game and its command
 * input stay usable behind it. It takes its place in the shared window stack (the last window opened, dragged or clicked is on top, and
 * Escape closes the top one). Only the window itself takes pointer events. Reached only through a lazy import behind `__COPILOT_LOCAL__`.
 */
const CopilotWindow: React.FC<CopilotWindowProps> = ({ isOpen, onClose, gate, settings, enabled, focus }) => {
  if (!isOpen) return null;
  return <OpenWindow onClose={onClose} gate={gate} settings={settings} enabled={enabled} focus={focus} />;
};

const OpenWindow: React.FC<{
  onClose: () => void;
  gate?: CommandGate;
  settings?: SettingsStore;
  enabled?: EnabledStore;
  focus?: FocusStore;
}> = ({ onClose, gate: injected, settings: injectedSettings, enabled: injectedEnabled, focus: injectedFocus }) => {
  // the API address is read each time the window opens (a changed override applies without a reload) ...
  const api = React.useMemo(() => createCopilotApi({ baseUrl: resolveApiBase(safeStorage()) }), []);
  // ... but the gate and the settings are the page's: the gate has been listening to the user's typing and Autopilot's status, and the
  // settings have been following other tabs, since the page loaded
  const gate = React.useMemo(() => injected ?? getCopilotRuntime().gate, [injected]);
  const settings = React.useMemo(() => injectedSettings ?? getCopilotRuntime().settings, [injectedSettings]);
  const enabledStore = React.useMemo(() => injectedEnabled ?? getCopilotRuntime().enabled, [injectedEnabled]);
  const focusStore = React.useMemo(() => injectedFocus ?? getCopilotRuntime().focus, [injectedFocus]);
  // Copilot starts OFF; while it is off nothing below the header is mounted, so nothing is requested, suggested or sent
  const on = React.useSyncExternalStore(enabledStore.subscribe, enabledStore.get);
  const [tab, setTab] = React.useState<Tab>('review');
  // the help (the blue i) replaces the body while it is open; what is behind it stays mounted, so auto-approval keeps working
  const [helpOpen, setHelpOpen] = React.useState(false);
  // While the switch is on, the server must be learning: a restarted server starts with learning off, and the poll says so
  const status = useServerStatus(api, undefined, on, (state) => {
    if (state.learning === false) void api.setLearning(true, new AbortController().signal);
  });
  // Claude training: the server says whether it is on and whether the connection is the Simulacrum's; the window only shows it
  const training = useTraining(api, on);
  const [mode, setMode] = React.useState<Mode>(() => loadMode(safeStorage()));
  const panel = useFloatingPanel({ storageKey: 'copilot.window.v1', initial: INITIAL, limits: LIMITS });
  const { x, y, width, height } = panel.geometry;

  // Escape closes the help first, then the window; the same from the stack (the focus anywhere on the page) as from inside the window
  const escape = (): void => {
    if (helpOpen) setHelpOpen(false);
    else onClose();
  };
  const layer = useWindowLayer({ open: true, onEscape: escape });
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      escape();
    }
  };

  return (
    <div
      className={styles.window}
      role="dialog"
      aria-label="Copilot"
      onKeyDown={onKeyDown}
      onPointerDownCapture={layer.bringToFront}
      style={{ position: 'fixed', left: x, top: y, width, height, zIndex: layer.zIndex }}
    >
      <div className={styles.header} onPointerDown={panel.onHeaderPointerDown}>
        <span className={styles.title}>Copilot</span>
        <HelpInfoButton topic="Copilot" open={helpOpen} onToggle={() => setHelpOpen((o) => !o)} />
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Copilot"
          className={styles.switch}
          onClick={() => {
            const next = !on;
            enabledStore.set(next);
            void api.setLearning(next, new AbortController().signal); // the server reads the game logs only while the switch is on
          }}
        >
          <span className={styles.knob} aria-hidden="true" />
          {on ? 'On' : 'Off'}
        </button>
        {on && (
          <label className={styles.modeLabel}>
            <span className={styles.visuallyHidden}>Mode</span>
            <select
              className={styles.modeSelect}
              value={mode}
              onChange={(e) => {
                const next = e.target.value as Mode;
                setMode(next);
                saveMode(safeStorage(), next);
              }}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        {on && (
          <span className={styles.status} data-status={status} role="status">
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.statusText}>{STATUS_TEXT[status]}</span>
          </span>
        )}
        <button type="button" className={styles.close} aria-label="Close Copilot" onClick={onClose}>
          ×
        </button>
      </div>

      {on && training.status?.enabled && (
        <p className={styles.trainingBanner} role="status" aria-label="Claude training is on">
          <strong>Claude is training Copilot</strong> on the Simulacrum. Its answers are kept apart from yours and never
          reach the game you play for real.
        </p>
      )}

      <div className={styles.body}>
        {helpOpen && <CopilotHelp onBack={() => setHelpOpen(false)} />}
        <div hidden={helpOpen}>
          {!on && (
            <div className={styles.offBody}>
              <p>
                <strong>Copilot is off.</strong> Nothing is requested from the Copilot server, no suggestions arrive,
                and nothing is sent to the game.
              </p>
              <p>
                Use the switch in the header when you want it on. It stays off in this browser until you do. The blue
                (i) next to the title explains what Copilot does.
              </p>
            </div>
          )}
          {on && (
            <>
              <CopilotFocus focus={focusStore} />
              <div className={styles.tabs} role="group" aria-label="Copilot sections">
                <button
                  type="button"
                  className={styles.tab}
                  aria-pressed={tab === 'review'}
                  onClick={() => setTab('review')}
                >
                  Suggestions
                </button>
                <button
                  type="button"
                  className={styles.tab}
                  aria-pressed={tab === 'settings'}
                  onClick={() => setTab('settings')}
                >
                  Settings
                </button>
              </div>
              {status === 'offline' && (
                <p className={styles.empty}>
                  The Copilot server cannot be reached. No new suggestions arrive and nothing is sent.
                </p>
              )}
              {/* the list stays mounted behind the settings: auto-approval keeps working while the owner adjusts a rule */}
              <div hidden={tab !== 'review'}>
                <CopilotReview api={api} gate={gate} settings={settings} focus={focusStore} />
              </div>
              {tab === 'settings' && <CopilotSettings api={api} settings={settings} training={training} />}
            </>
          )}
        </div>
      </div>

      <div
        className={styles.resize}
        onPointerDown={panel.onResizePointerDown}
        aria-hidden="true"
        title="Drag to resize"
      />
    </div>
  );
};

function safeStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export default CopilotWindow;
