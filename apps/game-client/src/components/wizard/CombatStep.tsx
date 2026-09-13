// apps/game-client/src/components/wizard/CombatStep.tsx

/**
 * Wizard step 3 — Combat.
 *
 * Class + level + engage command, a pre-round buff checklist, and a per-class
 * fight-command rotation. Buffs persist per area (`setBuffOverlay`), fight
 * commands per (area, class) (`setFightOverlay`), the class pick globally
 * (`setPrefs`) — all debounced. The wizard seeds the draft from these stores on
 * area selection, so this panel is fully controlled by the draft: navigating
 * away and back shows the same rows, reopening the wizard reloads them.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import {
  getFightOverlay,
  getLearnedCooldown,
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
  type BuffRow,
  type FightRow,
} from '../../features/autoleveling/autoleveling-user-data';
import { BUFF_CATALOG } from '../../features/autoleveling/autoleveling-buff-catalog';
import {
  abilitiesForClass,
  classOffensiveAbilities,
  getClassCatalog,
} from '../../features/autoleveling/autoleveling-classes';
import type { AutoPilotAbility, AutoPilotClass } from '../../features/autoleveling/autoleveling-content-types';
import type {
  AutoLevelAlignment,
  AutoLevelOnceKey,
  AutoLevelVitalsGate,
} from '../../features/autoleveling/autoleveling-types';
import { DSL_CLASSES_FALLBACK } from './dsl-classes';
import { FilterableSelect, type FilterableSelectOption } from './FilterableSelect';
import type { WizardDraft } from './useWizardDraft';

type BuffGate = 'affect' | 'ticks' | 'always';

const ALIGNMENTS: readonly AutoLevelAlignment[] = ['good', 'neutral', 'evil'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A 3-way "Good / Neutral / Evil" segmented control, styled like the buff gate. */
const AlignPick: React.FC<{
  label: string;
  value: AutoLevelAlignment;
  onChange: (v: AutoLevelAlignment) => void;
}> = ({ label, value, onChange }) => (
  <div className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    <div className={styles.gateSeg} role="group" aria-label={label}>
      {ALIGNMENTS.map((a) => (
        <button
          key={a}
          type="button"
          className={`${styles.gateOpt} ${value === a ? styles.gateOptOn : ''}`}
          aria-pressed={value === a}
          onClick={() => onChange(a)}
        >
          {cap(a)}
        </button>
      ))}
    </div>
  </div>
);

/** Swaps index `i` with its neighbor in `dir` (-1 up / +1 down); a no-op past either end. */
function moveItem<T>(arr: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr.slice();
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Up/down arrows for reordering a row within its list — execution order matters (buffs cast
 * top-to-bottom pre-round, fight commands sent top-to-bottom on the fight loop), so this is how
 * the player controls which one applies first.
 */
const ReorderButtons: React.FC<{
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  contextLabel: string;
}> = ({ index, count, onMove, contextLabel }) => (
  <span className={styles.reorderGroup}>
    <button
      type="button"
      className={styles.iconButton}
      onClick={() => onMove(-1)}
      disabled={index === 0}
      aria-label={`Move ${contextLabel} up`}
      title="Move up — applies earlier"
    >
      ↑
    </button>
    <button
      type="button"
      className={styles.iconButton}
      onClick={() => onMove(1)}
      disabled={index === count - 1}
      aria-label={`Move ${contextLabel} down`}
      title="Move down — applies later"
    >
      ↓
    </button>
  </span>
);

const gateOf = (b: BuffRow): BuffGate =>
  b.refreshTicks != null ? 'ticks' : b.affect != null ? 'affect' : 'always';

const VITALS_STATS: readonly { value: AutoLevelVitalsGate['stat']; label: string }[] = [
  { value: 'hp', label: 'HP' },
  { value: 'mp', label: 'MP' },
  { value: 'mv', label: 'Stamina' },
];

/**
 * Fire-limit toggle (off / once per round / once per fight), shared by buff cards and
 * fight-command rows. "Round" and "fight" are the engine's own definitions — see
 * AutoLevelOnceKey.
 */
const OnceGateControl: React.FC<{
  value: AutoLevelOnceKey | undefined;
  onChange: (v: AutoLevelOnceKey | undefined) => void;
  contextLabel: string;
}> = ({ value, onChange, contextLabel }) => (
  <div className={styles.gateBar}>
    <span className={styles.gateLabel}>limit</span>
    <div className={styles.gateSeg} role="group" aria-label={`Fire limit for ${contextLabel}`}>
      <button
        type="button"
        className={`${styles.gateOpt} ${!value ? styles.gateOptOn : ''}`}
        aria-pressed={!value}
        onClick={() => onChange(undefined)}
      >
        no limit
      </button>
      <button
        type="button"
        className={`${styles.gateOpt} ${value === 'round' ? styles.gateOptOn : ''}`}
        aria-pressed={value === 'round'}
        title="Fire at most once per round (a burst of damage with no ~1s gap)."
        onClick={() => onChange('round')}
      >
        once per round
      </button>
      <button
        type="button"
        className={`${styles.gateOpt} ${value === 'fight' ? styles.gateOptOn : ''}`}
        aria-pressed={value === 'fight'}
        title="Fire at most once for the whole encounter."
        onClick={() => onChange('fight')}
      >
        once per fight
      </button>
    </div>
  </div>
);

/**
 * Optional HP/MP/Stamina percentage precondition, shared by buff cards and fight-command
 * rows — "and" condition on top of whatever else gates the row (recast gate, cooldown).
 */
const VitalsGateControl: React.FC<{
  gate: AutoLevelVitalsGate | undefined;
  onChange: (g: AutoLevelVitalsGate | undefined) => void;
  contextLabel: string;
}> = ({ gate, onChange, contextLabel }) => {
  const enabled = !!gate;
  return (
    <div className={styles.gateBar}>
      <label className={styles.checkInline}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { stat: 'hp', op: 'below', pct: 50 } : undefined)}
          aria-label={`Enable vitals gate for ${contextLabel}`}
        />
        only when
      </label>
      {gate && (
        <>
          <select
            className={styles.select}
            value={gate.stat}
            onChange={(e) => onChange({ ...gate, stat: e.target.value as AutoLevelVitalsGate['stat'] })}
            aria-label={`Vitals gate stat for ${contextLabel}`}
          >
            {VITALS_STATS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className={styles.gateSeg} role="group" aria-label={`Vitals gate direction for ${contextLabel}`}>
            <button
              type="button"
              className={`${styles.gateOpt} ${gate.op === 'below' ? styles.gateOptOn : ''}`}
              aria-pressed={gate.op === 'below'}
              onClick={() => onChange({ ...gate, op: 'below' })}
            >
              below
            </button>
            <button
              type="button"
              className={`${styles.gateOpt} ${gate.op === 'above' ? styles.gateOptOn : ''}`}
              aria-pressed={gate.op === 'above'}
              onClick={() => onChange({ ...gate, op: 'above' })}
            >
              above
            </button>
          </div>
          <span className={styles.inlineField}>
            <input
              className={styles.levelInput}
              type="number"
              min={1}
              max={100}
              step={1}
              value={gate.pct}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange({ ...gate, pct: Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : gate.pct });
              }}
              aria-label={`Vitals gate percentage for ${contextLabel}`}
            />
            %
          </span>
        </>
      )}
    </div>
  );
};

const DEFAULT_REFRESH_TICKS = 6;

interface Props {
  areaSlug: string | null;
  charName: string | null;
  charLevel: number | null;
  playerClass: string | null;
  initiationCommand: string;
  buffs: BuffRow[];
  fightCommands: FightRow[];
  playerAlignment: AutoLevelAlignment;
  onPatch: (p: Partial<WizardDraft>) => void;
}

const SAVE_DEBOUNCE_MS = 500;

/** A debounced call that also flushes any pending invocation on unmount. */
function useDebouncedSave<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current) {
      const args = pending.current;
      pending.current = null;
      fnRef.current(...args);
    }
  }, []);

  const schedule = useCallback(
    (...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => flush, [flush]);
  return schedule;
}

export const CombatStep: React.FC<Props> = ({
  areaSlug,
  charName,
  charLevel,
  playerClass,
  initiationCommand,
  buffs,
  fightCommands,
  playerAlignment,
  onPatch,
}) => {
  const [catalog, setCatalog] = useState<AutoPilotClass[]>([]);

  useEffect(() => {
    let alive = true;
    void getClassCatalog().then((cs) => {
      if (alive) setCatalog(cs);
    });
    return () => {
      alive = false;
    };
  }, []);

  const baseClasses =
    catalog.length > 0
      ? catalog.filter((c) => !c.isReclass).map((c) => c.name).sort((a, b) => a.localeCompare(b))
      : [...DSL_CLASSES_FALLBACK];
  const reclasses =
    catalog.length > 0
      ? catalog.filter((c) => c.isReclass).map((c) => c.name).sort((a, b) => a.localeCompare(b))
      : [];

  // Every ability the class actually has — no buff/attack guessing here (that heuristic kept
  // mis-categorizing real spells; see the ability-picker-fix plan). Grouped by type below so the
  // picker stays scannable; which of these go under "buffs" is the player's own call until the
  // C# ability-classification admin system (separate plan) can drive it precisely.
  const classAbilities = playerClass && catalog.length > 0 ? abilitiesForClass(catalog, playerClass) : [];
  const classOffense = playerClass && catalog.length > 0 ? classOffensiveAbilities(catalog, playerClass) : [];

  const levelTag = (a: AutoPilotAbility) =>
    charLevel != null && a.level > charLevel ? `(L${a.level} — above your level)` : `(L${a.level})`;

  const byName = (a: AutoPilotAbility, b: AutoPilotAbility) => a.name.localeCompare(b.name);

  const TYPE_ORDER: AutoPilotAbility['type'][] = ['skill', 'spell', 'song'];
  const TYPE_LABELS: Record<AutoPilotAbility['type'], string> = { skill: 'Skills', spell: 'Spells', song: 'Songs' };

  const buffOptions: FilterableSelectOption[] = TYPE_ORDER.flatMap((t) =>
    classAbilities
      .filter((a) => a.type === t)
      .sort(byName)
      .map((a) => ({ value: a.name, label: `${a.name} ${levelTag(a)}`, group: TYPE_LABELS[t] })),
  );

  const fightOptions: FilterableSelectOption[] = [...classOffense].sort(byName).map((a) => ({
    value: a.name,
    label: `${a.name} ${levelTag(a)}`,
  }));

  const saveBuffs = useDebouncedSave((slug: string, rows: BuffRow[]) => {
    void setBuffOverlay(slug, rows);
  }, SAVE_DEBOUNCE_MS);

  const saveFight = useDebouncedSave((slug: string, cls: string, rows: FightRow[]) => {
    void setFightOverlay(slug, cls, rows);
  }, SAVE_DEBOUNCE_MS);

  // Class change: remember the pick globally, then reload that class's fight
  // overlay for the current area (a newer request wins if the user flips fast).
  const classReq = useRef(0);
  const onChangeClass = useCallback(
    (cls: string) => {
      onPatch({ playerClass: cls || null });
      if (cls) void setPrefs({ playerClass: cls });
      if (!areaSlug || !cls) {
        onPatch({ fightCommands: [] });
        return;
      }
      const req = ++classReq.current;
      void getFightOverlay(areaSlug, cls).then((rows) => {
        if (req === classReq.current) onPatch({ fightCommands: rows });
      });
    },
    [areaSlug, onPatch],
  );

  /* -------------------------------- buffs -------------------------------- */

  const commitBuffs = (rows: BuffRow[]) => {
    onPatch({ buffs: rows });
    if (areaSlug) saveBuffs(areaSlug, rows);
  };
  const addBuff = () => commitBuffs([...buffs, { label: '', cmd: '', affect: '' }]);
  const updateBuff = (i: number, patch: Partial<BuffRow>) =>
    commitBuffs(buffs.map((b, ix) => (ix === i ? { ...b, ...patch } : b)));
  const removeBuff = (i: number) => commitBuffs(buffs.filter((_, ix) => ix !== i));
  const moveBuff = (i: number, dir: -1 | 1) => commitBuffs(moveItem(buffs, i, dir));

  const setBuffGate = (i: number, gate: BuffGate) =>
    commitBuffs(
      buffs.map((b, ix) => {
        if (ix !== i) return b;
        const keep = b.unverified ? { unverified: true as const } : {};
        if (gate === 'ticks')
          return { label: b.label, cmd: b.cmd, refreshTicks: b.refreshTicks ?? DEFAULT_REFRESH_TICKS, ...keep };
        if (gate === 'always') return { label: b.label, cmd: b.cmd, ...keep };
        // 'affect' — keep the affect name + the in-combat/hold extras
        return {
          label: b.label,
          cmd: b.cmd,
          affect: b.affect ?? '',
          ...(b.inCombatCmd ? { inCombatCmd: b.inCombatCmd } : {}),
          ...(b.holdNearLevel ? { holdNearLevel: true } : {}),
          ...keep,
        };
      }),
    );

  const addFromCatalog = (label: string) => {
    const entry = BUFF_CATALOG.find((c) => c.label === label);
    if (!entry) return;
    if (buffs.some((b) => b.label.toLowerCase() === entry.label.toLowerCase())) return;
    const row: BuffRow = { label: entry.label, cmd: entry.cmd };
    if (entry.affect) {
      row.affect = entry.affect;
      if (entry.suggestInCombat) row.inCombatCmd = entry.suggestInCombat;
      if (entry.suggestHoldNearLevel) row.holdNearLevel = true;
    } else {
      row.refreshTicks = DEFAULT_REFRESH_TICKS;
    }
    commitBuffs([...buffs, row]);
  };

  // A class ability → a buff row. If the name matches a BUFF_CATALOG entry we get the verified
  // command + GMCP affect; otherwise it's a best guess the player should check (`unverified`) —
  // a skill guesses a bare command + tick-gate (skills rarely register a GMCP affect, same as
  // Berserk), a spell/song guesses `cast '<name>'` + an affect-name gate.
  const addClassBuff = (name: string) => {
    if (buffs.some((b) => b.label.toLowerCase() === name.toLowerCase())) return;
    const cat = BUFF_CATALOG.find(
      (c) => c.label.toLowerCase() === name.toLowerCase() || c.affect.toLowerCase() === name.toLowerCase(),
    );
    if (cat) {
      addFromCatalog(cat.label);
      return;
    }
    const lc = name.trim().toLowerCase();
    const ability = classAbilities.find((a) => a.name === name);
    if (ability?.type === 'skill') {
      commitBuffs([...buffs, { label: name, cmd: lc, refreshTicks: DEFAULT_REFRESH_TICKS, unverified: true }]);
      return;
    }
    commitBuffs([...buffs, { label: name, cmd: `cast '${lc}'`, affect: lc, unverified: true }]);
  };

  /* ---------------------------- fight commands --------------------------- */

  const commitFight = (rows: FightRow[]) => {
    onPatch({ fightCommands: rows });
    if (areaSlug && playerClass) saveFight(areaSlug, playerClass, rows);
  };
  const addFight = () => commitFight([...fightCommands, { cmd: '', cooldownSec: 0 }]);
  const updateFight = (i: number, patch: Partial<FightRow>) =>
    commitFight(fightCommands.map((f, ix) => (ix === i ? { ...f, ...patch } : f)));
  const removeFight = (i: number) => commitFight(fightCommands.filter((_, ix) => ix !== i));
  const moveFight = (i: number, dir: -1 | 1) => commitFight(moveItem(fightCommands, i, dir));

  const addClassFight = async (name: string) => {
    const ab = classOffense.find((a) => a.name === name);
    if (!ab) return;
    const lc = name.trim().toLowerCase();
    const cmd = ab.type === 'skill' ? lc : `cast '${lc}' {name}`;
    if (fightCommands.some((f) => f.cmd.trim().toLowerCase() === cmd.toLowerCase())) return;
    // Pre-fill from a previously-learned cooldown for this exact ability (any area, any
    // character) — the engine bumps this whenever it sees the command queue up.
    const learned = await getLearnedCooldown(cmd);
    commitFight([...fightCommands, { cmd, cooldownSec: learned ?? 0 }]);
  };

  if (!areaSlug) {
    return <div className={styles.notice}>Pick a curated area first — combat setup is per area.</div>;
  }

  return (
    <div className={styles.stepPanel}>
      <div className={styles.combatGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Class</span>
          <select
            className={styles.select}
            aria-label="Class"
            value={playerClass ?? ''}
            onChange={(e) => onChangeClass(e.target.value)}
          >
            <option value="">— pick your class —</option>
            {reclasses.length > 0 ? (
              <>
                <optgroup label="Base classes">
                  {baseClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Reclasses">
                  {reclasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              baseClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            )}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Level</span>
          <span className={styles.fieldStatic}>
            {charLevel != null ? charLevel : '—'}
            {charName ? ` · ${charName}` : ''}
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Engage command</span>
          <input
            className={styles.input}
            type="text"
            placeholder="kill {name}"
            value={initiationCommand}
            onChange={(e) => onPatch({ initiationCommand: e.target.value })}
          />
        </label>
      </div>
      <p className={styles.fieldHint}>
        <code>{'{name}'}</code> becomes the target keyword. Blank means <code>kill {'{name}'}</code>.
      </p>

      <div className={styles.alignRow}>
        <AlignPick
          label="Your alignment"
          value={playerAlignment}
          onChange={(v) => {
            onPatch({ playerAlignment: v });
            void setPrefs({ playerAlignment: v });
          }}
        />
      </div>
      <p className={styles.fieldHint}>
        Used for the “kills to level” estimate. The mob's alignment is read live from its{' '}
        <code>(Golden Aura)</code> / <code>(Red Aura)</code> line prefix (needs <code>detect good</code> /{' '}
        <code>detect evil</code> up) — opposite = 2× XP, same = ½×, either neutral / undetected = 1×. Leave{' '}
        <strong>Neutral</strong> if you don't know or don't run detects.
      </p>

      {/* buff checklist */}
      <div className={styles.subHead}>
        <span>
          Pre-round buffs <span className={styles.countPill}>{buffs.length}</span>
        </span>
        <span className={styles.subHeadActions}>
          {buffOptions.length > 0 && (
            <FilterableSelect
              options={buffOptions}
              onPick={addClassBuff}
              placeholder="Add a buff…"
              ariaLabel="Add buff from class abilities"
            />
          )}
          <button type="button" className={styles.linkButton} onClick={addBuff}>
            + add buff
          </button>
        </span>
      </div>
      <p className={styles.fieldHint}>
        A <strong>round</strong> is one full lap of the area route. Buffs are checked at the top of each lap while{' '}
        <strong>out of combat</strong> — pick how each one decides it needs a recast.
      </p>
      {buffs.length === 0 && <div className={styles.notice}>No buffs — the run starts fighting straight away.</div>}
      {buffs.map((b, i) => {
        const gate = gateOf(b);
        return (
          <div key={i} className={styles.buffCard} data-buff-card>
            <div className={styles.buffCardTop}>
              <ReorderButtons
                index={i}
                count={buffs.length}
                onMove={(dir) => moveBuff(i, dir)}
                contextLabel={`buff ${i + 1}`}
              />
              <input
                className={styles.inputNarrow}
                type="text"
                placeholder="label — e.g. Sanctuary"
                value={b.label}
                onChange={(e) => updateBuff(i, { label: e.target.value })}
              />
              {b.unverified && (
                <span
                  className={styles.buffUnverified}
                  title="Command and affect name are a guess from the class ability — check them against your real affects."
                >
                  unverified
                </span>
              )}
              <input
                className={styles.input}
                type="text"
                placeholder="command — e.g. cast sanctuary"
                value={b.cmd}
                onChange={(e) => updateBuff(i, { cmd: e.target.value })}
              />
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => removeBuff(i)}
                aria-label={`Remove buff ${i + 1}`}
              >
                remove
              </button>
            </div>

            <div className={styles.gateBar}>
              <span className={styles.gateLabel}>recast when</span>
              <div className={styles.gateSeg} role="group" aria-label={`Recast gate for buff ${i + 1}`}>
                <button
                  type="button"
                  className={`${styles.gateOpt} ${gate === 'affect' ? styles.gateOptOn : ''}`}
                  aria-pressed={gate === 'affect'}
                  title="At the top of each round, recast only if this GMCP affect isn't currently active."
                  onClick={() => setBuffGate(i, 'affect')}
                >
                  affect drops
                </button>
                <button
                  type="button"
                  className={`${styles.gateOpt} ${gate === 'ticks' ? styles.gateOptOn : ''}`}
                  aria-pressed={gate === 'ticks'}
                  title="Recast once N game ticks (~40s each) have passed since the last cast — for buffs with no GMCP affect."
                  onClick={() => setBuffGate(i, 'ticks')}
                >
                  every N ticks
                </button>
                <button
                  type="button"
                  className={`${styles.gateOpt} ${gate === 'always' ? styles.gateOptOn : ''}`}
                  aria-pressed={gate === 'always'}
                  title="Recast at the top of every round, with no check. (A round = one full lap of the area route.)"
                  onClick={() => setBuffGate(i, 'always')}
                >
                  every round
                </button>
              </div>

              {gate === 'affect' && (
                <input
                  className={styles.inputNarrow}
                  type="text"
                  placeholder="affect name — e.g. sanctuary"
                  value={b.affect ?? ''}
                  onChange={(e) => updateBuff(i, { affect: e.target.value })}
                  aria-label={`Affect name for buff ${i + 1}`}
                />
              )}

              {gate === 'ticks' && (
                <span className={styles.inlineField}>
                  every
                  <input
                    className={styles.levelInput}
                    type="number"
                    min={1}
                    step={1}
                    value={b.refreshTicks ?? DEFAULT_REFRESH_TICKS}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      updateBuff(i, { refreshTicks: Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1 });
                    }}
                    aria-label={`Tick interval for buff ${i + 1}`}
                  />
                  ticks (~{Math.round((b.refreshTicks ?? DEFAULT_REFRESH_TICKS) * 40)}s)
                </span>
              )}
            </div>

            {gate === 'affect' && (
              <div className={styles.buffExtras}>
                <span
                  className={styles.gateLabel}
                  title="If the affect drops while you're fighting, run this instead — an item action (quaff/brandish/zap); the spell itself usually can't be recast mid-fight."
                >
                  In combat
                </span>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="quaff <potion> / brandish <staff> (optional)"
                  value={b.inCombatCmd ?? ''}
                  onChange={(e) => updateBuff(i, { inCombatCmd: e.target.value })}
                  aria-label={`In-combat action for buff ${i + 1}`}
                />
                <label className={styles.checkInline}>
                  <input
                    type="checkbox"
                    checked={!!b.holdNearLevel}
                    onChange={(e) => updateBuff(i, { holdNearLevel: e.target.checked })}
                  />
                  let fall near level-up
                </label>
              </div>
            )}

            <VitalsGateControl
              gate={b.vitalsGate}
              onChange={(g) => updateBuff(i, { vitalsGate: g })}
              contextLabel={`buff ${i + 1}`}
            />
            <OnceGateControl
              value={b.onceKey}
              onChange={(v) => updateBuff(i, { onceKey: v })}
              contextLabel={`buff ${i + 1}`}
            />
          </div>
        );
      })}

      {/* fight commands */}
      <div className={styles.subHead}>
        <span>
          Fight commands <span className={styles.countPill}>{fightCommands.length}</span>
        </span>
        <span className={styles.subHeadActions}>
          {fightOptions.length > 0 && (
            <FilterableSelect
              options={fightOptions}
              onPick={addClassFight}
              placeholder="Add ability…"
              ariaLabel="Add fight ability"
            />
          )}
          <button type="button" className={styles.linkButton} onClick={addFight} disabled={!playerClass}>
            + add command
          </button>
        </span>
      </div>
      <p className={styles.fieldHint}>
        Sent on a loop while fighting. A <strong>cooldown</strong> in seconds throttles a command with an in-game
        reuse timer (<code>bash</code>, <code>kick</code>, a quaffed potion); 0 sends it every tick.
      </p>
      {!playerClass ? (
        <div className={styles.notice}>Pick your class above — fight commands are saved per class.</div>
      ) : (
        <>
          {fightCommands.length === 0 && (
            <div className={styles.notice}>No extra commands — the engine still auto-attacks.</div>
          )}
          {fightCommands.map((f, i) => (
            <div key={i} className={styles.buffCard}>
              <div className={styles.editorRow}>
                <ReorderButtons
                  index={i}
                  count={fightCommands.length}
                  onMove={(dir) => moveFight(i, dir)}
                  contextLabel={`fight command ${i + 1}`}
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="command — e.g. bash"
                  value={f.cmd}
                  onChange={(e) => updateFight(i, { cmd: e.target.value })}
                />
                <span className={styles.inlineField}>
                  <input
                    className={styles.levelInput}
                    type="number"
                    min={0}
                    step={1}
                    value={f.cooldownSec}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      updateFight(i, { cooldownSec: Number.isFinite(n) ? Math.max(0, n) : 0 });
                    }}
                    aria-label={`Cooldown seconds for command ${i + 1}`}
                  />
                  <span className={styles.fieldHint}>sec</span>
                </span>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => removeFight(i)}
                  aria-label={`Remove command ${i + 1}`}
                >
                  remove
                </button>
              </div>

              <VitalsGateControl
                gate={f.vitalsGate}
                onChange={(g) => updateFight(i, { vitalsGate: g })}
                contextLabel={`fight command ${i + 1}`}
              />
              <OnceGateControl
                value={f.onceKey}
                onChange={(v) => updateFight(i, { onceKey: v })}
                contextLabel={`fight command ${i + 1}`}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
};
