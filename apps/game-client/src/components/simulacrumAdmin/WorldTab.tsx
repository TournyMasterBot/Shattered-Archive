// apps/game-client/src/components/simulacrumAdmin/WorldTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import type { RunOutcome, Sender } from '../../features/simulacrumAdmin/sender';
import type { WorldIndex } from '../../features/simulacrumAdmin/useWorldIndex';
import ConfirmDialog from './ConfirmDialog';
import OutcomeView from './OutcomeView';
import RoomPicker, { type PickedRoom } from './RoomPicker';
import { useConfirmation } from './useConfirmation';

interface WorldTabProps {
  sender: Sender;
  index: WorldIndex;
  /** The character typed on the Players tab; `transfer` brings them to the picked room. */
  target: string;
  /** False while another tab is showing: stays mounted (the picked room and filters survive) but draws nothing. */
  visible?: boolean;
}

const WorldTab: React.FC<WorldTabProps> = ({ sender, index, target, visible = true }) => {
  const [room, setRoom] = React.useState<PickedRoom | undefined>();
  const [inRoom, setInRoom] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [last, setLast] = React.useState<{ title: string; outcome: RunOutcome } | undefined>();
  const question = useConfirmation();

  const run = async (title: string, commandName: string, formId: string, values: Record<string, string>): Promise<void> => {
    setRunning(true);
    const outcome = await sender.run(commandName, formId, values, { confirm: question.confirm });
    setLast({ title, outcome });
    setRunning(false);
  };

  // E10: the game says no such room, so the index may be stale (an area was changed and reloaded since it was read)
  const stale =
    last?.outcome.status === 'sent' && last.outcome.entry.verdict === 'refused' && /No such location/i.test(last.outcome.entry.reason ?? '');
  const who = target.trim();
  const busy = running || question.pending !== undefined;

  if (!visible) return null;
  return (
    <div className={styles.commands}>
      <RoomPicker index={index} onPick={setRoom} picked={room?.vnum} />

      {room && (
        <div className={styles.commandForm} aria-label="Picked room">
          <div className={styles.toolbar}>
            <strong>
              {room.vnum} {room.name}
            </strong>
            <span className={styles.spacer} />
            <span className={styles.size}>{room.areaName ?? room.areaFile}</span>
          </div>

          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.smallButton}
              disabled={busy}
              onClick={() => run(`goto ${room.vnum}`, 'goto', 'run', { where: String(room.vnum) })}
            >
              Go there (goto {room.vnum})
            </button>
            <button
              type="button"
              className={styles.smallButton}
              disabled={busy}
              onClick={() => run(`violate ${room.vnum}`, 'violate', 'run', { where: String(room.vnum) })}
            >
              Go there even if private (violate {room.vnum})
            </button>
          </div>

          <div className={styles.fieldRow}>
            <label htmlFor="sa-world-at" className={styles.fieldLabel}>
              Run a command there
            </label>
            <input
              id="sa-world-at"
              type="text"
              className={styles.input}
              placeholder="look"
              value={inRoom}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setInRoom(e.target.value)}
            />
            <button
              type="button"
              className={styles.smallButton}
              disabled={busy}
              onClick={() => run(`at ${room.vnum} ${inRoom.trim()}`, 'at', 'run', { where: String(room.vnum), command: inRoom })}
            >
              Run (at {room.vnum} …)
            </button>
          </div>

          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.smallButton}
              disabled={busy || who === ''}
              onClick={() => run(`transfer ${who} ${room.vnum}`, 'transfer', 'run', { target: who, where: String(room.vnum) })}
            >
              {who === '' ? 'Bring the target here (set a target on the Players tab)' : `Bring ${who} here (transfer ${who} ${room.vnum})`}
            </button>
          </div>

          {question.pending && <ConfirmDialog request={question.pending} onAnswer={question.answer} />}
          {last && (
            <>
              <p className={styles.counts}>{last.title}</p>
              <OutcomeView outcome={last.outcome} />
            </>
          )}
          {stale && (
            <div className={styles.notice} role="alert">
              <p>The game does not know that room. The list may be out of date, for example after an area was changed and reloaded.</p>
              <button type="button" className={styles.smallButton} onClick={index.refresh}>
                Refresh the room list
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorldTab;
