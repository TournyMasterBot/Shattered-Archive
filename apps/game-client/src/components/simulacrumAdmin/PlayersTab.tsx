// apps/game-client/src/components/simulacrumAdmin/PlayersTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { buildCommand, type FieldValues } from '../../features/simulacrumAdmin/commandBuilder';
import { COMMAND_CATALOG, type CatalogCommand } from '../../features/simulacrumAdmin/commandCatalog';
import type { FormSpec, PlayerCategory } from '../../features/simulacrumAdmin/commandSyntaxTypes';
import type { RunOutcome, Sender } from '../../features/simulacrumAdmin/sender';
import type { WorldIndex } from '../../features/simulacrumAdmin/useWorldIndex';
import ConfirmDialog from './ConfirmDialog';
import FieldInput from './FieldInput';
import OutcomeView from './OutcomeView';
import RoomPicker from './RoomPicker';
import { useConfirmation } from './useConfirmation';

interface PlayersTabProps {
  sender: Sender;
  /** False while another tab is showing: stays mounted (target, selection and values survive) but draws nothing. */
  visible?: boolean;
  /** The target, when the window shares it with the World tab; the tab keeps its own when this is not given. */
  target?: string;
  onTargetChange?: (target: string) => void;
  /** The world index: with it, a destination field offers "Pick from the world". Reading it starts when the picker is first opened. */
  world?: WorldIndex;
  onWorldNeeded?: () => void;
}

interface PlayerAction {
  key: string;
  command: CatalogCommand;
  form: FormSpec;
  category: PlayerCategory;
  label: string;
}

const CATEGORY_ORDER: readonly PlayerCategory[] = ['inspect', 'restrict', 'punish', 'restore', 'move', 'advanced'];
const CATEGORY_LABELS: Readonly<Record<PlayerCategory, string>> = {
  inspect: 'Inspect',
  restrict: 'Restrict',
  punish: 'Punish',
  restore: 'Restore',
  move: 'Move',
  advanced: 'Advanced',
};
const MAX_RECENT = 8;


/** Every form the catalog lists for a targeted character, derived from the data so a new command appears without a code change. */
const ACTIONS: readonly PlayerAction[] = COMMAND_CATALOG.flatMap((command) => {
  const listed = command.syntax.forms.filter((f) => f.category !== undefined);
  return listed.map((form) => ({
    key: `${command.name}/${form.id}`,
    command,
    form,
    category: form.category as PlayerCategory,
    label: listed.length > 1 ? `${command.name}: ${form.label}` : command.name,
  }));
});

/** The categories that have at least one action, in display order. */
const CATEGORIES: readonly PlayerCategory[] = CATEGORY_ORDER.filter((c) => ACTIONS.some((a) => a.category === c));

const PlayersTab: React.FC<PlayersTabProps> = ({ sender, visible = true, target: sharedTarget, onTargetChange, world, onWorldNeeded }) => {
  const [ownTarget, setOwnTarget] = React.useState('');
  const target = sharedTarget ?? ownTarget;
  const setTarget = onTargetChange ?? setOwnTarget;
  const [picking, setPicking] = React.useState(false);
  const [pickedLabel, setPickedLabel] = React.useState<Record<string, string>>({});
  const [recent, setRecent] = React.useState<string[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string | undefined>();
  const [values, setValues] = React.useState<Record<string, Record<string, string>>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{ key: string; outcome: RunOutcome } | undefined>();
  const question = useConfirmation();
  const baseId = React.useId();

  const action = ACTIONS.find((a) => a.key === selectedKey);
  const targetField = action?.form.fields[0];
  const rest: FieldValues = (selectedKey && values[selectedKey]) || {};
  const built = action && targetField ? buildCommand(action.command, action.form, { ...rest, [targetField.id]: target }) : undefined;
  const builtError = built && 'error' in built ? built.error : undefined;
  const targetError = builtError && builtError.field === targetField?.id && (target.trim() !== '' || attempted) ? builtError.message : undefined;
  // a reply belongs to one command AND one target: changing either hides it
  const resultKey = `${selectedKey ?? ''}|${target.trim()}`;
  const outcome = result?.key === resultKey ? result.outcome : undefined;

  const run = async (chosen: PlayerAction, field: string): Promise<void> => {
    setAttempted(true);
    setRunning(true);
    const key = resultKey;
    const ran = await sender.run(chosen.command.name, chosen.form.id, { ...rest, [field]: target }, { confirm: question.confirm });
    setResult({ key, outcome: ran });
    setRunning(false);
    if (ran.status === 'sent') {
      const name = target.trim();
      setRecent((all) => [name, ...all.filter((n) => n !== name)].slice(0, MAX_RECENT));
    }
  };

  if (!visible) return null;
  return (
    <div className={styles.commands}>
      <div className={styles.fieldRow}>
        <label htmlFor={`${baseId}-target`} className={styles.fieldLabel}>
          Target
        </label>
        <input
          id={`${baseId}-target`}
          type="text"
          className={styles.input}
          value={target}
          placeholder="character name"
          aria-label="Target"
          aria-invalid={targetError !== undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setTarget(e.target.value);
            setAttempted(false);
          }}
        />
        {targetError && (
          <span className={styles.fieldError} role="alert">
            {targetError}
          </span>
        )}
      </div>
      {recent.length > 0 && (
        <div className={styles.toolbar} role="group" aria-label="Recent targets">
          <span className={styles.size}>Recent</span>
          {recent.map((name) => (
            <button key={name} type="button" className={styles.smallButton} aria-pressed={name === target.trim()} onClick={() => setTarget(name)}>
              {name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.commandsSplit}>
        <div className={styles.commandList} role="listbox" aria-label="Player commands">
          {CATEGORIES.map((category) => {
            return (
              <div key={category} role="group" aria-label={CATEGORY_LABELS[category]}>
                <div className={styles.groupHeading}>{CATEGORY_LABELS[category]}</div>
                {ACTIONS.filter((a) => a.category === category).map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="option"
                    aria-selected={a.key === selectedKey}
                    className={styles.commandButton}
                    title={a.command.syntax.summary}
                    onClick={() => {
                      setSelectedKey(a.key);
                      setAttempted(false);
                    }}
                  >
                    <span className={styles.commandName}>{a.label}</span>
                    {a.command.syntax.destructive && <span className={styles.badgeWarn}>asks first</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className={styles.commandForm} aria-label="Player command form">
          {!action || !targetField || !built ? (
            <p className={styles.empty}>Type a target, then pick what to do to them.</p>
          ) : (
            <>
              <div className={styles.toolbar}>
                <strong>{action.label}</strong>
                <span className={styles.spacer} />
                <span className={styles.size}>Level {action.command.level}</span>
              </div>
              <p className={styles.summary}>{action.command.syntax.summary}</p>
              {action.form.fields.slice(1).map((field) => {
                const text = rest[field.id] ?? '';
                const error = builtError?.field === field.id && (text.trim() !== '' || attempted) ? builtError.message : undefined;
                return (
                  <FieldInput
                    key={field.id}
                    id={`${baseId}-${field.id}`}
                    field={field}
                    value={text}
                    error={error}
                    onChange={(value) => {
                      setValues((all) => ({ ...all, [action.key]: { ...all[action.key], [field.id]: value } }));
                      if (field.id === 'where') setPickedLabel((all) => ({ ...all, [action.key]: '' })); // typed by hand: no longer the picked room
                    }}
                  />
                );
              })}
              {world && action.form.fields.some((f) => f.id === 'where') && (
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => {
                      onWorldNeeded?.();
                      setPicking((open) => !open);
                    }}
                  >
                    {picking ? 'Close the room picker' : 'Pick from the world…'}
                  </button>
                  {pickedLabel[action.key] && !picking && <span className={styles.size}>Destination: {pickedLabel[action.key]}</span>}
                </div>
              )}
              {world && picking && action.form.fields.some((f) => f.id === 'where') && (
                <RoomPicker
                  index={world}
                  onPick={(room) => {
                    setValues((all) => ({ ...all, [action.key]: { ...all[action.key], where: String(room.vnum) } }));
                    setPickedLabel((all) => ({ ...all, [action.key]: `${room.vnum} ${room.name} (${room.areaName ?? room.areaFile})` }));
                    setPicking(false);
                  }}
                />
              )}
              <div className={styles.previewRow}>
                <span className={styles.fieldLabel}>Will send</span>
                <code className={styles.preview} aria-label="Line to send">
                  {'line' in built ? built.line : '…'}
                </code>
              </div>
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={styles.runButton}
                  onClick={() => run(action, targetField.id)}
                  disabled={running || question.pending !== undefined}
                >
                  {running && !question.pending ? 'Waiting for the game…' : 'Run'}
                </button>
              </div>
              {question.pending && <ConfirmDialog request={question.pending} onAnswer={question.answer} />}
              {outcome && <OutcomeView outcome={outcome} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayersTab;
