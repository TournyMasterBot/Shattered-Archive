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

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import {
  getBuffOverlayOrNull,
  getFightOverlayOrNull,
  getLearnedCooldown,
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
  type BuffRow,
  type FightRow,
} from '../../features/autoleveling/autoleveling-user-data';
import { BUFF_CATALOG } from '../../features/autoleveling/autoleveling-buff-catalog';
import { cooldownSecFromLag, refreshTicksFromDuration } from '../../features/autoleveling/autoleveling-lag';
import { expandCommand, findUnresolvedPlaceholder } from '../../features/autoleveling/autoleveling-command-text';
import { bandLabel } from '../../features/autoleveling/autoleveling-enemy-condition';
import { COMBAT_STATE_TEXT } from '../../features/autoleveling/autoleveling-row-text';
import {
  DEFAULT_REFRESH_TICKS,
  buffRowFromCatalog,
  buffRowForGate,
  defaultBuffRows,
  defaultFightRows,
} from '../../features/autoleveling/autoleveling-class-defaults';
import {
  abilitiesForClass,
  classByName,
  classOffensiveAbilities,
  getClassCatalog,
} from '../../features/autoleveling/autoleveling-classes';
import type { AutoPilotAbility, AutoPilotClass } from '../../features/autoleveling/autoleveling-content-types';
import type {
  AutoLevelAlignment,
  AutoLevelCombatState,
  AutoLevelEnemyBand,
  AutoLevelEnemyGate,
  AutoLevelOnceKey,
  AutoLevelVitalsGate,
} from '../../features/autoleveling/autoleveling-types';
import HelpInfoButton from '../HelpInfoButton';
import CombatHelp from './CombatHelp';
import { DSL_CLASSES_FALLBACK } from './dsl-classes';
import { FilterableSelect, type FilterableSelectOption } from './FilterableSelect';
import type { WizardDraft } from './useWizardDraft';

type BuffGate = 'affect' | 'ticks' | 'always';

/** A copy of the row without the keys whose value is undefined: a cleared option is absent from the stored row, not stored as nothing. */
function withoutUndefined<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Why a command will not be sent, or null. A command that still has `<something>` or `{something}` to fill in (other than {name}, which autopilot
 * fills with the kill keyword) is not sent: it used to be sent to the game literally (CMDTPL-01).
 */
function unresolvedNote(cmd: string | undefined): string | null {
  const left = findUnresolvedPlaceholder(expandCommand(String(cmd ?? ''), 'target'));
  return left ? `"${cmd}" still has ${left} to fill in: autopilot will not send it until you replace that part.` : null;
}

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
 * Where the row may be sent from: either, only in a fight, only out of one (live findings 2026-11-14: dark heal can only be cast out of
 * combat). The engine enforces it itself from GMCP is_fighting, whatever the game would answer.
 */
const CombatStateControl: React.FC<{
  value: AutoLevelCombatState | undefined;
  onChange: (v: AutoLevelCombatState | undefined) => void;
  contextLabel: string;
}> = ({ value, onChange, contextLabel }) => (
  <div className={styles.gateBar}>
    <span className={styles.gateLabel}>send</span>
    <div className={styles.gateSeg} role="group" aria-label={`Combat state for ${contextLabel}`}>
      <button
        type="button"
        className={`${styles.gateOpt} ${!value ? styles.gateOptOn : ''}`}
        aria-pressed={!value}
        title="Send it whether or not you are fighting."
        onClick={() => onChange(undefined)}
      >
        any time
      </button>
      <button
        type="button"
        className={`${styles.gateOpt} ${value === 'in' ? styles.gateOptOn : ''}`}
        aria-pressed={value === 'in'}
        title="Only while you are fighting."
        onClick={() => onChange('in')}
      >
        {COMBAT_STATE_TEXT.in}
      </button>
      <button
        type="button"
        className={`${styles.gateOpt} ${value === 'out' ? styles.gateOptOn : ''}`}
        aria-pressed={value === 'out'}
        title="Only while you are not fighting, for example a heal the game will not let you cast in combat."
        onClick={() => onChange('out')}
      >
        {COMBAT_STATE_TEXT.out}
      </button>
    </div>
  </div>
);

/** The enemy's condition bands as menu entries: the phrase with its percent after it, best condition first. */
const ENEMY_BANDS: readonly AutoLevelEnemyBand[] = [100, 90, 75, 50, 30, 15, 0];

/**
 * Optional enemy-condition precondition: the game only tells you the enemy's health in words, so the gate compares those phrases
 * (each shown with its percent, which is approximate). Fires only during a fight and, like the own-vitals gate, never blocks
 * before the first condition line has been seen. Together with the own-vitals gate below, both must hold.
 */
const EnemyGateControl: React.FC<{
  gate: AutoLevelEnemyGate | undefined;
  onChange: (g: AutoLevelEnemyGate | undefined) => void;
  contextLabel: string;
}> = ({ gate, onChange, contextLabel }) => (
  <div className={styles.gateBar}>
    <label className={styles.checkInline}>
      <input
        type="checkbox"
        checked={!!gate}
        onChange={(e) => onChange(e.target.checked ? { op: 'below', band: 50 } : undefined)}
        aria-label={`Enable enemy condition gate for ${contextLabel}`}
      />
      only when the enemy is
    </label>
    {gate && (
      <>
        <div className={styles.gateSeg} role="group" aria-label={`Enemy condition direction for ${contextLabel}`}>
          <button
            type="button"
            className={`${styles.gateOpt} ${gate.op === 'below' ? styles.gateOptOn : ''}`}
            aria-pressed={gate.op === 'below'}
            title="Healthier-looking bands do not count: only when the enemy looks worse than the one you pick."
            onClick={() => onChange({ ...gate, op: 'below' })}
          >
            below
          </button>
          <button
            type="button"
            className={`${styles.gateOpt} ${gate.op === 'above' ? styles.gateOptOn : ''}`}
            aria-pressed={gate.op === 'above'}
            title="Only when the enemy looks better than the one you pick (for example a skill that stops working on a badly wounded enemy)."
            onClick={() => onChange({ ...gate, op: 'above' })}
          >
            above
          </button>
        </div>
        <select
          className={styles.select}
          value={gate.band}
          onChange={(e) => onChange({ ...gate, band: Number(e.target.value) as AutoLevelEnemyBand })}
          aria-label={`Enemy condition for ${contextLabel}`}
          title="The game words the enemy's health; the percents are approximate."
        >
          {ENEMY_BANDS.map((b) => (
            <option key={b} value={b}>
              {bandLabel(b)}
            </option>
          ))}
        </select>
      </>
    )}
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
  // Layout effect, not a render-time write: the timer callback below only ever runs after a commit.
  useLayoutEffect(() => {
    fnRef.current = fn;
  }, [fn]);
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
  // false until the first answer: an empty catalog is only "unavailable" once we have asked
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let alive = true;
    void getClassCatalog().then((cs) => {
      if (!alive) return;
      setCatalog(cs);
      setCatalogLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The newest props, for async work that must not act on a stale closure (and must not restart when they change).
  const latest = useRef({ buffs, fightCommands, charLevel });
  useLayoutEffect(() => {
    latest.current = { buffs, fightCommands, charLevel };
  });
  // `<area>|<class>` the defaults were last decided for, so each pair is decided once per mount.
  const seededFor = useRef('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Defaults for a class: verified buffs, and fight commands with any cooldown the engine already learned. */
  const defaultsFor = useCallback(
    async (cls: AutoPilotClass | undefined) => {
      if (!cls) return { buffs: [] as BuffRow[], fight: [] as FightRow[] };
      const level = latest.current.charLevel;
      const offense = classOffensiveAbilities(catalog, cls.name);
      const fight = await Promise.all(
        defaultFightRows(offense, level).map(async (r) => ({ ...r, cooldownSec: (await getLearnedCooldown(r.cmd)) ?? r.cooldownSec })),
      );
      return { buffs: defaultBuffRows(cls.abilities, level), fight };
    },
    [catalog],
  );

  // Pre-fill for a class the player already has chosen (remembered from last time) once the catalog is here:
  // only where NOTHING was ever saved for this area (buffs) or area+class (fight), and only over empty rows. A saved set,
  // including one the player emptied, always wins; seeded rows stay in the draft until the player first edits them.
  useEffect(() => {
    if (!areaSlug || !playerClass || catalog.length === 0) return;
    const key = `${areaSlug}|${playerClass.trim().toLowerCase()}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    const cls = classByName(catalog, playerClass);
    if (!cls) return;
    // Not cancelled by a dependency change (the level arriving must not drop the seed); only an unmount or a newer
    // class decision (seededFor moved on) discards it.
    void (async () => {
      const [savedBuffs, savedFight] = await Promise.all([
        getBuffOverlayOrNull(areaSlug),
        getFightOverlayOrNull(areaSlug, playerClass),
      ]);
      if (!mounted.current || seededFor.current !== key) return;
      const wantBuffs = savedBuffs === null && latest.current.buffs.length === 0;
      const wantFight = savedFight === null && latest.current.fightCommands.length === 0;
      if (!wantBuffs && !wantFight) return;
      const d = await defaultsFor(cls);
      if (!mounted.current || seededFor.current !== key) return;
      const patch: Partial<WizardDraft> = {};
      if (wantBuffs) patch.buffs = d.buffs;
      if (wantFight) patch.fightCommands = d.fight;
      onPatch(patch);
    })();
  }, [areaSlug, playerClass, catalog, defaultsFor, onPatch]);

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
      seededFor.current = `${areaSlug}|${cls.trim().toLowerCase()}`;
      void (async () => {
        const [savedFight, savedBuffs] = await Promise.all([
          getFightOverlayOrNull(areaSlug, cls),
          getBuffOverlayOrNull(areaSlug),
        ]);
        if (req !== classReq.current) return;
        // Never saved for this class -> the class's defaults; saved (even emptied) -> exactly what was saved.
        // Buffs belong to the area, not the class: with none saved they follow the newly chosen class.
        const d = savedFight === null || savedBuffs === null ? await defaultsFor(classByName(catalog, cls)) : null;
        if (req !== classReq.current) return;
        const patch: Partial<WizardDraft> = { fightCommands: savedFight ?? d?.fight ?? [] };
        if (savedBuffs === null) patch.buffs = d?.buffs ?? [];
        onPatch(patch);
      })();
    },
    [areaSlug, onPatch, catalog, defaultsFor],
  );

  /* -------------------------------- buffs -------------------------------- */

  const commitBuffs = (rows: BuffRow[]) => {
    onPatch({ buffs: rows });
    if (areaSlug) saveBuffs(areaSlug, rows);
  };
  const addBuff = () => commitBuffs([...buffs, { label: '', cmd: '', affect: '' }]);
  const updateBuff = (i: number, patch: Partial<BuffRow>) =>
    commitBuffs(buffs.map((b, ix) => (ix === i ? withoutUndefined({ ...b, ...patch }) : b)));
  const removeBuff = (i: number) => commitBuffs(buffs.filter((_, ix) => ix !== i));
  const moveBuff = (i: number, dir: -1 | 1) => commitBuffs(moveItem(buffs, i, dir));
  // Pause keeps the row but the engine skips it; resume deletes the flag (stored like a never-paused row).
  const setBuffPaused = (i: number, paused: boolean) =>
    commitBuffs(
      buffs.map((b, ix) => {
        if (ix !== i) return b;
        if (paused) return { ...b, disabled: true };
        const { disabled: _paused, ...rest } = b;
        return rest;
      }),
    );

  /**
   * Why this buff row may not work yet, while it still casts the verified spell: the class gets the ability later
   * (or never). A player who changed the command to another way of applying it (a potion, a wand, a staff) has
   * defined how, so there is nothing to warn about.
   */
  const buffAbilityNote = (b: BuffRow): string | null => {
    if (!playerClass || catalog.length === 0) return null;
    const entry = BUFF_CATALOG.find((c) => c.label.toLowerCase() === b.label.trim().toLowerCase());
    if (!entry || b.cmd.trim() !== entry.cmd) return null;
    const ability = classAbilities.find(
      (a) => a.name.toLowerCase() === entry.label.toLowerCase() || (entry.affect && a.name.toLowerCase() === entry.affect),
    );
    if (!ability) {
      return `Your class does not get ${entry.label} as an ability. Change the command to the way you apply it (a potion, wand or staff).`;
    }
    if (charLevel != null && ability.level > charLevel) {
      return `You do not have ${entry.label} as an ability yet: your class gets it at level ${ability.level}. Change the command to quaff a potion or use a wand or staff, then resume it, or leave it paused until then.`;
    }
    return null;
  };

  // buffRowForGate spreads the row, so every field that is not specific to the old mode survives the switch (SETTINGS-07).
  const setBuffGate = (i: number, gate: BuffGate) => commitBuffs(buffs.map((b, ix) => (ix === i ? buffRowForGate(b, gate) : b)));

  const addFromCatalog = (label: string) => {
    const entry = BUFF_CATALOG.find((c) => c.label === label);
    if (!entry) return;
    if (buffs.some((b) => b.label.toLowerCase() === entry.label.toLowerCase())) return;
    // a tick-gated entry takes its recast interval from the class's own ability when the feed knows its duration
    const ability = classAbilities.find((a) => a.name.toLowerCase() === entry.label.toLowerCase() || (entry.affect && a.name.toLowerCase() === entry.affect.toLowerCase()));
    commitBuffs([...buffs, buffRowFromCatalog(entry, ability)]);
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
      commitBuffs([...buffs, { label: name, cmd: lc, refreshTicks: refreshTicksFromDuration(ability.durationTicks, DEFAULT_REFRESH_TICKS), unverified: true }]);
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
    commitFight(fightCommands.map((f, ix) => (ix === i ? withoutUndefined({ ...f, ...patch }) : f)));
  // Pause keeps the row (and its cooldown and gates) but the engine skips it; resume drops the flag so a
  // resumed row is stored exactly like one that was never paused.
  const setFightPaused = (i: number, paused: boolean) =>
    commitFight(
      fightCommands.map((f, ix) => {
        if (ix !== i) return f;
        if (paused) return { ...f, disabled: true };
        const { disabled: _paused, ...rest } = f;
        return rest;
      }),
    );
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
    commitFight([...fightCommands, { cmd, cooldownSec: learned ?? cooldownSecFromLag(ab.lagMs) }]);
  };

  if (!areaSlug) {
    return <div className={styles.notice}>Pick a curated area first — combat setup is per area.</div>;
  }

  if (showHelp) return <CombatHelp onBack={() => setShowHelp(false)} />;

  return (
    <div className={styles.stepPanel}>
      <div className={styles.subHead}>
        <span>Class, buffs and fight commands</span>
        <HelpInfoButton topic="Combat" open={false} onToggle={() => setShowHelp(true)} />
      </div>
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
      {catalogLoaded && catalog.length === 0 && (
        <div className={styles.notice} role="status">
          The class list could not be loaded, so only the five base classes are shown and no abilities are pre-filled.
          Check your connection and reopen the wizard.
        </div>
      )}
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
        const abilityNote = buffAbilityNote(b);
        return (
          <div key={i} className={`${styles.buffCard} ${b.disabled ? styles.rowPaused : ''}`} data-buff-card>
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
              {b.disabled && <span className={styles.editedBadge}>paused</span>}
              <button
                type="button"
                className={`${styles.linkButton} ${styles.linkAction}`}
                onClick={() => setBuffPaused(i, !b.disabled)}
                aria-label={b.disabled ? `Resume buff ${i + 1}` : `Pause buff ${i + 1}`}
                aria-pressed={!!b.disabled}
                title={
                  b.disabled
                    ? 'Paused: autopilot skips this buff. Resume to use it again.'
                    : 'Pause this buff without removing it.'
                }
              >
                {b.disabled ? 'resume' : 'pause'}
              </button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => removeBuff(i)}
                aria-label={`Remove buff ${i + 1}`}
              >
                remove
              </button>
            </div>
            {abilityNote && (
              <div className={styles.fieldHint} role="note">
                ⚠ {abilityNote}
              </div>
            )}

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
                <label
                  className={styles.checkInline}
                  title="If the cast fails (for example 'You lost your concentration') or the affect does not show, try again: up to 3 tries, a few seconds apart, then autopilot says it gave up."
                >
                  <input
                    type="checkbox"
                    checked={b.retryUntilSet !== false}
                    onChange={(e) => updateBuff(i, { retryUntilSet: e.target.checked ? undefined : false })}
                    aria-label={`Retry until the affect shows for buff ${i + 1}`}
                  />
                  retry until the affect shows
                </label>
              </div>
            )}
            {[b.cmd, b.inCombatCmd].map((c) => unresolvedNote(c)).filter(Boolean).map((note, ni) => (
              <div key={ni} className={styles.fieldHint} role="note">
                ⚠ {note}
              </div>
            ))}

            <CombatStateControl
              value={b.combatState}
              onChange={(v) => updateBuff(i, { combatState: v })}
              contextLabel={`buff ${i + 1}`}
            />
            <EnemyGateControl
              gate={b.enemyGate}
              onChange={(g) => updateBuff(i, { enemyGate: g })}
              contextLabel={`buff ${i + 1}`}
            />
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
            <div key={i} className={`${styles.buffCard} ${f.disabled ? styles.rowPaused : ''}`}>
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
                {f.disabled && <span className={styles.editedBadge}>paused</span>}
                <button
                  type="button"
                  className={`${styles.linkButton} ${styles.linkAction}`}
                  onClick={() => setFightPaused(i, !f.disabled)}
                  aria-label={f.disabled ? `Resume command ${i + 1}` : `Pause command ${i + 1}`}
                  aria-pressed={!!f.disabled}
                  title={
                    f.disabled
                      ? 'Paused: autopilot skips this command. Resume to use it again.'
                      : 'Pause this command (for example until you have practiced it) without removing it.'
                  }
                >
                  {f.disabled ? 'resume' : 'pause'}
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => removeFight(i)}
                  aria-label={`Remove command ${i + 1}`}
                >
                  remove
                </button>
              </div>

              {unresolvedNote(f.cmd) ? (
                <div className={styles.fieldHint} role="note">
                  ⚠ {unresolvedNote(f.cmd)}
                </div>
              ) : null}
              <CombatStateControl
                value={f.combatState}
                onChange={(v) => updateFight(i, { combatState: v })}
                contextLabel={`fight command ${i + 1}`}
              />
              <EnemyGateControl
                gate={f.enemyGate}
                onChange={(g) => updateFight(i, { enemyGate: g })}
                contextLabel={`fight command ${i + 1}`}
              />
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
