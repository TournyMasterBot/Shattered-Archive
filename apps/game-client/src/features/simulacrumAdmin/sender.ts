import { DispatchEvent } from '../event-emitter/event-dispatcher';
import type { ActivityEntry, ActivityLog } from './activityLog';
import { buildCommand, type BuildError, type FieldValues } from './commandBuilder';
import { findCatalogCommand } from './commandCatalog';
import { needsConfirmation } from './confirmPolicy';
import type { ReplyCollector } from './replyCollector';
import { PROMPT_LINE, judge, type Verdict } from './verdict';

export interface ConfirmRequest {
  command: string;
  /** The exact line that will be sent. */
  line: string;
  /** What is at stake, in words for the owner. */
  scope: string;
}

export interface RunOptions {
  /** Called when the policy asks for it. A missing callback or a `false` answer sends nothing. */
  confirm?: (request: ConfirmRequest) => boolean | Promise<boolean>;
}

export type RunOutcome =
  /** Not connected to the simulacrum (now, or by the time the send's turn came): nothing was sent (E3). */
  | { status: 'inactive' }
  | { status: 'invalid'; error: BuildError }
  | { status: 'declined' }
  | { status: 'sent'; entry: ActivityEntry };

export interface AvailableResult {
  verdict: Verdict;
  /** Command names the character can run, from the game's own `wizhelp`. */
  names: string[];
}

export interface Sender {
  run(commandName: string, formId: string, values: FieldValues, options?: RunOptions): Promise<RunOutcome>;
  /** Sends `wizhelp` and keeps the names; the Commands tab dims what is not in the list (S5). */
  refreshAvailable(): Promise<AvailableResult>;
  /** Undefined until a `wizhelp` has been answered (nothing is dimmed then). */
  getAvailable(): ReadonlySet<string> | undefined;
  subscribe(listener: () => void): () => void;
  /** Forgets the `wizhelp` answer (the connection ended). */
  clearAvailable(): void;
}

export interface SenderDeps {
  isActive: () => boolean;
  collector: ReplyCollector;
  activity: ActivityLog;
  /** Defaults to `shatteredarchive:send-command`. Injectable for tests only. */
  dispatch?: (cmd: string) => void;
  now?: () => string;
}

const defaultDispatch = (cmd: string): void => DispatchEvent('shatteredarchive:send-command', { cmd });

/**
 * The ONLY code in this feature that dispatches `shatteredarchive:send-command` (S6): one place for the connection check, the
 * confirmation, the line building and the wait for the game's reply. Sends run one at a time (E24): a second `run` waits for the first
 * reply, so two replies are never mixed.
 */
export function createSender(deps: SenderDeps): Sender {
  const dispatch = deps.dispatch ?? defaultDispatch;
  const now = deps.now ?? (() => new Date().toISOString());
  let tail: Promise<unknown> = Promise.resolve();
  let available: ReadonlySet<string> | undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  /** Sends one already-checked line and records the outcome; undefined when the connection is no longer the simulacrum. */
  const sendLine = (line: string, success: readonly RegExp[]): Promise<ActivityEntry | undefined> => {
    const job = tail.then(async () => {
      if (!deps.isActive()) return undefined; // the turn came after a disconnect (E3)
      const pending = deps.collector.begin();
      const at = now();
      try {
        dispatch(line);
      } catch (error) {
        deps.collector.cancel(); // do not leave the collector waiting for a reply to a line that never left
        throw error;
      }
      const reply = await pending;
      if (!deps.isActive()) return undefined; // the connection ended while waiting: nothing of it is kept (E2)
      // the prompt the game prints after every command is not part of the answer; the raw text keeps it
      const lines = reply.lines.filter((l) => !PROMPT_LINE.test(l.trim()));
      const judgement = judge(lines, success);
      return deps.activity.add({
        at,
        line,
        verdict: judgement.verdict,
        ...(judgement.reason !== undefined ? { reason: judgement.reason } : {}),
        replyLines: lines,
        rawReply: reply.rawText,
      });
    });
    tail = job.catch(() => undefined);
    return job;
  };

  return {
    async run(commandName, formId, values, options = {}) {
      if (!deps.isActive()) return { status: 'inactive' };
      const command = findCatalogCommand(commandName);
      const form = command?.syntax.forms.find((f) => f.id === formId);
      if (!command || !form) {
        return { status: 'invalid', error: { field: 'line', message: `Unknown command form: ${commandName} ${formId}.` } };
      }
      const built = buildCommand(command, form, values);
      if ('error' in built) return { status: 'invalid', error: built.error };
      const policy = needsConfirmation(command, form, values);
      if (policy.required) {
        const accepted = options.confirm ? await options.confirm({ command: command.name, line: built.line, scope: policy.scope }) : false;
        if (!accepted) return { status: 'declined' };
      }
      const entry = await sendLine(built.line, form.success ?? command.syntax.success ?? []);
      return entry ? { status: 'sent', entry } : { status: 'inactive' };
    },

    async refreshAvailable() {
      const entry = await sendLine('wizhelp', [/\S/]);
      if (!entry) return { verdict: 'unknown', names: [] };
      // A character below the immortal levels gets "Huh?": it can run none of them.
      const names =
        entry.verdict === 'refused'
          ? []
          : entry.replyLines
              .filter((l) => !PROMPT_LINE.test(l.trim()))
              .flatMap((l) => l.trim().split(/\s+/))
              .filter((w) => /^[a-z:]+$/.test(w));
      if (entry.verdict !== 'unknown') {
        available = new Set(names);
        notify();
      }
      return { verdict: entry.verdict, names };
    },

    getAvailable: () => available,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clearAvailable() {
      if (available === undefined) return;
      available = undefined;
      notify();
    },
  };
}
