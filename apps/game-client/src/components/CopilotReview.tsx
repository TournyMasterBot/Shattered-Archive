// apps/game-client/src/components/CopilotReview.tsx
import React from 'react';
import type { Suggestion } from '@shatteredarchive/copilot-core';
import styles from '../styles/CopilotWindow.module.scss';
import type { CopilotApi } from '../features/copilot/api';
import { createAutoApprover, type AutoApprover, type AutoResult } from '../features/copilot/autoApprove';
import type { FocusStore } from '../features/copilot/focus';
import type { CommandGate } from '../features/copilot/gate';
import { REFUSAL_TEXT, WHY_MAX, checkWhy, createReviewer, type ReviewLogEntry, type ReviewResult } from '../features/copilot/review';
import type { SettingsStore } from '../features/copilot/settings';
import { useSuggestions } from '../features/copilot/useSuggestions';

const LOG_KEEP = 50;

interface CopilotReviewProps {
  api: CopilotApi;
  gate: CommandGate;
  /** The owner's rules: a suggestion an enabled rule allows is run by itself while this list is open (and the focus is the AI agent). */
  settings: SettingsStore;
  /** Training: nothing runs by itself. AI agent: the rules above decide. */
  focus: FocusStore;
  /** Poll period, for tests. */
  intervalMs?: number;
}

type Panel = 'none' | 'correct' | 'reject';

function confidenceText(s: Suggestion): string {
  const source = s.confidenceSource === 'map-evidence' ? 'map evidence' : 'model';
  return s.confidence === null ? 'not rated' : `${Math.round(s.confidence * 100)}% (${source})`;
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

const ACTION_TEXT = { approved: 'Approved', corrected: 'Corrected', rejected: 'Rejected', auto: 'Auto' } as const;

function logLine(entry: ReviewLogEntry): string {
  const label = entry.action === 'auto' && entry.rule !== undefined ? `${ACTION_TEXT.auto} (${entry.rule})` : ACTION_TEXT[entry.action];
  if (entry.refused) return `${label}, not sent (${entry.refused}); waiting for you`;
  const what = entry.command !== undefined ? ` ${entry.command}` : '';
  return `${label}${what}${entry.recorded ? '' : ' (not recorded: server unreachable)'}`;
}

/**
 * The review list: each suggestion as a card the owner approves, corrects (command plus a short why) or rejects (why optional).
 * Answers go through `createReviewer`, so a command reaches the game only through the command gate. The buttons are disabled while
 * the server is unreachable: the list shown is then the last good one.
 */
const CopilotReview: React.FC<CopilotReviewProps> = ({ api, gate, settings, focus, intervalMs }) => {
  const view = useSuggestions(api, intervalMs);
  const abort = React.useRef(new AbortController());
  const approver = React.useRef<AutoApprover | undefined>(undefined);
  React.useEffect(() => {
    abort.current = new AbortController(); // a fresh one per mount: the previous is aborted by its cleanup
    const controller = abort.current;
    // closing the window aborts the signal, so nothing it had not yet sent is sent afterwards
    approver.current = createAutoApprover({ api, gate, settings: settings.get, focus: focus.get, signal: () => controller.signal });
    return () => {
      controller.abort();
      approver.current = undefined;
    };
  }, [api, gate, settings, focus]);
  // built when the owner answers (the signal is read then), never during render
  const reviewer = () => createReviewer({ api, gate, signal: () => abort.current.signal });

  const [log, setLog] = React.useState<ReviewLogEntry[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const dismiss = view.dismiss;

  // each suggestion that appears is looked at once by the policy; the approver remembers which it has seen
  React.useEffect(() => {
    for (const suggestion of view.suggestions) {
      void approver.current?.consider(suggestion).then((result: AutoResult) => {
        if (result.kind !== 'ran' && result.kind !== 'refused') return;
        setLog((current) => [result.entry, ...current].slice(0, LOG_KEEP));
        if (result.kind === 'ran') dismiss(suggestion.id); // it has run: it must not be approved a second time
      });
    }
  }, [view.suggestions, dismiss]);

  function finish(suggestion: Suggestion, result: ReviewResult): void {
    setLog((current) => [result.entry, ...current].slice(0, LOG_KEEP));
    if (!result.done) {
      setNotes((n) => ({ ...n, [suggestion.id]: REFUSAL_TEXT[result.refused] }));
      return;
    }
    if (result.entry.action === 'rejected' && !result.entry.recorded) {
      setNotes((n) => ({ ...n, [suggestion.id]: 'Could not reach the server: the rejection was not recorded.' }));
      return;
    }
    setNotes((n) => {
      const rest = { ...n };
      delete rest[suggestion.id];
      return rest;
    });
    view.dismiss(suggestion.id);
  }

  return (
    <div className={styles.review}>
      {view.stale && (
        <p className={styles.notice} role="alert">
          Server unreachable: showing the last list. Answers are paused.
        </p>
      )}
      <p className={styles.tickets}>Open tickets: {view.openTickets ?? 'unknown'}</p>

      {view.suggestions.length === 0 ? (
        <p className={styles.empty}>No suggestions yet.</p>
      ) : (
        <ul className={styles.cards} aria-label="Suggestions">
          {view.suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              disabled={view.stale}
              note={notes[s.id]}
              onApprove={() => reviewer().approve(s).then((r) => finish(s, r))}
              onCorrect={(command, why) => reviewer().correct(s, command, why).then((r) => finish(s, r))}
              onReject={(why) => reviewer().reject(s, why).then((r) => finish(s, r))}
            />
          ))}
        </ul>
      )}

      <section className={styles.log} aria-label="Session log">
        <h3 className={styles.logTitle}>Session log ({log.length})</h3>
        {log.length === 0 ? (
          <p className={styles.empty}>Nothing answered yet.</p>
        ) : (
          <ul className={styles.logList}>
            {log.map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                <time>{clock(entry.at)}</time> {logLine(entry)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

interface CardProps {
  suggestion: Suggestion;
  disabled: boolean;
  note: string | undefined;
  onApprove: () => Promise<void>;
  onCorrect: (command: string, why: string) => Promise<void>;
  onReject: (why: string) => Promise<void>;
}

const SuggestionCard: React.FC<CardProps> = ({ suggestion, disabled, note, onApprove, onCorrect, onReject }) => {
  const [panel, setPanel] = React.useState<Panel>('none');
  const [command, setCommand] = React.useState(suggestion.command);
  const [why, setWhy] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => void (mounted.current = false), []);

  const whyCheck = checkWhy(why, panel === 'correct');
  const commandOk = command.trim() !== '';

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await work();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <li className={styles.card} aria-label={`Suggestion ${suggestion.command}`}>
      <div className={styles.cardMeta}>
        <span className={styles.chip}>{suggestion.sphere}</span>
        <span className={styles.chip}>{suggestion.kind}</span>
        <span className={styles.confidence}>Confidence {confidenceText(suggestion)}</span>
      </div>
      <code className={styles.command}>{suggestion.command}</code>
      <p className={styles.rationale}>{suggestion.rationale}</p>
      <details className={styles.evidence}>
        <summary>Situation</summary>
        <span>{suggestion.situationKey}</span>
      </details>

      {panel === 'none' && (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={locked} onClick={() => void run(onApprove)}>
            Approve
          </button>
          <button type="button" className={styles.secondary} disabled={locked} onClick={() => setPanel('correct')}>
            Correct
          </button>
          <button type="button" className={styles.secondary} disabled={locked} onClick={() => setPanel('reject')}>
            Reject
          </button>
        </div>
      )}

      {panel !== 'none' && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!whyCheck.ok || locked) return;
            if (panel === 'correct') void run(() => onCorrect(command, whyCheck.value));
            else void run(() => onReject(whyCheck.value));
          }}
        >
          {panel === 'correct' && (
            <label className={styles.field}>
              <span>Command to send instead</span>
              <input className={styles.input} value={command} maxLength={200} onChange={(e) => setCommand(e.target.value)} />
            </label>
          )}
          <label className={styles.field}>
            <span>{panel === 'correct' ? 'Why (required)' : 'Why (optional)'}</span>
            <textarea
              className={styles.textarea}
              value={why}
              rows={3}
              placeholder={panel === 'correct' ? 'What should it have done, and why?' : 'Why is this wrong?'}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          <div className={styles.counter} data-over={why.trim().length > WHY_MAX || undefined}>
            {why.trim().length}/{WHY_MAX}
            {!whyCheck.ok && why !== '' && <span role="alert"> {whyCheck.message}</span>}
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={locked || !whyCheck.ok || (panel === 'correct' && !commandOk)}>
              {panel === 'correct' ? 'Send correction' : 'Reject'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setPanel('none');
                setWhy('');
                setCommand(suggestion.command);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {note !== undefined && (
        <p className={styles.cardNote} role="alert">
          {note}
        </p>
      )}
    </li>
  );
};

export default CopilotReview;
