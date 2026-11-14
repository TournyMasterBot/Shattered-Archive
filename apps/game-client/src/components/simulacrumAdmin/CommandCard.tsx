// apps/game-client/src/components/simulacrumAdmin/CommandCard.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { buildCommand, type FieldValues } from '../../features/simulacrumAdmin/commandBuilder';
import type { CatalogCommand } from '../../features/simulacrumAdmin/commandCatalog';
import type { FieldSpec } from '../../features/simulacrumAdmin/commandSyntaxTypes';
import type { RunOutcome, Sender } from '../../features/simulacrumAdmin/sender';
import ConfirmDialog from './ConfirmDialog';
import FieldInput from './FieldInput';
import OutcomeView from './OutcomeView';
import { useConfirmation } from './useConfirmation';

interface CommandCardProps {
  command: CatalogCommand;
  sender: Sender;
  /** Values to pick from for a field instead of typing (the area files for `areload`). The builder still checks the value. */
  choicesFor?: (field: FieldSpec) => readonly string[] | undefined;
  /** Shown under the fields (for example a button that loads the choices). */
  extra?: React.ReactNode;
}

/**
 * One command as a self-contained card: its forms, its fields, the exact line, Run, the confirmation and the game's answer. Used where a
 * command is a fixed place in the UI (the Server tab) rather than something picked from the whole catalog.
 */
const CommandCard: React.FC<CommandCardProps> = ({ command, sender, choicesFor, extra }) => {
  const [open, setOpen] = React.useState(false);
  const [formIndex, setFormIndex] = React.useState(0);
  const [values, setValues] = React.useState<Record<string, Record<string, string>>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{ key: string; outcome: RunOutcome } | undefined>();
  const question = useConfirmation();
  const baseId = React.useId();

  const form = command.syntax.forms[formIndex];
  const key = `${command.name}/${form.id}`;
  const current: FieldValues = values[form.id] ?? {};
  const built = buildCommand(command, form, current);
  const builtError = 'error' in built ? built.error : undefined;
  const outcome = result?.key === key ? result.outcome : undefined;

  const run = async (): Promise<void> => {
    setAttempted(true);
    setRunning(true);
    const ran = await sender.run(command.name, form.id, current, { confirm: question.confirm });
    setResult({ key, outcome: ran });
    setRunning(false);
  };

  return (
    <section className={styles.card} aria-label={command.name}>
      <button type="button" className={styles.cardHeader} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <strong>{command.name}</strong>
        {command.syntax.destructive && <span className={styles.badgeWarn}>asks first</span>}
        <span className={styles.spacer} />
        <span className={styles.size}>L{command.level}</span>
      </button>
      {open && (
        <div className={styles.cardBody}>
          <p className={styles.summary}>{command.syntax.summary}</p>
          {command.syntax.forms.length > 1 && (
            <div className={styles.toolbar} role="radiogroup" aria-label="Form">
              {command.syntax.forms.map((f, index) => (
                <label key={f.id} className={styles.radio}>
                  <input
                    type="radio"
                    name={`${baseId}-form`}
                    checked={f.id === form.id}
                    onChange={() => {
                      setFormIndex(index);
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
            const choices = choicesFor?.(field);
            const shown: FieldSpec = choices ? { ...field, type: 'choice', choices } : field;
            return (
              <FieldInput
                key={field.id}
                id={`${baseId}-${field.id}`}
                field={shown}
                value={text}
                error={error}
                onChange={(value) => setValues((all) => ({ ...all, [form.id]: { ...all[form.id], [field.id]: value } }))}
              />
            );
          })}
          {extra}
          <div className={styles.previewRow}>
            <span className={styles.fieldLabel}>Will send</span>
            <code className={styles.preview} aria-label={`Line to send: ${command.name}`}>
              {'line' in built ? built.line : '…'}
            </code>
          </div>
          <div className={styles.toolbar}>
            <button type="button" className={styles.runButton} onClick={run} disabled={running || question.pending !== undefined}>
              {running && !question.pending ? 'Waiting for the game…' : 'Run'}
            </button>
          </div>
          {question.pending && <ConfirmDialog request={question.pending} onAnswer={question.answer} />}
          {outcome && <OutcomeView outcome={outcome} />}
        </div>
      )}
    </section>
  );
};

export default CommandCard;
