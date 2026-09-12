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
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
  type BuffRow,
  type FightRow,
} from '../../features/autoleveling/autoleveling-user-data';
import { BUFF_CATALOG } from '../../features/autoleveling/autoleveling-buff-catalog';
import {
  classBuffAbilities,
  classOffensiveAbilities,
  getClassCatalog,
} from '../../features/autoleveling/autoleveling-classes';
import type { AutoPilotAbility, AutoPilotClass } from '../../features/autoleveling/autoleveling-content-types';
import type { AutoLevelAlignment } from '../../features/autoleveling/autoleveling-types';
import { DSL_CLASSES_FALLBACK } from './dsl-classes';
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

const gateOf = (b: BuffRow): BuffGate =>
  b.refreshTicks != null ? 'ticks' : b.affect != null ? 'affect' : 'always';

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
  const [catalogPick, setCatalogPick] = useState('');
  const [fightPick, setFightPick] = useState('');
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

  const classBuffs = playerClass && catalog.length > 0 ? classBuffAbilities(catalog, playerClass) : [];
  const classOffense = playerClass && catalog.length > 0 ? classOffensiveAbilities(catalog, playerClass) : [];

  const levelTag = (a: AutoPilotAbility) =>
    charLevel != null && a.level > charLevel ? `(L${a.level} — above your level)` : `(L${a.level})`;

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

  // A class buff-ish ability → a buff row. If the name matches a BUFF_CATALOG
  // entry we get the verified command + GMCP affect; otherwise it's a best guess
  // the player should check (`unverified`).
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
    commitBuffs([...buffs, { label: name, cmd: `cast '${lc}'`, affect: lc, unverified: true }]);
  };

  const pickBuff = (v: string) => {
    setCatalogPick('');
    if (v.startsWith('cat:')) addFromCatalog(v.slice(4));
    else if (v.startsWith('cls:')) addClassBuff(v.slice(4));
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

  const addClassFight = (name: string) => {
    setFightPick('');
    const ab = classOffense.find((a) => a.name === name);
    if (!ab) return;
    const lc = name.trim().toLowerCase();
    const cmd = ab.type === 'skill' ? lc : `cast '${lc}' {name}`;
    if (fightCommands.some((f) => f.cmd.trim().toLowerCase() === cmd.toLowerCase())) return;
    commitFight([...fightCommands, { cmd, cooldownSec: 0 }]);
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
          <select
            className={styles.select}
            aria-label="Add buff from catalog"
            value={catalogPick}
            onChange={(e) => pickBuff(e.target.value)}
          >
            <option value="">Add a buff…</option>
            <optgroup label="Verified catalog">
              {BUFF_CATALOG.map((c) => (
                <option key={c.label} value={`cat:${c.label}`}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            {classBuffs.length > 0 && (
              <optgroup label={`${playerClass} spells`}>
                {classBuffs.map((a) => (
                  <option key={a.name} value={`cls:${a.name}`}>
                    {a.name} {levelTag(a)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
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
          </div>
        );
      })}

      {/* fight commands */}
      <div className={styles.subHead}>
        <span>
          Fight commands <span className={styles.countPill}>{fightCommands.length}</span>
        </span>
        <span className={styles.subHeadActions}>
          {classOffense.length > 0 && (
            <select
              className={styles.select}
              aria-label="Add fight ability"
              value={fightPick}
              onChange={(e) => addClassFight(e.target.value)}
            >
              <option value="">Add ability…</option>
              {classOffense.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} {levelTag(a)}
                </option>
              ))}
            </select>
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
            <div key={i} className={styles.editorRow}>
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
          ))}
        </>
      )}
    </div>
  );
};
