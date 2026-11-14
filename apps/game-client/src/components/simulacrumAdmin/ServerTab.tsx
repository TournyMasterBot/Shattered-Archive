// apps/game-client/src/components/simulacrumAdmin/ServerTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { commandsInGroup, type CatalogCommand } from '../../features/simulacrumAdmin/commandCatalog';
import type { Sender } from '../../features/simulacrumAdmin/sender';
import type { WorldIndex } from '../../features/simulacrumAdmin/useWorldIndex';
import CommandCard from './CommandCard';

interface ServerTabProps {
  sender: Sender;
  /** The shared world index: `areload` offers the area files from it. */
  world: WorldIndex;
  /** Asks the window to start reading the world (the first time the area files are wanted). */
  onWorldNeeded: () => void;
  /** False while another tab is showing: stays mounted and hidden (open cards, typed values and answers survive). */
  visible?: boolean;
}

/** The commands people reach for first sit first; everything else follows by name, so a new server command still appears (derived from the catalog group). */
const FIRST = ['areload', 'copyover', 'reboot', 'shutdown', 'wizlock', 'newlock'];
const rank = (c: CatalogCommand): number => {
  const i = FIRST.indexOf(c.name);
  return i === -1 ? FIRST.length : i;
};
const ordered = (commands: CatalogCommand[]): CatalogCommand[] =>
  [...commands].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

const SERVER = ordered(commandsInGroup('server'));
const SETTINGS = ordered(commandsInGroup('settings'));

const ServerTab: React.FC<ServerTabProps> = ({ sender, world, onWorldNeeded, visible = true }) => {
  const files = world.areas.status === 'ready' ? world.areas.data.filter((a) => !a.parseError).map((a) => a.file) : undefined;

  // not removed while hidden: each card keeps its own open state, typed values and answer
  return (
    <div className={styles.commands} hidden={!visible}>
      <p className={styles.counts}>
        Server-wide commands. Each card states what it does and its level; the ones that change a player or the whole server ask first, and the
        game’s own answer decides whether it is shown as done.
      </p>

      <h3 className={styles.groupHeading}>Server</h3>
      {SERVER.map((command) => (
        <CommandCard
          key={command.name}
          command={command}
          sender={sender}
          choicesFor={command.name === 'areload' && files ? () => files : undefined}
          extra={
            command.name === 'areload' && !files ? (
              <div className={styles.toolbar}>
                <button type="button" className={styles.smallButton} onClick={onWorldNeeded}>
                  Load the area list
                </button>
                <span className={styles.size}>{world.areas.status === 'loading' ? 'Loading…' : 'Or type the file name.'}</span>
              </div>
            ) : undefined
          }
        />
      ))}

      <h3 className={styles.groupHeading}>My immortal settings</h3>
      {SETTINGS.map((command) => (
        <CommandCard key={command.name} command={command} sender={sender} />
      ))}
    </div>
  );
};

export default ServerTab;
