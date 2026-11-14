// apps/game-client/src/components/CopilotSettings.tsx
import React from 'react';
import {
  ACTION_KINDS,
  FLOOR_KINDS,
  FLOOR_REASONS,
  MAX_STALE_SECONDS,
  MAX_THRESHOLD,
  MIN_BUCKET_SAMPLES,
  MIN_STALE_SECONDS,
  MIN_THRESHOLD,
  SPHERES,
  bucketStats,
  isNeverAuto,
  ruleFor,
  ruleKey,
  wilsonLower,
  type ActionKind,
  type BucketTable,
  type Sphere,
  type TrustRule,
  type TrustSettings,
} from '@shatteredarchive/copilot-core';
import styles from '../styles/CopilotWindow.module.scss';
import type { CopilotApi } from '../features/copilot/api';
import type { SettingsStore } from '../features/copilot/settings';
import { useBucketStats } from '../features/copilot/useBucketStats';
import type { TrainingState } from '../features/copilot/useTraining';

interface CopilotSettingsProps {
  api: CopilotApi;
  settings: SettingsStore;
  /** Poll period of the bucket counts, for tests. */
  intervalMs?: number;
  /** Claude training (the window's hook). Absent: the section is not shown. */
  training?: TrainingState;
}

const SPHERE_LABELS: Record<Sphere, string> = { world: 'World', fighting: 'Fighting', interaction: 'Interaction', things: 'Things' };

/** Only the kinds a rule can switch on; the others can never be automatic. */
const AUTO_KINDS = ACTION_KINDS.filter((kind) => !isNeverAuto(kind));

/** A label for every kind (the floor ones are listed under "Always asks you" by their own name). */
const KIND_LABELS: Record<ActionKind, string> = {
  move: 'Move',
  info: 'Look and check',
  interact: 'Interact',
  loot: 'Loot',
  ability: 'Ability',
  'fight-continue': 'Continue a fight',
  'fight-start-known': 'Start a fight (known target)',
  'fight-start-unknown': 'Start a fight (unknown target)',
  'spend-or-lose': 'Spend or lose',
  speak: 'Speak',
  irreversible: 'Irreversible',
  pk: 'Player kill',
  unknown: 'Unrecognised',
};

const KIND_NOTES: Partial<Record<ActionKind, string>> = {
  'fight-start-known': 'Copilot cannot read a target yet, so this still asks.',
};

/** The kinds that are never automatic although they are not on the hard floor, and why. */
const OTHER_NEVER: readonly { kind: ActionKind; reason: string }[] = [
  { kind: 'unknown', reason: 'A command Copilot does not recognise. It asks, and files a ticket.' },
  { kind: 'fight-start-unknown', reason: 'A fight against a target whose level, kill-ability or reason is not all known. It asks, and files a ticket.' },
];

function earnedText(table: BucketTable, sphere: Sphere, kind: ActionKind): string {
  const stats = bucketStats(table, sphere, kind);
  if (stats === undefined || stats.total === 0) return 'No answers yet';
  if (stats.total < MIN_BUCKET_SAMPLES) return `${stats.total} of ${MIN_BUCKET_SAMPLES} answers`;
  const earned = wilsonLower(stats.approved, stats.total) as number; // the counts were validated when they were read
  return `Earned ${earned.toFixed(2)} (${stats.approved} of ${stats.total} approved)`;
}

function parseStale(text: string): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined;
  const n = Number(text);
  return n >= MIN_STALE_SECONDS && n <= MAX_STALE_SECONDS ? n : undefined;
}

/**
 * Where the owner switches auto-approval on: one row per sphere and action kind that a rule can enable (a checkbox and a confidence
 * threshold), beside what the owner's answers have earned so far. The hard floor and the kinds that cannot be vouched for are listed
 * read-only with their reason and have no control at all. Every change goes through the settings store, which keeps only what differs
 * from the defaults; "Reset" puts the defaults back at once.
 */
const CopilotSettings: React.FC<CopilotSettingsProps> = ({ api, settings, intervalMs, training }) => {
  const current = React.useSyncExternalStore(settings.subscribe, settings.get);
  const counts = useBucketStats(api, intervalMs);

  const [staleDraft, setStaleDraft] = React.useState<string | undefined>(undefined);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [open, setOpen] = React.useState<ReadonlySet<Sphere>>(
    () => new Set<Sphere>(['world', ...SPHERES.filter((s) => AUTO_KINDS.some((k) => ruleFor(settings.get(), s, k).enabled))]),
  );

  function writeRule(sphere: Sphere, kind: ActionKind, change: Partial<TrustRule>): void {
    const next: TrustSettings = { ...current, rules: { ...current.rules, [ruleKey(sphere, kind)]: { ...ruleFor(current, sphere, kind), ...change } } };
    settings.set(next);
  }

  const shownStale = staleDraft ?? String(current.staleAfterSeconds);
  const staleOk = parseStale(shownStale) !== undefined;

  return (
    <section className={styles.settings} aria-label="Copilot settings">
      <p className={styles.intro}>
        Copilot asks you first, always, until you switch a rule on. A rule runs a suggestion by itself only when you have answered at least{' '}
        {MIN_BUCKET_SAMPLES} like it, the confidence it has earned reaches the threshold, and the game has been sending text.
      </p>

      {counts.stale === true && (
        <p className={styles.notice} role="alert">
          Server unreachable: showing the last counts.
        </p>
      )}

      {training?.status?.world === 'sandbox' && (
        <section className={styles.trainingSection}>
          <label className={styles.ruleToggle}>
            <input
              type="checkbox"
              className={styles.check}
              aria-label="Claude training"
              checked={training.status.enabled}
              disabled={!training.status.enabled && !training.status.canEnable}
              onChange={(e) => void training.set(e.target.checked)}
            />
            <span>Let Claude train Copilot here</span>
          </label>
          <p className={styles.floorIntro}>
            Claude answers Copilot's suggestions in your place while you are connected to the Simulacrum. Its answers are kept apart from yours and
            never reach the game you play for real. It turns itself off when the connection changes or Copilot is switched off.
          </p>
        </section>
      )}

      <div className={styles.field}>
        <label htmlFor="copilot-stale-after">Treat the game as quiet after (seconds)</label>
        <input
          id="copilot-stale-after"
          className={styles.input}
          type="number"
          inputMode="numeric"
          min={MIN_STALE_SECONDS}
          max={MAX_STALE_SECONDS}
          step={1}
          value={shownStale}
          aria-invalid={!staleOk}
          aria-describedby={staleOk ? undefined : 'copilot-stale-after-problem'}
          onChange={(e) => {
            const text = e.target.value;
            setStaleDraft(text);
            const n = parseStale(text);
            if (n !== undefined) settings.set({ ...current, staleAfterSeconds: n });
          }}
          onBlur={() => setStaleDraft(undefined)}
        />
        {!staleOk && (
          <span id="copilot-stale-after-problem" role="alert" className={styles.problem}>
            Use a whole number from {MIN_STALE_SECONDS} to {MAX_STALE_SECONDS}.
          </span>
        )}
      </div>

      {SPHERES.map((sphere) => (
        <details
          key={sphere}
          className={styles.sphere}
          open={open.has(sphere)}
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            setOpen((prev) => {
              if (prev.has(sphere) === isOpen) return prev;
              const next = new Set(prev);
              if (isOpen) next.add(sphere);
              else next.delete(sphere);
              return next;
            });
          }}
        >
          <summary>{SPHERE_LABELS[sphere]}</summary>
          <ul className={styles.rules}>
            {AUTO_KINDS.map((kind) => {
              const rule = ruleFor(current, sphere, kind);
              const note = KIND_NOTES[kind];
              return (
                <li key={kind} className={styles.rule}>
                  <label className={styles.ruleToggle}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      aria-label={`Auto-approve ${sphere} ${kind}`}
                      checked={rule.enabled}
                      onChange={(e) => writeRule(sphere, kind, { enabled: e.target.checked })}
                    />
                    <span>{KIND_LABELS[kind]}</span>
                  </label>
                  <span className={styles.threshold}>
                    <input
                      type="range"
                      className={styles.range}
                      aria-label={`Threshold for ${sphere} ${kind}`}
                      min={MIN_THRESHOLD}
                      max={MAX_THRESHOLD}
                      step={0.01}
                      value={rule.threshold}
                      disabled={!rule.enabled}
                      onChange={(e) => writeRule(sphere, kind, { threshold: Math.round(Number(e.target.value) * 100) / 100 })}
                    />
                    <output className={styles.readout}>{rule.threshold.toFixed(2)}</output>
                  </span>
                  <span className={styles.earned}>{earnedText(counts.table, sphere, kind)}</span>
                  {note !== undefined && <span className={styles.ruleNote}>{note}</span>}
                </li>
              );
            })}
          </ul>
        </details>
      ))}

      <section className={styles.floor} aria-label="Always asks you">
        <h3 className={styles.floorTitle}>Always asks you</h3>
        <p className={styles.floorIntro}>No setting can change these.</p>
        <ul className={styles.floorList}>
          {FLOOR_KINDS.map((kind) => (
            <li key={kind}>
              <strong>{kind}</strong> {FLOOR_REASONS[kind]}
            </li>
          ))}
          {OTHER_NEVER.map(({ kind, reason }) => (
            <li key={kind}>
              <strong>{kind}</strong> {reason}
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.actions}>
        {!confirmReset ? (
          <button type="button" className={styles.secondary} onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </button>
        ) : (
          <div role="alertdialog" aria-label="Reset settings" className={styles.confirm}>
            <span>Switch every rule off and restore the defaults?</span>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                settings.reset();
                setStaleDraft(undefined);
                setConfirmReset(false);
              }}
            >
              Reset
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirmReset(false)}>
              Keep my settings
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default CopilotSettings;
