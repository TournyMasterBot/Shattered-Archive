import { useEffect, useMemo, useState } from 'react';
import {
  SKILL_SPELL_FUNS,
  emitSkillsFile,
  parseSkillsFile,
  stockSkill,
  stockSkillsFile,
  validateSkills,
  type SkillEntry,
} from '@shatteredarchive/merc-area';

import { ApiError, api } from '../../api/client.js';
import { ConflictPanel, NumField, TextField } from '../areas/workbench.js';
import GroupsView from './GroupsView.js';
import CodegenView from './CodegenView.js';
import '../areas/areas.css';

/**
 * Skills/spells editor (Phase 7) — edits skills.dat, the boot-time DATA
 * overlay onto the game's compiled skill_table. Unlike every other tab this
 * is not an area file: one global optional file, applied at the next
 * COPYOVER only (the C loader runs during boot, before area loading).
 *
 * Names are row identity and read-only (player files save skills by name;
 * C code hardcodes lookups); slot and gsn wiring are compiled-in and shown
 * for reference only. The (spell function, target) pair must match a
 * combination the stock table already uses — anything else is rejected here
 * AND by the server AND skipped by the game.
 */
const CLASS_NAMES = ['Mage', 'Cleric', 'Thief', 'Warrior'];

const TARGET_LABELS: Record<number, string> = {
  0: 'ignore (no target)',
  1: 'character (offensive)',
  2: 'character (defensive)',
  3: 'self',
  4: 'object in inventory',
  5: 'object or char (defensive)',
  6: 'object or char (offensive)',
};

const POSITION_LABELS: Record<number, string> = {
  0: 'dead',
  1: 'mortally wounded',
  2: 'incapacitated',
  3: 'stunned',
  4: 'sleeping',
  5: 'resting',
  6: 'sitting',
  7: 'fighting',
  8: 'standing',
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [source, setSource] = useState<'overlay' | 'stock'>('stock');
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [view, setView] = useState<'skills' | 'groups' | 'codegen'>('skills');
  // Conditional-save identity (Phase 12): null = stock (no overlay on disk yet)
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = () => {
    api
      .skills()
      .then((r) => {
        setSkills(r.skills);
        setSource(r.source);
        setBaseHash(r.baseHash);
        setConflict(false);
        if (r.parseError) setToast({ kind: 'err', text: `on-disk skills.dat is unreadable (${r.parseError}) — showing the compiled table` });
      })
      .catch((e) => setToast({ kind: 'err', text: (e as Error).message }));
  };

  useEffect(() => {
    api
      .capabilities()
      .then((c) => setWriteEnabled(c.writeEnabled))
      .catch(() => setWriteEnabled(false));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => (skills ? { skills } : null), [skills]);
  const summary = useMemo(() => (model ? validateSkills(model) : { errors: [], warnings: [] }), [model]);
  const emitted = useMemo(() => {
    if (!model || summary.errors.length > 0) return null;
    try {
      return emitSkillsFile(model);
    } catch {
      return null;
    }
  }, [model, summary]);

  const skill = skills?.find((s) => s.name === selected) ?? null;
  const stock = selected !== null ? stockSkill(selected) : undefined;

  const update = (next: SkillEntry) => {
    if (!skills) return;
    setSkills(skills.map((s) => (s.name === next.name ? next : s)));
  };

  const save = async () => {
    if (!skills) return;
    try {
      const r = await api.saveSkills(skills, baseHash);
      setSource('overlay');
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: `skills.dat saved — ${r.note}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        return;
      }
      setToast({ kind: 'err', text: (e as Error).message });
    }
  };

  const conflictSaveAnyway = async () => {
    if (!skills) return;
    if (!window.confirm('Overwrite the other save of skills.dat with yours? Theirs is backed up first.')) return;
    try {
      const r = await api.saveSkills(skills); // no baseHash = unconditional
      setSource('overlay');
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: `skills.dat saved — ${r.note}` });
    } catch (e) {
      setToast({ kind: 'err', text: (e as Error).message });
    }
  };

  const revert = async () => {
    if (!window.confirm('Remove skills.dat and return to the compiled stock table at the next copyover?')) return;
    try {
      await api.deleteSkills();
      setSkills(stockSkillsFile().skills);
      setSource('stock');
      setBaseHash(null);
      setToast({ kind: 'ok', text: 'overlay removed — the compiled table returns at the next copyover' });
    } catch (e) {
      setToast({ kind: 'err', text: (e as Error).message });
    }
  };

  const download = () => {
    if (!emitted) return;
    const url = URL.createObjectURL(new Blob([emitted], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skills.dat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyManual = () => {
    try {
      const parsed = parseSkillsFile(manualText);
      const check = validateSkills(parsed);
      if (check.errors.length > 0) {
        setToast({ kind: 'err', text: `manual text invalid: ${check.errors[0]}` });
        return;
      }
      setSkills(parsed.skills);
      setManualOpen(false);
      setToast({ kind: 'ok', text: 'manual text applied to the forms' });
    } catch (e) {
      setToast({ kind: 'err', text: (e as Error).message });
    }
  };

  const shown = (skills ?? []).filter((s) => s.name.includes(filter.toLowerCase()));

  return (
    <div className="mb-areas">
      {toast && (
        <p className={`mb-toast ${toast.kind === 'err' ? 'mb-toast--err' : ''}`} onClick={() => setToast(null)}>
          {toast.text}
        </p>
      )}
      <main className="mb-area-main">
        <h3>Skills &amp; spells</h3>
        <div className="mb-entity-actions">
          <button type="button" className={view === 'skills' ? 'mb-active' : ''} onClick={() => setView('skills')}>
            Skills &amp; spells
          </button>
          <button type="button" className={view === 'groups' ? 'mb-active' : ''} onClick={() => setView('groups')}>
            Groups
          </button>
          <button type="button" className={view === 'codegen' ? 'mb-active' : ''} onClick={() => setView('codegen')}>
            New spell (codegen)
          </button>
        </div>

        {view === 'groups' && <GroupsView writeEnabled={writeEnabled} />}
        {view === 'codegen' && <CodegenView writeEnabled={writeEnabled} />}

        {view === 'skills' && (
          <p className="mb-muted">
            Edits the game&apos;s skill/spell DATA (skills.dat) — currently showing the{' '}
            {source === 'overlay' ? 'authored overlay' : 'compiled stock table'}. Changes load at boot only: run a{' '}
            <strong>copyover</strong> to apply. Names, slots and gsn wiring are compiled into the game and read-only.
          </p>
        )}

        {view === 'skills' && !skills && <p className="mb-muted">Loading…</p>}

        {view === 'skills' && skills && (
          <>
            {conflict && <ConflictPanel file="skills.dat" onReload={load} onSaveAnyway={conflictSaveAnyway} />}
            <div className="mb-entity-actions">
              <button type="button" onClick={save} disabled={!writeEnabled || summary.errors.length > 0}>
                Save skills.dat
              </button>
              <button type="button" onClick={download} disabled={!emitted}>
                Download
              </button>
              <button type="button" onClick={() => { setManualText(emitted ?? ''); setManualOpen(!manualOpen); }} disabled={!emitted && !manualOpen}>
                {manualOpen ? 'Close manual edit' : 'Manual edit'}
              </button>
              {source === 'overlay' && writeEnabled && (
                <button type="button" className="mb-danger" onClick={revert}>
                  Remove overlay (revert to stock)
                </button>
              )}
              {!writeEnabled && <span className="mb-muted">writes disabled — preview/download only</span>}
            </div>

            {summary.errors.map((e) => (
              <p key={e} className="mb-world-error">
                {e}
              </p>
            ))}
            {summary.warnings.map((w) => (
              <p key={w} className="mb-warning">
                ⚠ {w}
              </p>
            ))}

            {manualOpen ? (
              <fieldset className="mb-fieldset">
                <legend>Manual edit — skills.dat (exact generated text)</legend>
                <textarea
                  aria-label="skills.dat text"
                  rows={24}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
                <div className="mb-entity-actions">
                  <button type="button" onClick={applyManual}>
                    Apply to forms
                  </button>
                </div>
              </fieldset>
            ) : (
              <div className="mb-editor-split">
                <nav className="mb-room-list">
                  <h4>Skills ({skills.length})</h4>
                  <input aria-label="Filter skills" placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  <ul>
                    {shown.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          className={s.name === selected ? 'mb-active' : ''}
                          onClick={() => setSelected(s.name)}
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                <section>
                  {!skill && <p className="mb-muted">Select a skill or spell to edit its data.</p>}
                  {skill && (
                    <fieldset className="mb-fieldset">
                      <legend>
                        {skill.name}
                        {stock && (
                          <span className="mb-muted">
                            {' '}
                            · slot {stock.slot}
                            {stock.hasGsn ? ' · gsn-bound' : ''} (compiled-in)
                          </span>
                        )}
                      </legend>

                      <div className="mb-form-grid">
                        <label className="mb-field">
                          <span>Spell function</span>
                          <select
                            aria-label="Spell function"
                            value={skill.spellFun}
                            onChange={(e) => update({ ...skill, spellFun: e.target.value })}
                          >
                            {SKILL_SPELL_FUNS.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mb-field">
                          <span>Target</span>
                          <select
                            aria-label="Target"
                            value={skill.target}
                            onChange={(e) => update({ ...skill, target: Number(e.target.value) })}
                          >
                            {Object.entries(TARGET_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mb-field">
                          <span>Minimum position</span>
                          <select
                            aria-label="Minimum position"
                            value={skill.position}
                            onChange={(e) => update({ ...skill, position: Number(e.target.value) })}
                          >
                            {Object.entries(POSITION_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <NumField label="Min mana" value={skill.minMana} onChange={(n) => update({ ...skill, minMana: n })} />
                        <NumField label="Beats (wait)" value={skill.beats} onChange={(n) => update({ ...skill, beats: n })} />
                      </div>

                      <div className="mb-form-grid">
                        {CLASS_NAMES.map((c, i) => (
                          <NumField
                            key={c}
                            label={`${c} level`}
                            value={skill.levels[i]}
                            onChange={(n) => update({ ...skill, levels: skill.levels.map((v, j) => (j === i ? n : v)) })}
                          />
                        ))}
                        {CLASS_NAMES.map((c, i) => (
                          <NumField
                            key={c}
                            label={`${c} rating`}
                            value={skill.ratings[i]}
                            onChange={(n) => update({ ...skill, ratings: skill.ratings.map((v, j) => (j === i ? n : v)) })}
                          />
                        ))}
                      </div>

                      <div className="mb-form-grid">
                        <TextField label="Damage noun" value={skill.nounDamage} onChange={(t) => update({ ...skill, nounDamage: t })} />
                        <TextField label="Wear-off message" value={skill.msgOff} onChange={(t) => update({ ...skill, msgOff: t })} />
                        <label className="mb-field">
                          <span>Object wear-off unset</span>
                          <input
                            aria-label="Object wear-off unset"
                            type="checkbox"
                            checked={skill.msgObj === null}
                            onChange={(e) => update({ ...skill, msgObj: e.target.checked ? null : '' })}
                          />
                        </label>
                        {skill.msgObj !== null && (
                          <TextField
                            label="Object wear-off message"
                            value={skill.msgObj}
                            onChange={(t) => update({ ...skill, msgObj: t })}
                          />
                        )}
                      </div>
                    </fieldset>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
