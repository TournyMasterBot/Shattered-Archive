// apps/game-client/src/components/simulacrumAdmin/CommandsTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { buildCommand, type FieldValues } from '../../features/simulacrumAdmin/commandBuilder';
import { COMMAND_CATALOG, GROUP_LABELS, GROUP_ORDER, type CatalogCommand } from '../../features/simulacrumAdmin/commandCatalog';
import type { FormSpec } from '../../features/simulacrumAdmin/commandSyntaxTypes';
import type { RunOutcome, Sender } from '../../features/simulacrumAdmin/sender';
import ConfirmDialog from './ConfirmDialog';
import FieldInput from './FieldInput';
import OutcomeView from './OutcomeView';
import { useConfirmation } from './useConfirmation';

interface CommandsTabProps {
  sender: Sender;
  /** False while another tab is showing: the tab stays mounted (selection, typed values and result survive) but draws nothing. */
  visible?: boolean;
}

const LEVELS = [...new Set(COMMAND_CATALOG.map((c) => c.level))].sort((a, b) => a - b);

function isAvailable(command: CatalogCommand, available: ReadonlySet<string> | undefined): boolean {
  return available === undefined || available.has(command.name) || command.aliases.some((a) => available.has(a));
}

const CommandsTab: React.FC<CommandsTabProps> = ({ sender, visible = true }) => {
  const available = React.useSyncExternalStore(sender.subscribe, sender.getAvailable);
  const [filter, setFilter] = React.useState('');
  const [maxLevel, setMaxLevel] = React.useState('');
  const [selectedName, setSelectedName] = React.useState<string | undefined>();
  const [formChoice, setFormChoice] = React.useState<Record<string, string>>({});
  const [values, setValues] = React.useState<Record<string, Record<string, string>>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{ key: string; outcome: RunOutcome } | undefined>();
  const [availability, setAvailability] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const question = useConfirmation();
  const baseId = React.useId();

  const listed = React.useMemo(() => {
    if (!visible) return [];
    const needle = filter.trim().toLowerCase();
    const limit = maxLevel === '' ? Infinity : Number(maxLevel);
    return COMMAND_CATALOG.filter(
      (c) =>
        c.level <= limit &&
        (needle === '' ||
          c.name.includes(needle) ||
          c.aliases.some((a) => a.includes(needle)) ||
          c.syntax.summary.toLowerCase().includes(needle)),
    );
  }, [visible, filter, maxLevel]);

  const selected = COMMAND_CATALOG.find((c) => c.name === selectedName);
  const form = selected ? (selected.syntax.forms.find((f) => f.id === formChoice[selected.name]) ?? selected.syntax.forms[0]) : undefined;
  const valueKey = selected && form ? `${selected.name}/${form.id}` : '';
  const current: FieldValues = values[valueKey] ?? {};
  const built = selected && form ? buildCommand(selected, form, current) : undefined;
  const builtError = built && 'error' in built ? built.error : undefined;
  const outcome = result?.key === valueKey ? result.outcome : undefined;

  const run = async (command: CatalogCommand, formSpec: FormSpec): Promise<void> => {
    setAttempted(true);
    setRunning(true);
    const key = valueKey;
    const outcomeOfRun = await sender.run(command.name, formSpec.id, current, { confirm: question.confirm });
    setResult({ key, outcome: outcomeOfRun });
    setRunning(false);
  };

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    const answer = await sender.refreshAvailable();
    setRefreshing(false);
    if (answer.verdict === 'refused') setAvailability('The game answered Huh?: this character can run none of these commands.');
    else if (answer.verdict === 'unknown') setAvailability('The game did not answer: the list was not changed.');
    else setAvailability(`${answer.names.length} commands are available to this character; the others are dimmed.`);
  };

  if (!visible) return null;
  return (
    <div className={styles.commands}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.input}
          placeholder="Filter commands"
          aria-label="Filter commands"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className={styles.select} aria-label="Filter by level" value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)}>
          <option value="">Any level</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              Level {level} or lower
            </option>
          ))}
        </select>
        <button type="button" className={styles.smallButton} onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Asking…' : 'Refresh available commands'}
        </button>
      </div>
      {availability !== '' && (
        <p className={styles.counts} role="status">
          {availability}
        </p>
      )}

      <div className={styles.commandsSplit}>
        <div className={styles.commandList} role="listbox" aria-label="Commands">
          {listed.length === 0 && <p className={styles.empty}>No command matches.</p>}
          {GROUP_ORDER.map((group) => {
            const inGroup = listed.filter((c) => c.syntax.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} role="group" aria-label={GROUP_LABELS[group]}>
                <div className={styles.groupHeading}>{GROUP_LABELS[group]}</div>
                {inGroup.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    role="option"
                    aria-selected={c.name === selectedName}
                    className={styles.commandButton}
                    data-dimmed={!isAvailable(c, available)}
                    title={isAvailable(c, available) ? c.syntax.summary : 'Not in the list this character got from wizhelp'}
                    onClick={() => {
                      setSelectedName(c.name);
                      setAttempted(false);
                    }}
                  >
                    <span className={styles.commandName}>{c.name}</span>
                    {c.syntax.destructive && <span className={styles.badgeWarn}>asks first</span>}
                    <span className={styles.size}>L{c.level}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className={styles.commandForm} aria-label="Command form">
          {!selected || !form || !built ? (
            <p className={styles.empty}>Pick a command to see what it does and fill in its arguments.</p>
          ) : (
            <>
              <div className={styles.toolbar}>
                <strong>{selected.name}</strong>
                {selected.aliases.length > 0 && <span className={styles.size}>also {selected.aliases.join(', ')}</span>}
                <span className={styles.spacer} />
                <span className={styles.size}>Level {selected.level}</span>
              </div>
              <p className={styles.summary}>{selected.syntax.summary}</p>
              {!isAvailable(selected, available) && (
                <p className={styles.notice}>This character’s wizhelp does not list this command, so the game will probably answer Huh?.</p>
              )}

              {selected.syntax.forms.length > 1 && (
                <div className={styles.toolbar} role="radiogroup" aria-label="Form">
                  {selected.syntax.forms.map((f) => (
                    <label key={f.id} className={styles.radio}>
                      <input
                        type="radio"
                        name={`${baseId}-form`}
                        checked={f.id === form.id}
                        onChange={() => {
                          setFormChoice((all) => ({ ...all, [selected.name]: f.id }));
                          setAttempted(false);
                        }}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              )}

              {form.fields.map((field) => {
                const text = current[field.id] ?? '';
                const error = builtError?.field === field.id && (text.trim() !== '' || attempted) ? builtError.message : undefined;
                return (
                  <FieldInput
                    key={field.id}
                    id={`${baseId}-${field.id}`}
                    field={field}
                    value={text}
                    error={error}
                    onChange={(value) => setValues((all) => ({ ...all, [valueKey]: { ...all[valueKey], [field.id]: value } }))}
                  />
                );
              })}

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
                  onClick={() => run(selected, form)}
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

export default CommandsTab;
